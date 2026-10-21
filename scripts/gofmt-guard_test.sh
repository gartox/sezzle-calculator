#!/bin/sh
# Tests the Makefile gofmt guard (the gofmt-check target, which lint and
# format-check depend on) against a temporary module: a formatted file
# passes, a file with a syntax error fails even though gofmt -l prints no
# file names for it, and a valid but unformatted file fails.
#
#   scripts/gofmt-guard_test.sh
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

module="$work/module"
mkdir -p "$module"
printf 'module example.com/guard\n\ngo 1.26\n' >"$module/go.mod"
printf 'package guard\n\n// OK is formatted.\nfunc OK() {}\n' >"$module/ok.go"

passed=0
failed=0

# guard NAME WANT_EXIT WANT_TEXT runs the real Makefile target on the module.
guard() {
  status=0
  make -s -C "$root" gofmt-check BACKEND="$module" >"$work/out" 2>&1 || status=$?
  if { [ "$2" -eq 0 ] && [ "$status" -eq 0 ]; } || { [ "$2" -ne 0 ] && [ "$status" -ne 0 ]; }; then
    if grep -qF -- "$3" "$work/out" || [ -z "$3" ]; then
      passed=$((passed + 1))
      return
    fi
  fi
  failed=$((failed + 1))
  echo "FAIL: $1 (exit $status; output should contain: $3)"
  sed 's/^/  /' "$work/out"
}

guard "formatted module passes" 0 ""

printf 'package guard\n\nfunc broken( {\n' >"$module/broken.go"
guard "syntax error fails" 1 "gofmt failed"
rm "$module/broken.go"

printf 'package guard\nfunc  Ugly(){}\n' >"$module/ugly.go"
guard "unformatted file fails" 1 "ugly.go"
rm "$module/ugly.go"

guard "formatted again passes" 0 ""

echo "gofmt-guard_test: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
