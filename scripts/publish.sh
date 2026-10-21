#!/bin/sh
# Publishes the image CI built, smoke tested and scanned.
#
#   scripts/publish.sh IMAGE COMMIT REPOSITORY
#
#   IMAGE       the tested local image, for example sezzle-calculator:ci
#   COMMIT      the full 40-character commit SHA; it becomes the commit tag
#   REPOSITORY  the registry repository, for example ghcr.io/gartox/sezzle-calculator
#
# Environment:
#   GITHUB_REPOSITORY   owner/name, used to read the head of main
#   DOCKER, GH          the docker and gh commands (tests point them at fakes)
#   GITHUB_OUTPUT, GITHUB_STEP_SUMMARY   written when set, as in Actions
#
# Two independent steps, so a rerun always finishes the job:
#
# 1. Publish the commit tag. It is never overwritten: the script pushes only
#    after the registry positively answers that the tag does not exist, and
#    fails on any other lookup error (auth, timeout, 5xx, unreadable format),
#    so a transient failure can never turn into an overwrite.
# 2. Promote. It always resolves the digest the commit tag points at in the
#    registry, checks that this commit is still the head of main, and only
#    then points latest at that digest. With the workflow's concurrency group,
#    this check is what stops an older run from moving latest backwards.
set -eu

DOCKER=${DOCKER:-docker}
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

case $commit in
  *[!0-9a-f]* | '') fail "COMMIT must be a lowercase hex SHA, got '$commit'" ;;
esac
[ ${#commit} -eq 40 ] || fail "COMMIT must be 40 characters, got ${#commit}"

commit_ref="$repo:$commit"
latest_ref="$repo:latest"

note() {
  echo "publish: $1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "$1" >>"$GITHUB_STEP_SUMMARY"
  fi
}

# Step 1: the commit tag.
if lookup=$($DOCKER manifest inspect "$commit_ref" 2>&1); then
  note "$commit_ref already exists; commit tags are never overwritten."
else
  # Only a single-line not-found answer counts as "absent": the Docker Hub
  # wording ("no such manifest: REF") or the OCI registry error code that
  # GHCR returns ("manifest unknown").
  lines=$(printf '%s\n' "$lookup" | wc -l | tr -d ' ')
  case $lookup in
    "no such manifest: $commit_ref" | "manifest unknown" | "manifest unknown: "*) absent=$((lines == 1)) ;;
    *) absent=0 ;;
  esac
  if [ "$absent" -ne 1 ]; then
    fail "could not tell whether $commit_ref exists, so nothing was pushed: $lookup"
  fi
  $DOCKER tag "$image" "$commit_ref"
  $DOCKER push "$commit_ref"
  note "Pushed $commit_ref."
fi

# Step 2: resolve the published digest, then promote it.
$DOCKER pull --quiet "$commit_ref" >/dev/null
digest_ref=
for candidate in $($DOCKER image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$commit_ref"); do
  case $candidate in
    "$repo@sha256:"*) digest_ref=$candidate ;;
  esac
done
[ -n "$digest_ref" ] || fail "could not resolve the digest of $commit_ref"
note "$commit_ref is $digest_ref."
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "digest=$digest_ref" >>"$GITHUB_OUTPUT"
fi

head=$($GH api "repos/$GITHUB_REPOSITORY/commits/main" --jq .sha) ||
  fail "could not read the head of main, so latest was not moved; rerun to promote"
if [ "$head" != "$commit" ]; then
  note "main is now at $head; latest stays where it is."
  exit 0
fi
$DOCKER tag "$digest_ref" "$latest_ref"
$DOCKER push "$latest_ref"
note "Moved latest to $digest_ref."
