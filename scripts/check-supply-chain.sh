#!/bin/sh
# Fails when something CI executes is not pinned:
#   - a GitHub Actions `uses:` that is not a full 40-character commit SHA
#     (local `./` actions and `docker://` images pinned by digest are fine);
#   - a Dockerfile `FROM` without an @sha256 digest (`scratch` and earlier
#     build stages are fine);
#   - govulncheck, `go run` or `go install` at @latest anywhere that runs.
#
#   scripts/check-supply-chain.sh [ROOT]
#
# Markdown is skipped: it documents commands, it does not run them.
set -eu

root=${1:-.}
problems=0
list=$(mktemp)
trap 'rm -f "$list"' EXIT

report() {
  echo "supply chain: $1" >&2
  problems=$((problems + 1))
}

# 1. Actions pinned by commit SHA.
valid_uses='uses:[[:space:]]*["'\'']?(\./[^[:space:]"'\'']*|docker://[^[:space:]"'\'']+@sha256:[0-9a-f]{64}|[^@[:space:]"'\'']+@[0-9a-f]{40})["'\'']?([[:space:]]+#.*)?[[:space:]]*$'
for workflow in "$root"/.github/workflows/*.yml "$root"/.github/workflows/*.yaml; do
  [ -f "$workflow" ] || continue
  unpinned=$(grep -nE '^[[:space:]]*(-[[:space:]]*)?uses:' "$workflow" | grep -vE "$valid_uses" || true)
  if [ -n "$unpinned" ]; then
    report "actions must be pinned to a full commit SHA in ${workflow#"$root"/}:
$unpinned"
  fi
done

# 2. Base images pinned by digest. Globbing is off while lines are split into
#    words, so a "*" in a Dockerfile cannot expand to file names.
set -f
find "$root" -name 'Dockerfile*' -not -path '*/node_modules/*' -not -path '*/.git/*' >"$list"
while IFS= read -r dockerfile; do
  stages=' scratch '
  line_number=0
  while IFS= read -r line || [ -n "$line" ]; do
    line_number=$((line_number + 1))
    # FROM [--platform=...] IMAGE [AS name], case-insensitive keywords. The
    # line is split into words on purpose; globbing is off.
    # shellcheck disable=SC2086
    set -- $line
    [ $# -ge 2 ] || continue
    keyword=$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')
    [ "$keyword" = FROM ] || continue
    shift
    case $1 in --platform=*) shift ;; esac
    image=$1
    if [ $# -ge 3 ] && [ "$(printf '%s' "$2" | tr '[:lower:]' '[:upper:]')" = AS ]; then
      stages="$stages$3 "
    fi
    case $stages in *" $image "*) continue ;; esac
    if ! printf '%s' "$image" | grep -qE '@sha256:[0-9a-f]{64}$'; then
      report "${dockerfile#"$root"/}:$line_number: FROM $image is not pinned by digest"
    fi
  done <"$dockerfile"
done <"$list"
set +f

# 3. No floating tool versions. The pattern is spelled so it does not match
#    this file itself.
floating=$(grep -rnE --exclude='*.md' --exclude-dir=.git --exclude-dir=node_modules \
  --exclude-dir=dist --exclude-dir=storybook-static \
  -e 'govulncheck[^[:space:]]*@late[s]t' -e 'go[[:space:]]+(run|install)[[:space:]].*@late[s]t' \
  "$root" || true)
if [ -n "$floating" ]; then
  report "tools must be pinned to a version, not @latest:
$floating"
fi

if [ "$problems" -ne 0 ]; then
  echo "supply chain: $problems problem(s) found" >&2
  exit 1
fi
echo "supply chain: actions, base images and tools are pinned"
