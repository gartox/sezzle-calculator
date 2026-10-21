#!/bin/sh
# Tests scripts/publish.sh against fakes on PATH: curl plays the registry's
# token endpoint and OCI distribution API, docker records tag, push and pull,
# and gh answers the head of main. A tiny registry in a state directory is
# shared by the fake docker (push adds a tag) and the fake curl (lookups read
# it), so a case can run publish twice to model a rerun.
#
#   scripts/publish_test.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

REPO=ghcr.io/gartox/sezzle-calculator
COMMIT=0123456789abcdef0123456789abcdef01234567
DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
IMAGE=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
GITHUB_SECRET=github-token-must-not-leak
PULL_SECRET=pull-token-must-not-leak

mkdir -p "$work/bin"

# Fake curl. Reads its --config from stdin like the real one, checks the
# credentials there, and answers from FAKE_TOKEN (the token endpoint) and
# FAKE_LOOKUP or FAKE_LOOKUP_<n> (the nth manifest lookup of a run).
cat >"$work/bin/curl" <<'FAKE'
#!/bin/sh
echo "curl $*" >>"$FAKE_STATE/calls"
config=
output=/dev/null
headers=/dev/null
url=
while [ $# -gt 0 ]; do
  case $1 in
    --config) [ "$2" = - ] && config=$(cat); shift 2 ;;
    --output) output=$2; shift 2 ;;
    --dump-header) headers=$2; shift 2 ;;
    --write-out | --header | --max-time) shift 2 ;;
    https://*) url=$1; shift ;;
    *) shift ;;
  esac
done
errors() { printf '{"errors":[{"code":"%s","message":"%s"}]}' "$1" "$2" >"$output"; }
case $url in
  https://ghcr.io/token\?*)
    case ${FAKE_TOKEN:-ok} in
      timeout) echo "curl: (28) Operation timed out after 30000 milliseconds" >&2; exit 28 ;;
      unauthorized) errors UNAUTHORIZED "authentication required"; printf 401; exit 0 ;;
    esac
    case $config in
      *"user = \"tester:$FAKE_GITHUB_TOKEN\""*) ;;
      *) errors UNAUTHORIZED "no credentials"; printf 401; exit 0 ;;
    esac
    printf '{"token":"%s"}' "$FAKE_PULL_TOKEN" >"$output"
    printf 200
    ;;
  https://ghcr.io/v2/gartox/sezzle-calculator/manifests/*)
    tag=${url##*/manifests/}
    count=$(($(cat "$FAKE_STATE/lookups" 2>/dev/null || echo 0) + 1))
    echo "$count" >"$FAKE_STATE/lookups"
    mode=$(eval "echo \"\${FAKE_LOOKUP_$count:-\${FAKE_LOOKUP:-registry}}\"")
    case $config in
      *"Authorization: Bearer $FAKE_PULL_TOKEN"*) ;;
      *) mode=unauthorized ;;
    esac
    case $mode in
      unauthorized) errors UNAUTHORIZED "authentication required"; printf 401 ;;
      forbidden) errors DENIED "requested access to the resource is denied"; printf 403 ;;
      rate-limited) errors TOOMANYREQUESTS "rate limit exceeded"; printf 429 ;;
      server-error) printf 'upstream error' >"$output"; printf 503 ;;
      timeout) echo "curl: (28) Operation timed out after 30000 milliseconds" >&2; exit 28 ;;
      name-unknown) errors NAME_UNKNOWN "repository name not known to registry"; printf 404 ;;
      other-404) errors BLOB_UNKNOWN "blob unknown to registry"; printf 404 ;;
      mixed-404) printf '{"errors":[{"code":"MANIFEST_UNKNOWN"},{"code":"NAME_UNKNOWN"}]}' >"$output"; printf 404 ;;
      empty-404) : >"$output"; printf 404 ;;
      no-digest) printf 'HTTP/2 200\r\ncontent-type: application/json\r\n\r\n' >"$headers"; printf 200 ;;
      exit-empty) echo "curl: (7) Failed to connect to ghcr.io port 443" >&2; exit 7 ;;
      partial) printf 'HTTP/2 200\r\ndocker-con' >"$headers"; printf 20; echo "curl: (18) transfer closed with outstanding read data remaining" >&2; exit 18 ;;
      # Complete headers with a valid digest and a 200 on stdout, then the
      # body is cut off: only the exit status says the lookup failed.
      partial-200)
        printf 'HTTP/2 200\r\ndocker-content-digest: %s\r\n\r\n' "$FAKE_DIGEST" >"$headers"
        printf '{"schemaVer' >"$output"
        printf 200
        echo "curl: (18) transfer closed with outstanding read data remaining" >&2
        exit 18
        ;;
      registry)
        if [ -f "$FAKE_STATE/registry/$tag" ]; then
          printf 'HTTP/2 200\r\ncontent-type: application/vnd.oci.image.index.v1+json\r\ndocker-content-digest: %s\r\n\r\n' "$FAKE_DIGEST" >"$headers"
          printf '{"schemaVersion":2}' >"$output"
          printf 200
        else
          errors MANIFEST_UNKNOWN "manifest unknown"
          printf 404
        fi
        ;;
      *) echo "fake curl: unknown mode $mode" >&2; exit 99 ;;
    esac
    ;;
  *) echo "fake curl: unexpected URL $url" >&2; exit 99 ;;
esac
FAKE

# Fake docker. `docker manifest` is a test failure: the lookup must go
# through the registry API.
cat >"$work/bin/docker" <<'FAKE'
#!/bin/sh
echo "docker $*" >>"$FAKE_STATE/calls"
cmd=$1
shift
case $cmd in
  tag | pull) exit 0 ;;
  push)
    ref=$1
    case $ref in
      *:latest)
        if [ -n "${FAKE_FAIL_LATEST_ONCE:-}" ] && [ ! -f "$FAKE_STATE/latest-failed" ]; then
          touch "$FAKE_STATE/latest-failed"
          echo "denied: transient registry failure" >&2
          exit 1
        fi
        ;;
    esac
    touch "$FAKE_STATE/registry/${ref##*:}"
    ;;
  *) echo "fake docker: unexpected command $cmd" >&2; exit 1 ;;
esac
FAKE

# Fake gh: answers the head of main, or fails when FAKE_GH_FAIL is set.
cat >"$work/bin/gh" <<'FAKE'
#!/bin/sh
echo "gh $*" >>"$FAKE_STATE/calls"
if [ -n "${FAKE_GH_FAIL:-}" ]; then
  echo "HTTP 502: Bad Gateway" >&2
  exit 1
fi
echo "$FAKE_HEAD"
FAKE
chmod +x "$work/bin/curl" "$work/bin/docker" "$work/bin/gh"

passed=0
failed=0

# new_state starts a case: an empty fake registry; "present" seeds the tag.
new_state() {
  FAKE_STATE="$work/state-$1"
  rm -rf "$FAKE_STATE"
  mkdir -p "$FAKE_STATE/registry"
  : >"$FAKE_STATE/calls"
  if [ "${2:-}" = present ]; then
    touch "$FAKE_STATE/registry/$COMMIT"
  fi
}

# publish runs the script under test with the fakes first on PATH and records
# its exit status in $status. Fixture settings are NAME=value arguments.
publish() {
  : >"$FAKE_STATE/calls"
  rm -f "$FAKE_STATE/lookups"
  status=0
  env PATH="$work/bin:$PATH" FAKE_STATE="$FAKE_STATE" FAKE_DIGEST="$DIGEST" \
    FAKE_HEAD="$COMMIT" FAKE_GITHUB_TOKEN="$GITHUB_SECRET" FAKE_PULL_TOKEN="$PULL_SECRET" \
    GITHUB_TOKEN="$GITHUB_SECRET" GITHUB_ACTOR=tester GITHUB_REPOSITORY=gartox/sezzle-calculator \
    GITHUB_ACTIONS= "$@" \
    "$here/publish.sh" "$IMAGE" "$COMMIT" "$REPO" >"$FAKE_STATE/out" 2>&1 || status=$?
}

# check NAME ASSERTION ARGS... runs one assertion command and records it.
check() {
  name=$1
  shift
  if "$@"; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $name"
    echo "  expected: $*"
    echo "  calls:"
    sed 's/^/    /' "$FAKE_STATE/calls"
    echo "  output:"
    sed 's/^/    /' "$FAKE_STATE/out"
  fi
}
exited() { [ "$status" -eq "$1" ]; }
failed_run() { [ "$status" -ne 0 ]; }
called() { grep -qxF "$1" "$FAKE_STATE/calls"; }
not_called() { ! grep -qF "$1" "$FAKE_STATE/calls"; }
nothing_called() { [ ! -s "$FAKE_STATE/calls" ]; }
said() { grep -qF "$1" "$FAKE_STATE/out"; }
lookups() { [ "$(cat "$FAKE_STATE/lookups" 2>/dev/null || echo 0)" -eq "$1" ]; }
never_leaks() { ! grep -qF -e "$GITHUB_SECRET" -e "$PULL_SECRET" "$FAKE_STATE/calls" "$FAKE_STATE/out"; }
masked_once() { [ "$(grep -cF "$PULL_SECRET" "$FAKE_STATE/out")" -eq 1 ]; }

tagged_commit="docker tag $IMAGE $REPO:$COMMIT"
pushed_commit="docker push $REPO:$COMMIT"
pulled_digest="docker pull --quiet $REPO@$DIGEST"
pointed_latest="docker tag $REPO@$DIGEST $REPO:latest"
pushed_latest="docker push $REPO:latest"

# 1. Absent: 404 MANIFEST_UNKNOWN, so the commit tag is pushed, looked up
#    again for its digest, and latest is pointed at that digest.
new_state absent
publish
check "absent: exits 0" exited 0
check "absent: tags the verified image" called "$tagged_commit"
check "absent: pushes the commit tag" called "$pushed_commit"
check "absent: looks the tag up again after pushing" lookups 2
check "absent: pulls the published digest" called "$pulled_digest"
check "absent: points latest at that digest" called "$pointed_latest"
check "absent: pushes latest" called "$pushed_latest"
check "absent: never uses docker manifest" not_called "docker manifest"
check "absent: keeps both tokens out of argv and output" never_leaks

# 2. Present: 200 with a digest, so nothing is pushed and promotion happens.
new_state present present
publish
check "present: exits 0" exited 0
check "present: does not push the commit tag" not_called "$pushed_commit"
check "present: does not retag the local image" not_called "$tagged_commit"
check "present: promotes the registry's digest" called "$pointed_latest"
check "present: pushes latest" called "$pushed_latest"

# 3. Every other lookup answer fails closed, whether or not the tag exists:
#    nothing is tagged, pushed or promoted.
for seed in absent present; do
  for mode in unauthorized forbidden rate-limited server-error timeout other-404 mixed-404 empty-404 exit-empty partial partial-200; do
    new_state "lookup-$mode-$seed" "$seed"
    publish FAKE_LOOKUP="$mode"
    check "lookup $mode, tag $seed: fails" failed_run
    check "lookup $mode, tag $seed: tags and pushes nothing" not_called "docker "
    check "lookup $mode, tag $seed: says nothing was pushed" said "nothing was pushed"
  done
done

# 3b. First publication: the repository does not exist yet, so the first
#     lookup answers 404 NAME_UNKNOWN. That proves absence: the image is
#     pushed, looked up again, and promoted.
new_state first-publication
publish FAKE_LOOKUP_1=name-unknown
check "first publication: exits 0" exited 0
check "first publication: pushes the commit tag" called "$pushed_commit"
check "first publication: looks the tag up again after pushing" lookups 2
check "first publication: points latest at the published digest" called "$pointed_latest"
check "first publication: pushes latest" called "$pushed_latest"

# 3c. NAME_UNKNOWN is only reachable with a token: if the token request fails,
#     the run stops before any lookup, whatever the registry would answer.
new_state first-publication-no-token
publish FAKE_TOKEN=unauthorized FAKE_LOOKUP=name-unknown
check "first publication without a token: fails" failed_run
check "first publication without a token: does not look anything up" lookups 0
check "first publication without a token: pushes nothing" not_called "docker "

# 4. The token request fails: no lookup, nothing pushed.
for mode in unauthorized timeout; do
  new_state "token-$mode"
  publish FAKE_TOKEN="$mode"
  check "token $mode: fails" failed_run
  check "token $mode: does not look anything up" lookups 0
  check "token $mode: pushes nothing" not_called "docker "
done

# 5. Wrong credentials are rejected by the fake registry, so a run that sent
#    the token on argv or not at all would fail here.
new_state wrong-credentials
publish GITHUB_TOKEN=some-other-token
check "wrong credentials: fails" failed_run
check "wrong credentials: pushes nothing" not_called "docker "

# 6. Resolving the digest fails after the push: non-zero exit with empty
#    output, non-zero exit with partial output, or a 200 without a digest.
#    The script must stop before promoting.
for mode in exit-empty partial partial-200 no-digest; do
  new_state "digest-$mode"
  publish FAKE_LOOKUP_2="$mode"
  check "digest $mode after push: fails" failed_run
  check "digest $mode after push: had pushed the commit tag" called "$pushed_commit"
  check "digest $mode after push: does not promote" not_called "$REPO:latest"
done
new_state digest-missing-present present
publish FAKE_LOOKUP=no-digest
check "present without a digest: fails" failed_run
check "present without a digest: does not promote" not_called "$REPO:latest"

# 7. This commit is no longer the head of main: latest does not move.
new_state not-head
publish FAKE_HEAD=fedcba9876543210fedcba9876543210fedcba98
check "not head: exits 0" exited 0
check "not head: still publishes the commit tag" called "$pushed_commit"
check "not head: does not move latest" not_called "$REPO:latest"
check "not head: says latest stays" said "latest stays where it is"

# 8. The head check itself fails: the job fails so a rerun can promote.
new_state head-check-fails
publish FAKE_GH_FAIL=1
check "head check fails: fails" failed_run
check "head check fails: does not move latest" not_called "$REPO:latest"

# 9. Promotion fails once; the rerun finds the tag, skips the push and
#    finishes the promotion.
new_state recover
publish FAKE_FAIL_LATEST_ONCE=1
check "recover, first run: fails" failed_run
check "recover, first run: pushed the commit tag" called "$pushed_commit"
publish FAKE_FAIL_LATEST_ONCE=1
check "recover, rerun: exits 0" exited 0
check "recover, rerun: does not push the commit tag again" not_called "$pushed_commit"
check "recover, rerun: points latest at the published digest" called "$pointed_latest"
check "recover, rerun: pushes latest" called "$pushed_latest"

# 10. In Actions the pull token is masked; it appears only on the mask line.
new_state masked
publish GITHUB_ACTIONS=true
check "masked: exits 0" exited 0
check "masked: registers the token as a secret" said "::add-mask::$PULL_SECRET"
check "masked: the token appears nowhere else" masked_once

# 11. Bad input is refused before anything runs.
new_state bad-commit
status=0
env PATH="$work/bin:$PATH" FAKE_STATE="$FAKE_STATE" GITHUB_TOKEN=x GITHUB_REPOSITORY=gartox/sezzle-calculator \
  "$here/publish.sh" "$IMAGE" not-a-sha "$REPO" >"$FAKE_STATE/out" 2>&1 || status=$?
check "bad commit: fails" failed_run
check "bad commit: calls nothing" nothing_called
new_state no-token
status=0
env PATH="$work/bin:$PATH" FAKE_STATE="$FAKE_STATE" GITHUB_TOKEN= GITHUB_REPOSITORY=gartox/sezzle-calculator \
  "$here/publish.sh" "$IMAGE" "$COMMIT" "$REPO" >"$FAKE_STATE/out" 2>&1 || status=$?
check "no GITHUB_TOKEN: fails" failed_run
check "no GITHUB_TOKEN: calls nothing" nothing_called

echo "publish_test: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
