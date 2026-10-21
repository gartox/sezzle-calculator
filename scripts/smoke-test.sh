#!/bin/sh
# Smoke test for a built image: starts it, waits until Docker reports it
# healthy, checks one calculation and one error, and always removes it.
#   scripts/smoke-test.sh [image] [host-port]
# CI runs this against the image it then scans and publishes.
set -eu

image=${1:-sezzle-calculator}
port=${2:-18080}
name="calculator-smoke-$$"
base="http://127.0.0.1:${port}"

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "smoke test failed: $1" >&2
  docker logs "$name" >&2 2>&1 || true
  exit 1
}

# The image's health check runs every 30 s; a short interval here only makes
# the wait shorter, it runs the same probe binary.
docker run -d --name "$name" -p "127.0.0.1:${port}:8080" \
  --health-interval=1s --health-start-period=1s --health-retries=3 \
  "$image" >/dev/null || fail "could not start $image"

status=starting
for _ in $(seq 1 60); do
  status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name")
  [ "$status" = healthy ] && break
  [ "$status" = unhealthy ] && fail "container reported unhealthy"
  [ "$status" = none ] && fail "image has no health check"
  sleep 1
done
[ "$status" = healthy ] || fail "container did not become healthy (last status: $status)"
echo "health: $status"

got=$(curl -fsS -X POST "$base/api/v1/calculate" -H 'Content-Type: application/json' \
  -d '{"operation":"percent","a":15,"b":200}')
[ "$got" = '{"result":30}' ] || fail "calculation returned $got"
echo "calculation: $got"

got=$(curl -sS -X POST "$base/api/v1/calculate" -H 'Content-Type: application/json' \
  -H 'X-Request-Id: smoke-test' -d '{"operation":"divide","a":1,"b":0}')
want='{"error":{"code":"DIVISION_BY_ZERO","message":"Cannot divide by zero.","requestId":"smoke-test"}}'
[ "$got" = "$want" ] || fail "error envelope was $got"
echo "error envelope: $got"

echo "smoke test passed for $image"
