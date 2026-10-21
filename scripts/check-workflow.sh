#!/bin/sh
# Fails when the CI workflow's publication path loses an invariant:
#   - publish runs only for pushes to main;
#   - publish has a literal concurrency group (no expression, so every run
#     shares it) and cancel-in-progress: false, so publishes on main run one at
#     a time (with the head-of-main check in scripts/publish.sh, this is what
#     orders concurrent runs);
#   - publish needs every other job, and the image job builds the image, smoke
#     tests it, scans it with Trivy, exports its image ID and uploads it;
#   - publish downloads that same artifact, loads it and never builds an
#     image itself;
#   - publish reads the loaded image's ID with docker image inspect, stops
#     with exit 1 when it is not the tested ID, and calls scripts/publish.sh
#     with exactly that verified ID.
#
#   scripts/check-workflow.sh [WORKFLOW]   (default .github/workflows/ci.yml)
#
# The checks read the YAML as text, job by job, with comments removed first so
# a commented-out line can never satisfy them. The workflow is written in the
# plain block style they expect, and the fixtures in check-workflow_test.sh
# pin that down.
set -eu

workflow=${1:-.github/workflows/ci.yml}
if [ ! -f "$workflow" ]; then
  echo "check-workflow: $workflow not found" >&2
  exit 1
fi

problems=0
report() {
  echo "check-workflow: $1" >&2
  problems=$((problems + 1))
}

# uncommented prints the workflow without comments: whole comment lines are
# dropped and a " #" comment at the end of a line is cut off. The workflow
# quotes no "#" in the jobs these checks read.
uncommented() {
  sed -e '/^[[:space:]]*#/d' -e 's/[[:space:]]#.*$//' "$workflow"
}

# job NAME prints the lines of one job under `jobs:`, from its key up to the
# next job key at the same indentation.
job() {
  uncommented | awk -v name="$1" '
    /^jobs:[[:space:]]*$/ { in_jobs = 1; next }
    in_jobs && /^[^[:space:]]/ { in_jobs = 0 }
    in_jobs && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { current = $1; sub(/:$/, "", current) }
    in_jobs && current == name { print }
  '
}

# jobs prints the name of every job, one per line.
jobs() {
  uncommented | awk '
    /^jobs:[[:space:]]*$/ { in_jobs = 1; next }
    in_jobs && /^[^[:space:]]/ { in_jobs = 0 }
    in_jobs && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { name = $1; sub(/:$/, "", name); print name }
  '
}

# has TEXT LITERAL reports whether TEXT contains LITERAL.
has() {
  case $1 in
    *"$2"*) return 0 ;;
    *) return 1 ;;
  esac
}

# artifact_name TEXT ACTION prints the `name:` given to the first step in TEXT
# that uses ACTION (for example actions/upload-artifact@), or nothing.
artifact_name() {
  printf '%s\n' "$1" | awk -v action="uses: $2" '
    index($0, action) { found = 1; next }
    found && /^[[:space:]]+name:/ { sub(/^[[:space:]]+name:[[:space:]]*/, ""); print; exit }
    found && /^[[:space:]]+- / { exit }
  '
}

# matches TEXT REGEX reports whether a line of TEXT matches the extended REGEX.
matches() {
  printf '%s\n' "$1" | grep -qE -- "$2"
}

# has_line TEXT LINE reports whether TEXT has a line that is exactly LINE,
# ignoring indentation and trailing spaces.
has_line() {
  printf '%s\n' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | grep -qxF -- "$2"
}

# block_has TEXT START LITERAL reports whether LITERAL appears in TEXT between
# the line containing START and the next line that is only "fi".
block_has() {
  printf '%s\n' "$1" | awk -v start="$2" -v want="$3" '
    index($0, start) { inside = 1; next }
    inside && /^[[:space:]]*fi[[:space:]]*$/ { exit }
    inside && index($0, want) { found = 1; exit }
    END { exit !found }
  '
}

if ! publish=$(job publish) || [ -z "$publish" ]; then
  report "the workflow has no publish job"
  publish=
fi
if ! image=$(job image) || [ -z "$image" ]; then
  report "the workflow has no image job"
  image=
fi

# GitHub expressions the workflow must contain verbatim, so not expanded here.
# shellcheck disable=SC2016
id='${{ needs.image.outputs.image-id }}'
# shellcheck disable=SC2016
image_output='image-id: ${{ steps.build.outputs.image-id }}'
# shellcheck disable=SC2016
inspect='loaded="$(docker image inspect --format '"'"'{{.Id}}'"'"' sezzle-calculator:ci)"'

if [ -n "$publish" ]; then
  # Runs only for pushes to main: exactly this condition, on the job itself.
  matches "$publish" "^    if: github\.event_name == 'push' && github\.ref == 'refs/heads/main'[[:space:]]*\$" ||
    report "publish must run only for pushes to main"

  # One publish at a time, never cancelled half way. The group is a literal:
  # an expression such as publish-\${{ github.sha }} gives every run its own
  # group and serializes nothing.
  if ! { matches "$publish" '^    concurrency:[[:space:]]*$' && matches "$publish" '^      group:[[:space:]]*[A-Za-z0-9_.-]+[[:space:]]*$'; }; then
    report "publish must have a concurrency group with a literal name"
  fi
  matches "$publish" '^      cancel-in-progress:[[:space:]]*false[[:space:]]*$' ||
    report "publish must set cancel-in-progress: false, so a publish in progress is never cancelled"

  # Depends on every other job, so nothing is published unless all of them pass.
  needs=$(printf '%s\n' "$publish" | sed -n 's/^    needs:[[:space:]]*\[\(.*\)\][[:space:]]*$/\1/p' | tr -d ' ' | tr ',' '\n')
  missing=
  for other in $(jobs); do
    [ "$other" = publish ] && continue
    printf '%s\n' "$needs" | grep -qx -- "$other" || missing="$missing $other"
  done
  [ -z "$missing" ] ||
    report "publish must need every other job (needs: [a, b, ...]); missing:$missing"

  # Loads the tested artifact and never builds one.
  if ! { has "$publish" 'uses: actions/download-artifact@' && has "$publish" 'docker load'; }; then
    report "publish must download and load the tested image artifact"
  fi
  matches "$publish" 'docker([[:space:]]+buildx)?[[:space:]]+build|build-push-action|compose[[:space:]]+build' &&
    report "publish must not build an image; it publishes the tested artifact"

  # Reads the ID of the image it loaded, stops when it is not the tested ID,
  # and publishes exactly that ID.
  has_line "$publish" "$inspect" ||
    report "publish must read the loaded image ID with docker image inspect"
  check="if [ \"\$loaded\" != \"$id\" ]; then"
  if ! has "$publish" "$check"; then
    report "publish must verify that the loaded image is the tested image ID"
  elif ! block_has "$publish" "$check" 'exit 1'; then
    report "publish must exit 1 when the loaded image is not the tested image ID"
  fi
  has "$publish" "scripts/publish.sh \"$id\" " ||
    report "publish must call scripts/publish.sh with the verified image ID"
fi

if [ -n "$image" ]; then
  matches "$image" 'docker build ' || report "the image job must build the image"
  has "$image" 'scripts/smoke-test.sh' || report "the image job must smoke test the image"
  has "$image" 'uses: aquasecurity/trivy-action@' || report "the image job must scan the image with Trivy"
  has "$image" "$image_output" || report "the image job must export the built image ID"
  uploaded=$(artifact_name "$image" actions/upload-artifact@)
  [ -n "$uploaded" ] || report "the image job must upload the tested image"
fi

if [ -n "$publish" ] && [ -n "${uploaded:-}" ]; then
  downloaded=$(artifact_name "$publish" actions/download-artifact@)
  [ "$downloaded" = "$uploaded" ] ||
    report "publish must download the artifact the image job uploaded ('$uploaded', not '$downloaded')"
fi

if [ "$problems" -ne 0 ]; then
  echo "check-workflow: $problems problem(s) found in $workflow" >&2
  exit 1
fi
echo "check-workflow: the publication path in $workflow keeps its invariants"
