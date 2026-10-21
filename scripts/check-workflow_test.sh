#!/bin/sh
# Tests scripts/check-workflow.sh. The real workflow is the clean fixture (so
# this also asserts it passes); each copy breaks exactly one invariant and
# must fail with the message for that invariant.
#
#   scripts/check-workflow_test.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

clean="$work/clean.yml"
cp "$root/.github/workflows/ci.yml" "$clean"

# Literal-text edits. Each fails the test if the text is not found, so a
# fixture can never silently stay clean.
edit() {
  mode=$1
  file=$2
  old=$3
  new=${4:-}
  grep -qF -- "$old" "$file" || { echo "fixture text not found: $old" >&2; exit 1; }
  awk -v mode="$mode" -v old="$old" -v new="$new" '
    {
      i = index($0, old)
      if (i) seen++
      if (i && mode == "delete") next
      if (i && (mode == "replace" || (mode == "replace-second" && seen == 2))) $0 = substr($0, 1, i - 1) new substr($0, i + length(old))
      print
      if (i && mode == "after") print new
    }
  ' "$file" >"$file.tmp"
  mv "$file.tmp" "$file"
}

passed=0
failed=0

# expect NAME WANT_EXIT WANT_TEXT FILE runs the check on FILE.
expect() {
  status=0
  "$here/check-workflow.sh" "$4" >"$work/out" 2>&1 || status=$?
  if [ "$status" -eq "$2" ] && grep -qF -- "$3" "$work/out"; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $1 (exit $status, want $2; output should contain: $3)"
    sed 's/^/  /' "$work/out"
  fi
}

# violation NAME MESSAGE MODE OLD [NEW] breaks one invariant in a copy.
violation() {
  name=$1
  message=$2
  shift 2
  copy="$work/case-$(printf '%s' "$name" | tr -c 'a-z0-9' '-').yml"
  cp "$clean" "$copy"
  edit "$1" "$copy" "$2" "${3:-}"
  expect "$name" 1 "$message" "$copy"
}

# shellcheck disable=SC2016 # GitHub expressions, matched literally.
id='"${{ needs.image.outputs.image-id }}"'

expect "the real workflow passes" 0 "keeps its invariants" "$clean"

violation "publish runs on every event" "publish must run only for pushes to main" \
  delete "if: github.event_name == 'push' && github.ref == 'refs/heads/main'"
violation "concurrency group removed" "publish must have a concurrency group" \
  delete "group: publish-main"
violation "concurrency removed entirely" "publish must have a concurrency group" \
  replace "    concurrency:" "    timeout-minutes: 10"
violation "publish can be cancelled" "publish must not cancel a publish in progress" \
  replace "cancel-in-progress: false" "cancel-in-progress: true"
violation "publish does not need the image job" "publish must need the image job" \
  replace ", scripts, image]" ", scripts]"
violation "image job does not build" "the image job must build the image" \
  replace "docker build -t sezzle-calculator:ci ." "docker pull sezzle-calculator:ci"
violation "image job does not smoke test" "the image job must smoke test the image" \
  delete "run: scripts/smoke-test.sh sezzle-calculator:ci"
violation "image job does not scan" "the image job must scan the image with Trivy" \
  replace "uses: aquasecurity/trivy-action@" "uses: example/other-scanner@"
violation "image job hides its image ID" "the image job must export the built image ID" \
  delete "image-id: \${{ steps.build.outputs.image-id }}"
violation "image job does not upload the image" "the image job must upload the tested image" \
  delete "uses: actions/upload-artifact@"
violation "publish downloads a different artifact" "publish must download the artifact the image job uploaded" \
  replace-second "name: image" "name: some-other-image"
violation "publish does not load the artifact" "publish must download and load the tested image artifact" \
  replace "gunzip -c image.tar.gz | docker load" "true"
violation "publish builds an image" "publish must not build an image" \
  after "        run: echo \"\${{ secrets.GITHUB_TOKEN }}\" | docker login ghcr.io -u \"\${{ github.actor }}\" --password-stdin" \
  "      - run: docker build -t sezzle-calculator:ci ."
violation "publish uses buildx" "publish must not build an image" \
  after "        run: echo \"\${{ secrets.GITHUB_TOKEN }}\" | docker login ghcr.io -u \"\${{ github.actor }}\" --password-stdin" \
  "      - run: docker buildx build --load -t sezzle-calculator:ci ."
violation "publish skips the image ID check" "publish must verify that the loaded image is the tested image ID" \
  replace "if [ \"\$loaded\" != $id ]; then" "if false; then"
violation "publish passes a tag instead of the verified ID" "publish must call scripts/publish.sh with the verified image ID" \
  replace "scripts/publish.sh $id " "scripts/publish.sh sezzle-calculator:ci "
violation "publish no longer calls the script" "publish must call scripts/publish.sh with the verified image ID" \
  replace "run: scripts/publish.sh" "run: echo skipped"
violation "publish job renamed" "the workflow has no publish job" \
  replace "  publish:" "  release:"

echo "check-workflow_test: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
