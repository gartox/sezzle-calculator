#!/bin/sh
# Tests scripts/publish.sh against a fake docker and a fake gh on PATH. The
# fake docker records every call and keeps a tiny registry in a state
# directory, so a case can run publish twice to model a rerun.
#
#   scripts/publish_test.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

REPO=ghcr.io/gartox/sezzle-calculator
COMMIT=0123456789abcdef0123456789abcdef01234567
DIGEST=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

mkdir -p "$work/bin"

# Fake docker. FAKE_LOOKUP selects how "manifest inspect" fails when it is not
# answering from the fake registry; FAKE_FAIL_LATEST_ONCE makes the first push
# of latest fail.
cat >"$work/bin/docker" <<'FAKE'
#!/bin/sh
echo "docker $*" >>"$FAKE_STATE/calls"
key() { printf '%s' "$1" | tr '/:@' '___'; }
cmd=$1
shift
case $cmd in
  manifest)
    ref=$2
    case ${FAKE_LOOKUP:-registry} in
      unauthorized) echo "unauthorized: authentication required" >&2; exit 1 ;;
      timeout) echo 'Get "https://ghcr.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)' >&2; exit 1 ;;
      server-error) echo "received unexpected HTTP status: 503 Service Unavailable" >&2; exit 1 ;;
      unsupported) echo "unsupported manifest media type and no default available: application/vnd.oci.image.manifest.v1+json" >&2; exit 1 ;;
      not-found-and-more) printf 'manifest unknown\nunauthorized: authentication required\n' >&2; exit 1 ;;
    esac
    if [ -f "$FAKE_STATE/registry/$(key "$ref")" ]; then
      echo '{"schemaVersion": 2}'
      exit 0
    fi
    echo "${FAKE_NOT_FOUND:-manifest unknown}" | sed "s|REF|$ref|" >&2
    exit 1
    ;;
  tag) exit 0 ;;
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
    touch "$FAKE_STATE/registry/$(key "$ref")"
    echo "${ref##*:}: digest: sha256:$FAKE_DIGEST size: 1"
    ;;
  pull) exit 0 ;;
  image)
    for ref in "$@"; do :; done # the last argument is the image reference
    printf 'other.example/x@sha256:%s\n%s@sha256:%s\n' "$FAKE_DIGEST" "${ref%:*}" "$FAKE_DIGEST"
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
chmod +x "$work/bin/docker" "$work/bin/gh"

passed=0
failed=0

# new_state starts a case: an empty fake registry and call log.
new_state() {
  FAKE_STATE="$work/state-$1"
  rm -rf "$FAKE_STATE"
  mkdir -p "$FAKE_STATE/registry"
  : >"$FAKE_STATE/calls"
}

# publish runs the script under test with the fakes first on PATH and records
# its exit status in $status without stopping the test on failure. Fixture
# settings are passed as NAME=value arguments, for example FAKE_LOOKUP=timeout.
publish() {
  : >"$FAKE_STATE/calls"
  status=0
  env PATH="$work/bin:$PATH" FAKE_STATE="$FAKE_STATE" FAKE_DIGEST="$DIGEST" \
    FAKE_HEAD="$COMMIT" GITHUB_REPOSITORY=gartox/sezzle-calculator "$@" \
    "$here/publish.sh" sezzle-calculator:ci "$COMMIT" "$REPO" >"$FAKE_STATE/out" 2>&1 || status=$?
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
said() { grep -qF "$1" "$FAKE_STATE/out"; }

pushed_commit="docker push $REPO:$COMMIT"
pushed_latest="docker push $REPO:latest"
pointed_latest="docker tag $REPO@sha256:$DIGEST $REPO:latest"

# 1. Tag absent: the commit tag is pushed, then latest points at its digest.
new_state absent
publish
check "absent: exits 0" exited 0
check "absent: pushes the commit tag" called "$pushed_commit"
check "absent: points latest at the published digest" called "$pointed_latest"
check "absent: pushes latest" called "$pushed_latest"

# 1b. The Docker Hub wording of not found is recognized too.
new_state absent-hub-wording
publish FAKE_NOT_FOUND="no such manifest: REF"
check "hub wording: pushes the commit tag (1/2)" exited 0
check "hub wording: pushes the commit tag (2/2)" called "$pushed_commit"

# 2. Tag present: never pushed again, and promotion still happens.
new_state present
touch "$FAKE_STATE/registry/$(printf '%s' "$REPO:$COMMIT" | tr '/:@' '___')"
publish
check "present: exits 0" exited 0
check "present: does not push the commit tag" not_called "$pushed_commit"
check "present: still promotes latest (1/2)" called "$pointed_latest"
check "present: still promotes latest (2/2)" called "$pushed_latest"

# 3. Lookup errors fail closed: no tag, no push of anything.
for mode in unauthorized timeout server-error unsupported not-found-and-more; do
  new_state "lookup-$mode"
  publish FAKE_LOOKUP="$mode"
  check "lookup $mode: fails" failed_run
  check "lookup $mode: pushes nothing (1/2)" not_called "docker push"
  check "lookup $mode: pushes nothing (2/2)" not_called "docker tag"
  check "lookup $mode: says why" said "could not tell whether"
done

# 4. This commit is no longer the head of main: latest does not move.
new_state not-head
publish FAKE_HEAD=fedcba9876543210fedcba9876543210fedcba98
check "not head: exits 0" exited 0
check "not head: still publishes the commit tag" called "$pushed_commit"
check "not head: does not move latest (1/2)" not_called "$pushed_latest"
check "not head: does not move latest (2/2)" not_called "$REPO:latest"
check "not head: says latest stays" said "latest stays where it is"

# 5. The head check itself fails: the job fails so a rerun can promote.
new_state head-check-fails
publish FAKE_GH_FAIL=1
check "head check fails: fails" failed_run
check "head check fails: does not move latest" not_called "$pushed_latest"

# 6. Promotion fails once, then a rerun promotes without pushing the commit
#    tag again.
new_state recover
publish FAKE_FAIL_LATEST_ONCE=1
check "recover, first run: fails after pushing the commit tag (1/2)" failed_run
check "recover, first run: fails after pushing the commit tag (2/2)" called "$pushed_commit"
publish FAKE_FAIL_LATEST_ONCE=1
check "recover, rerun: exits 0" exited 0
check "recover, rerun: does not push the commit tag again" not_called "$pushed_commit"
check "recover, rerun: promotes latest (1/2)" called "$pointed_latest"
check "recover, rerun: promotes latest (2/2)" called "$pushed_latest"

# 7. Bad arguments are refused before anything runs.
new_state bad-args
status=0
env PATH="$work/bin:$PATH" FAKE_STATE="$FAKE_STATE" GITHUB_REPOSITORY=gartox/sezzle-calculator \
  "$here/publish.sh" sezzle-calculator:ci "not-a-sha" "$REPO" >"$FAKE_STATE/out" 2>&1 || status=$?
check "bad commit: fails without calling docker (1/2)" failed_run
check "bad commit: fails without calling docker (2/2)" not_called "docker"

echo "publish_test: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
