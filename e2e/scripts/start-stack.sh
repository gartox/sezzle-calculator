#!/bin/sh
# Builds and starts the real stack for the end-to-end tests, from the
# repository root: the frontend bundle, then the Go binary, which serves both
# the API and the bundle. The bundle is rebuilt every time so the tests never
# run against a stale frontend/dist; dependencies are installed only when
# node_modules is missing. PORT, STATIC_DIR and RATE_LIMIT_RPS come from
# playwright.config.ts.
set -eu

cd "$(dirname "$0")/../.."

if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm ci)
fi
(cd frontend && npm run build)

(cd backend && go build -o ../bin/server ./cmd/server)

exec ./bin/server
