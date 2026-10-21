#!/bin/sh
# Fails when the CI workflow's publication path loses an invariant:
#   - publish runs only for pushes to main;
#   - publish has a concurrency group and never cancels a run in progress, so
#     publishes on main run one at a time (with the head-of-main check in
#     scripts/publish.sh, this is what orders concurrent runs);
#   - publish needs the image job, and that job builds the image, smoke tests
#     it, scans it with Trivy, exports its image ID and uploads it;
#   - publish downloads that same artifact, loads it and never builds an
#     image itself;
#   - publish verifies the loaded image ID and calls scripts/publish.sh with
#     exactly that verified ID.
#
#   scripts/check-workflow.sh [WORKFLOW]   (default .github/workflows/ci.yml)
#
# The checks read the YAML as text, job by job; the workflow is written in the
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

# job NAME prints the lines of one job under `jobs:`, from its key up to the
# next job key at the same indentation.
job() {
  awk -v name="$1" '
    /^jobs:[[:space:]]*$/ { in_jobs = 1; next }
    in_jobs && /^[^[:space:]#]/ { in_jobs = 0 }
    in_jobs && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { current = $1; sub(/:$/, "", current) }
    in_jobs && current == name { print }
  ' "$workflow"
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

if [ -n "$publish" ]; then
  # Runs only for pushes to main.
  has "$publish" "if: github.event_name == 'push' && github.ref == 'refs/heads/main'" ||
    report "publish must run only for pushes to main"

  # One publish at a time, never cancelled half way.
  if ! { matches "$publish" '^    concurrency:[[:space:]]*$' && matches "$publish" '^      group:[[:space:]]*[^[:space:]]+'; }; then
    report "publish must have a concurrency group"
  fi
  matches "$publish" '^      cancel-in-progress:[[:space:]]*true' &&
    report "publish must not cancel a publish in progress"

  # Depends on the job that builds, smoke tests and scans the image.
  matches "$publish" '^    needs:.*[[, ]image([], ]|$)' ||
    report "publish must need the image job that builds, smoke tests and scans the image"

  # Loads the tested artifact and never builds one.
  if ! { has "$publish" 'uses: actions/download-artifact@' && has "$publish" 'docker load'; }; then
    report "publish must download and load the tested image artifact"
  fi
  matches "$publish" 'docker([[:space:]]+buildx)?[[:space:]]+build|build-push-action|compose[[:space:]]+build' &&
    report "publish must not build an image; it publishes the tested artifact"

  # Verifies the loaded image ID and publishes exactly that ID.
  has "$publish" "[ \"\$loaded\" != \"$id\" ]" ||
    report "publish must verify that the loaded image is the tested image ID"
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
