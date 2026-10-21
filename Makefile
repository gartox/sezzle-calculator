# Calculator: Go API and React frontend. Run `make` with no arguments to
# list the targets. Lines starting with "## target:" feed the help output.
# Requires Go 1.26.10 or newer and Node 24 or newer.

BACKEND := backend
FRONTEND := frontend
E2E := e2e
BIN := bin/server
IMAGE := sezzle-calculator

.DEFAULT_GOAL := help

# gofmt -l lists files that need formatting, and when a file does not parse it
# lists nothing and exits non-zero. Both cases must fail the check.
GOFMT_CHECK = unformatted="$$(gofmt -l .)" || { echo "gofmt failed"; exit 1; }; \
	if [ -n "$$unformatted" ]; then echo "gofmt would change:"; echo "$$unformatted"; exit 1; fi

.PHONY: help test coverage build run clean lint format format-check gofmt-check scripts-test \
        backend-test backend-coverage backend-build \
        frontend-install frontend-test frontend-coverage frontend-build \
        e2e-install e2e docker-build docker-run \
        storybook storybook-build storybook-test design-screenshots smoke vulncheck

## help: list the available targets (default)
help:
	@echo "Usage: make <target>    (requires Go 1.26.10+ and Node 24+)"
	@echo
	@grep -hE '^## [a-zA-Z0-9_-]+:' $(MAKEFILE_LIST) \
	  | sed -E 's/^## ([a-zA-Z0-9_-]+): */\1|/' \
	  | awk -F'|' '{ printf "  %-18s %s\n", $$1, $$2 }'

# Both layers

## test: run the unit tests of both layers and the script tests (fast; end-to-end tests are `make e2e`)
test: backend-test frontend-test scripts-test

## scripts-test: test the publish script, the supply-chain and workflow checks, and the gofmt guard
scripts-test:
	scripts/publish_test.sh
	scripts/check-supply-chain_test.sh
	scripts/check-workflow_test.sh
	scripts/gofmt-guard_test.sh

## coverage: run both unit suites and write backend/coverage.txt and frontend/coverage.txt
coverage: backend-coverage frontend-coverage

## build: build the frontend bundle and compile the server into bin/server
build: frontend-build backend-build

## run: build everything and start the server on port 8080, serving frontend/dist
run: build
	./$(BIN)

## lint: supply-chain pins, publication workflow invariants, gofmt and go vet, oxlint in frontend and e2e
lint: gofmt-check $(FRONTEND)/node_modules $(E2E)/node_modules
	scripts/check-supply-chain.sh .
	scripts/check-workflow.sh
	cd $(BACKEND) && go vet ./...
	cd $(FRONTEND) && npm run lint
	cd $(E2E) && npm run lint

## gofmt-check: fail if gofmt cannot parse a file or would reformat one (BACKEND=dir to point it elsewhere)
gofmt-check:
	cd $(BACKEND) && $(GOFMT_CHECK)

## format: gofmt -w on the backend and prettier --write in frontend and e2e
format: $(FRONTEND)/node_modules $(E2E)/node_modules
	cd $(BACKEND) && gofmt -w .
	cd $(FRONTEND) && npm run format
	cd $(E2E) && npm run format

## format-check: fail if gofmt or Prettier would change any file (what CI runs)
format-check: gofmt-check $(FRONTEND)/node_modules $(E2E)/node_modules
	cd $(FRONTEND) && npm run format:check
	cd $(E2E) && npm run format:check

## clean: remove build and coverage artifacts
clean:
	rm -rf bin $(BACKEND)/coverage.out $(FRONTEND)/dist $(FRONTEND)/coverage \
	  $(E2E)/test-results $(E2E)/playwright-report

# Backend (Go)

## backend-test: go test with the race detector and a coverage summary
backend-test:
	cd $(BACKEND) && go test ./... -race -cover

## backend-coverage: write the per-function coverage report to backend/coverage.txt
backend-coverage:
	cd $(BACKEND) && go test ./... -race -coverprofile=coverage.out && go tool cover -func=coverage.out > coverage.txt
	cat $(BACKEND)/coverage.txt

## backend-build: compile the server binary into bin/server
backend-build:
	cd $(BACKEND) && go build -o ../$(BIN) ./cmd/server

# Frontend (React). Targets that need node_modules install it from the
# lockfile when it is missing or older than package-lock.json.

$(FRONTEND)/node_modules: $(FRONTEND)/package-lock.json
	cd $(FRONTEND) && npm ci
	@touch $@

## frontend-install: install frontend dependencies from the lockfile
frontend-install:
	cd $(FRONTEND) && npm ci

## frontend-test: run the Vitest unit tests
frontend-test: $(FRONTEND)/node_modules
	cd $(FRONTEND) && npm test

## frontend-coverage: write the coverage table to frontend/coverage.txt (lcov in frontend/coverage/)
frontend-coverage: $(FRONTEND)/node_modules
	cd $(FRONTEND) && NO_COLOR=1 npm run test:coverage > coverage.log 2>&1; status=$$?; \
	  sed -n '/Coverage report/,$$p' coverage.log > coverage.txt; cat coverage.txt; \
	  rm -f coverage.log; exit $$status

## frontend-build: build the production bundle into frontend/dist
frontend-build: $(FRONTEND)/node_modules
	cd $(FRONTEND) && npm run build

# Storybook (component workshop). Story tests render every story in a real
# Chromium and fail on any axe violation, in light and dark.

## storybook: run Storybook on http://localhost:6006
storybook: $(FRONTEND)/node_modules
	cd $(FRONTEND) && npm run storybook

## storybook-build: build the static Storybook into frontend/storybook-static
storybook-build: $(FRONTEND)/node_modules
	cd $(FRONTEND) && npm run build-storybook

## design-screenshots: rebuild Storybook and capture the review screenshots into docs/design/
design-screenshots: $(FRONTEND)/node_modules
	cd $(FRONTEND) && npx playwright install chromium && npm run capture:design

## storybook-test: run every story as a browser test with accessibility checks
storybook-test: $(FRONTEND)/node_modules
	cd $(FRONTEND) && npx playwright install chromium && npm run test-storybook

# End-to-end (Playwright). Not part of `make test`: it builds the whole stack
# and drives a real browser, so it is slower and needs Chromium installed.

$(E2E)/node_modules: $(E2E)/package-lock.json
	cd $(E2E) && npm ci
	@touch $@

## e2e-install: install the end-to-end dependencies and Chromium (run once)
e2e-install:
	cd $(E2E) && npm ci && npx playwright install chromium

## e2e: run the browser and API tests; starts the stack on port 8090 or reuses a server there
e2e: $(E2E)/node_modules
	cd $(E2E) && npm test

# Docker

## docker-build: build the production image (frontend and server in one container)
docker-build:
	docker build -t $(IMAGE) .

## smoke: build the image and smoke test the running container (health, a result, an error)
smoke: docker-build
	scripts/smoke-test.sh $(IMAGE)

## vulncheck: scan the backend with the govulncheck version pinned in tools/go.mod
vulncheck:
	cd tools && go tool govulncheck -C ../backend ./...

## docker-run: build the image and run it on port 8080, removing the container on exit
docker-run: docker-build
	docker run --rm -p 8080:8080 $(IMAGE)
