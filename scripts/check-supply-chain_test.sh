#!/bin/sh
# Tests scripts/check-supply-chain.sh: a clean fixture repository passes, and
# each copy with exactly one violation fails with a message naming it.
#
#   scripts/check-supply-chain_test.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

SHA=3d3c42e5aac5ba805825da76410c181273ba90b1
# Built at run time so this file does not itself contain the token the check
# rejects; otherwise the check would flag its own test.
LATEST="@lat""est"
DIGEST=sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f

# A clean repository, including the edge cases the check must allow.
clean="$work/clean"
mkdir -p "$clean/.github/workflows" "$clean/.github/actions/local" "$clean/docs"
cat >"$clean/.github/workflows/ci.yml" <<EOF
jobs:
  build:
    steps:
      - uses: actions/checkout@$SHA # v7.0.1
      - uses: "actions/setup-go@$SHA"
      - uses: ./.github/actions/local
      - uses: docker://alpine@$DIGEST
      - run: go tool govulncheck ./...
EOF
cat >"$clean/Dockerfile" <<EOF
FROM node:24-alpine@$DIGEST AS frontend
FROM --platform=linux/amd64 golang:1.26.10-alpine@$DIGEST AS backend
from scratch
FROM backend AS final
EOF
cat >"$clean/Makefile" <<'EOF'
vulncheck:
	cd tools && go tool govulncheck ./...
EOF
# Markdown may show an unpinned command; it does not run.
echo "Run \`go run golang.org/x/vuln/cmd/govulncheck$LATEST\` to try it." >"$clean/docs/notes.md"

passed=0
failed=0

# expect NAME WANT_EXIT WANT_TEXT DIR runs the check on DIR.
expect() {
  status=0
  "$here/check-supply-chain.sh" "$4" >"$work/out" 2>&1 || status=$?
  if [ "$status" -eq "$2" ] && grep -qF -- "$3" "$work/out"; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $1 (exit $status, want $2; output should contain: $3)"
    sed 's/^/  /' "$work/out"
  fi
}

# violation NAME FILE TEXT [append|replace OLD] makes a copy of the clean
# repository with one change and expects the check to fail mentioning TEXT.
violation() {
  name=$1
  file=$2
  content=$3
  copy="$work/case-$(printf '%s' "$name" | tr -c 'a-z0-9' '-')"
  rm -rf "$copy"
  cp -R "$clean" "$copy"
  printf '%s\n' "$content" >>"$copy/$file"
  expect "$name" 1 "supply chain:" "$copy"
}

expect "clean repository passes" 0 "are pinned" "$clean"

violation "action pinned to a tag" .github/workflows/ci.yml "      - uses: actions/checkout@v7"
violation "action pinned to a short SHA" .github/workflows/ci.yml "      - uses: actions/checkout@3d3c42e"
violation "action pinned to a branch" .github/workflows/ci.yml "      - uses: aquasecurity/trivy-action@master"
violation "quoted action without a ref" .github/workflows/ci.yml "      - uses: 'actions/upload-artifact'"
violation "docker action by tag" .github/workflows/ci.yml "      - uses: docker://alpine:3.20"
violation "FROM without a digest" Dockerfile "FROM node:24-alpine"
violation "FROM by tag with a stage name" Dockerfile "FROM golang:1.26 AS tools"
violation "FROM with platform and no digest" Dockerfile "FROM --platform=linux/arm64 alpine:3.20"
violation "govulncheck at latest in the Makefile" Makefile "	go run golang.org/x/vuln/cmd/govulncheck$LATEST ./..."
violation "go install at latest in a workflow" .github/workflows/ci.yml "      - run: go install honnef.co/go/tools/cmd/staticcheck$LATEST"
violation "govulncheck at latest in a script" scripts.sh "govulncheck$LATEST -C backend ./..."

# The messages name the problem, not just that one exists.
copy="$work/messages"
cp -R "$clean" "$copy"
echo "FROM node:24-alpine" >>"$copy/Dockerfile"
expect "message names the unpinned image" 1 "FROM node:24-alpine is not pinned by digest" "$copy"

echo "check-supply-chain_test: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
