#!/bin/sh
# Publishes the image CI built, smoke tested and scanned.
#
#   scripts/publish.sh IMAGE COMMIT REPOSITORY
#
#   IMAGE       the tested local image, by ID or name (CI passes the image ID it verified)
#   COMMIT      the full 40-character commit SHA; it becomes the commit tag
#   REPOSITORY  the registry repository, for example ghcr.io/gartox/sezzle-calculator
#
# Environment:
#   GITHUB_TOKEN        credentials for a registry pull token (never logged)
#   GITHUB_ACTOR        the user name sent with it (optional)
#   GITHUB_REPOSITORY   owner/name, used to read the head of main
#   DOCKER, CURL, GH    the commands to run (tests point them at fakes)
#   GITHUB_OUTPUT, GITHUB_STEP_SUMMARY   written when set, as in Actions
#
# Two independent steps, so a rerun always finishes the job:
#
# 1. Publish the commit tag. Whether it exists is asked of the registry's OCI
#    distribution API directly, not of `docker manifest inspect`, whose
#    "no such manifest" can follow an authorization error or an unexpected
#    response. Only HTTP 200 means present, and only a 404 whose sole error
#    code is MANIFEST_UNKNOWN or NAME_UNKNOWN means absent; anything else
#    (401, 403, 429, 5xx, a timeout, a 404 with another or mixed code) fails
#    before anything is pushed. The tag is pushed only when it is absent, so
#    it is never overwritten.
# 2. Promote. Resolve the digest the commit tag points at from the registry,
#    check that this commit is still the head of main, and only then point
#    latest at that digest. With the workflow's concurrency group, this check
#    is what stops an older run from moving latest backwards.
#
# Every command substitution is assigned on its own and checked, because
# `set -e` does not see a failure inside a substitution that is used as part
# of another command.
set -eu

DOCKER=${DOCKER:-docker}
CURL=${CURL:-curl}
GH=${GH:-gh}

fail() {
  echo "publish: $1" >&2
  exit 1
}

if [ $# -ne 3 ]; then
  echo "usage: $0 IMAGE COMMIT REPOSITORY" >&2
  exit 2
fi
image=$1
commit=$2
repo=$3
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be owner/name}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is needed for a registry pull token}"

case $commit in
  *[!0-9a-f]* | '') fail "COMMIT must be a lowercase hex SHA, got '$commit'" ;;
esac
[ ${#commit} -eq 40 ] || fail "COMMIT must be 40 characters, got ${#commit}"
case $repo in
  */*) ;;
  *) fail "REPOSITORY must be registry/owner/name, got '$repo'" ;;
esac
registry=${repo%%/*}
name=${repo#*/}
commit_ref="$repo:$commit"
latest_ref="$repo:latest"

work=$(mktemp -d) || fail "could not create a temporary directory"
trap 'rm -rf "$work"' EXIT

note() {
  echo "publish: $1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "$1" >>"$GITHUB_STEP_SUMMARY"
  fi
}

# registry_token prints a pull token for the repository. The credentials go
# to curl through --config on stdin, so they never appear in argv or logs.
registry_token() {
  if ! response=$(printf 'user = "%s:%s"\n' "${GITHUB_ACTOR:-publish}" "$GITHUB_TOKEN" |
    $CURL --silent --show-error --max-time 30 --config - \
      --output "$work/token.json" --write-out '%{http_code}' \
      "https://$registry/token?scope=repository:$name:pull&service=$registry"); then
    fail "could not reach $registry for a pull token; nothing was pushed"
  fi
  [ "$response" = 200 ] || fail "the token request to $registry returned HTTP $response; nothing was pushed"
  if ! token=$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$work/token.json"); then
    fail "could not read the token response"
  fi
  [ -n "$token" ] || fail "the token response from $registry had no token"
  printf '%s' "$token"
}

# lookup TAG sets $present (yes or no) and, when present, $digest, or fails.
lookup() {
  ref="$repo:$1"
  rm -f "$work/headers" "$work/body"
  accept='application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'
  if ! status=$(printf 'header = "Authorization: Bearer %s"\n' "$token" |
    $CURL --silent --show-error --max-time 30 --config - \
      --header "Accept: $accept" \
      --dump-header "$work/headers" --output "$work/body" --write-out '%{http_code}' \
      "https://$registry/v2/$name/manifests/$1"); then
    fail "the registry lookup of $ref did not complete; nothing was pushed"
  fi
  case $status in
    200)
      if ! digest=$(tr -d '\r' <"$work/headers" | awk 'tolower($1) == "docker-content-digest:" { d = $2 } END { print d }'); then
        fail "could not read the digest of $ref"
      fi
      printf '%s' "$digest" | grep -qE '^sha256:[0-9a-f]{64}$' ||
        fail "the registry returned no valid Docker-Content-Digest for $ref"
      present=yes
      ;;
    404)
      if ! codes=$(grep -oE '"code"[[:space:]]*:[[:space:]]*"[A-Z_]+"' "$work/body" | sed 's/.*"\([A-Z_]*\)"$/\1/' | sort -u); then
        codes=
      fi
      # NAME_UNKNOWN (the repository does not exist yet, as on the very first publication) proves absence like MANIFEST_UNKNOWN; it is only reachable with a token that was obtained successfully.
      if [ "$codes" != MANIFEST_UNKNOWN ] && [ "$codes" != NAME_UNKNOWN ]; then
        listed=$(printf '%s' "$codes" | tr '\n' ' ')
        fail "the registry answered 404 for $ref with error code(s) '$listed', not MANIFEST_UNKNOWN or NAME_UNKNOWN; nothing was pushed"
      fi
      present=no
      ;;
    *) fail "the registry answered HTTP $status for $ref; nothing was pushed" ;;
  esac
}

if ! token=$(registry_token); then
  exit 1
fi
if [ "${GITHUB_ACTIONS:-}" = true ]; then
  echo "::add-mask::$token"
fi

# Step 1: the commit tag.
lookup "$commit"
if [ "$present" = yes ]; then
  note "$commit_ref already exists; commit tags are never overwritten."
else
  $DOCKER tag "$image" "$commit_ref"
  $DOCKER push "$commit_ref"
  note "Pushed $commit_ref."
  lookup "$commit"
  [ "$present" = yes ] || fail "$commit_ref was pushed but the registry does not show it"
fi
digest_ref="$repo@$digest"
note "$commit_ref is $digest_ref."
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "digest=$digest_ref" >>"$GITHUB_OUTPUT"
fi

# Step 2: promote the published digest while this commit is the head of main.
if ! head=$($GH api "repos/$GITHUB_REPOSITORY/commits/main" --jq .sha); then
  fail "could not read the head of main, so latest was not moved; rerun to promote"
fi
if [ "$head" != "$commit" ]; then
  note "main is now at $head; latest stays where it is."
  exit 0
fi
$DOCKER pull --quiet "$digest_ref" >/dev/null
$DOCKER tag "$digest_ref" "$latest_ref"
$DOCKER push "$latest_ref"
note "Moved latest to $digest_ref."
