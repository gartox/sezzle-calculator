#!/bin/sh
# Builds and starts the real stack for the end-to-end tests, from the
# repository root: the frontend bundle (only when frontend/dist is missing),
# then the Go binary, which serves both the API and the bundle.
# PORT and STATIC_DIR are provided by playwright.config.ts.
set -eu

cd "$(dirname "$0")/../.."

if [ ! -d frontend/dist ]; then
  (cd frontend && npm ci && npm run build)
fi

(cd backend && go build -o ../bin/server ./cmd/server)

exec ./bin/server
