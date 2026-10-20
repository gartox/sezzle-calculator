# Prompts

Prompts used to build this project, in chronological order. Each section gives the purpose, the tool, the prompt verbatim, and a short note on what came out of it.

## 1. Contract, architecture and plan confirmation

Tool: Claude Code.

```text
You are implementing a take-home assignment for a Software Engineer II role at Sezzle. Before writing any code, read the requirements and the decisions below and confirm the plan.

## Assignment (as received)

Build a full-stack calculator application with a React frontend and a backend microservice. The frontend should consume the backend API to perform basic and advanced arithmetic operations. Focus on clean design, maintainable code, and testable architecture.

Functional: operations addition, subtraction, multiplication, division; optional exponentiation, square root, percentage. Frontend (React): intuitive UI for entering input and displaying results, input validation and error handling, responsive design (basic mobile support). Backend (REST API): expose endpoints for calculator operations, validate input and handle edge cases (division by zero, invalid data), return results in JSON.

Non-functional: clean, readable, idiomatic code in both layers; unit tests covering key functionality for both layers; documentation with setup instructions, API usage and design rationale; optional Dockerfile for full-stack deployment.

Constraints: React (TypeScript preferred); Go preferred for the backend. Deliverables: Git repository with frontend and backend; README with setup, API examples and design decisions; unit tests and coverage report; optional Dockerfile to run both together. Spend about 2 to 4 hours; prioritize correctness, clarity and maintainability over extra features.

## Decisions (fixed)

- Backend: Go 1.26, standard library only. Routing with net/http method and pattern routing (Go 1.22+). No frameworks, no third-party modules.
- Frontend: React 19 + TypeScript + Vite. Tests with Vitest and Testing Library. Plain CSS, no UI library.
- Operations: add, subtract, multiply, divide, power, sqrt, percent. All seven ship.
- Single endpoint: POST /api/v1/calculate. Request {"operation":"add","a":2,"b":3}. Success 200 {"result":5}. sqrt uses only a. power(a,b) is a raised to b. percent(a,b) is a percent of b, so percent(15,200) = 30.
- Error body is always {"error":{"code":"...","message":"..."}}. 400 for INVALID_JSON (malformed body), INVALID_OPERATION (unknown enum), INVALID_OPERAND (missing, NaN or Infinity). 422 for DIVISION_BY_ZERO, NEGATIVE_SQRT, RESULT_OVERFLOW (result is ±Inf or NaN). 405 for any method other than POST.
- Numbers are float64. Results are rounded to 12 significant decimals before responding so that 0.1 + 0.2 returns 0.3. The README will state that money would use arbitrary-precision decimals instead.
- Layout: backend/ with cmd/server/main.go, internal/calculator (pure arithmetic, no HTTP, table-driven tests) and internal/httpapi (decode, validate, respond, httptest tests); frontend/ with src/api/client.ts and src/components/Calculator.tsx plus tests; Dockerfile (multi-stage, final image is the Go binary serving the built frontend), docker-compose.yml, Makefile (test, run, build, coverage), .github/workflows/ci.yml, README.md, PROMPTS.md.
- Server reads PORT (default 8080), shuts down gracefully on SIGINT/SIGTERM, serves frontend/dist when present. CORS only when a DEV flag is set.

## Working rules

- Small commits on main with clear messages in English. No mention of AI tooling anywhere in code, commits or README.
- Do not push and do not create a remote.
- Keep PROMPTS.md: append every prompt I send you verbatim, in order, each followed by two or three lines on what you produced. I will add my own corrections later.
- Total budget is about four hours. No extra layers or abstractions beyond what is listed.

Reply with the confirmed plan as a short checklist, plus any question where the decisions above are ambiguous or conflict. Do not write code yet.
```

Result: the plan came back as a checklist with the package boundaries (sentinel errors in `calculator`, error-to-status mapping in `httpapi`) and three questions: the default Go mux answers 405 with a plain-text body instead of the JSON envelope; whether "12 significant decimals" means decimal places or significant digits; and that the Vite dev proxy makes the DEV-only CORS redundant. No code was written.

## 2. Backend: calculator package, HTTP handler, server and coverage

Tool: Claude Code.

```text
Prompt 2. Answers to your three questions first, then build the backend. Append this whole message verbatim to PROMPTS.md as prompt 2.

## Answers

1. 405: every error goes through the JSON envelope, no exceptions. Register the /api/v1/calculate path for all methods and check the method yourself, or add a fallback handler, so non-POST returns 405 with code METHOD_NOT_ALLOWED and an Allow: POST header. Unknown /api/ paths return 404 with code NOT_FOUND in the same envelope.
2. Significant digits, not decimal places. Round to 12 significant digits with a strconv round trip (FormatFloat with 'g' and precision 12, then ParseFloat). Decimal places would overflow at large magnitudes. Export the rounding function from the calculator package and test it.
3. Drop CORS entirely. Development goes through the Vite proxy and production is same-origin because the binary serves the frontend. Note the decision in the README later.

## Backend

Module path github.com/gartox/sezzle-calculator/backend. Go 1.26, standard library only.

internal/calculator:
- type Operation string with constants Add, Subtract, Multiply, Divide, Power, Sqrt, Percent, and a way to parse and validate a string into an Operation.
- func Calculate(op Operation, a, b float64) (float64, error). Sqrt uses only a. Percent(a, b) is a percent of b. Power(a, b) is a to the b.
- Sentinel errors: ErrUnknownOperation, ErrInvalidOperand (NaN or Inf input), ErrDivisionByZero, ErrNegativeSqrt, ErrOverflow (result is Inf or NaN). The package must be safe to use standalone, so it validates operands itself.
- Rounding to 12 significant digits applied to every result.
- Table-driven tests: every operation happy path, negative numbers, large numbers, 0.1 + 0.2 equals 0.3, sqrt ignores b, percent(15, 200) equals 30, power(2, 10) equals 1024, division by zero, sqrt of a negative, power overflow (for example 1e308 to the 2), NaN and Inf operands, unknown operation. Assert errors with errors.Is.

internal/httpapi:
- func NewHandler() http.Handler. POST /api/v1/calculate reads a JSON body with operation (string) and a, b as *float64 so a missing field is distinguishable from zero. b is optional only for sqrt.
- Body limited to 1 MiB with http.MaxBytesReader. Every response has Content-Type application/json.
- Mapping: malformed JSON or wrong types → 400 INVALID_JSON; unknown operation → 400 INVALID_OPERATION; missing, NaN or Inf operand → 400 INVALID_OPERAND; ErrDivisionByZero → 422 DIVISION_BY_ZERO; ErrNegativeSqrt → 422 NEGATIVE_SQRT; ErrOverflow → 422 RESULT_OVERFLOW; wrong method → 405 METHOD_NOT_ALLOWED; unknown path under /api/ → 404 NOT_FOUND. Success → 200 {"result": number}. Error → {"error": {"code": "...", "message": "..."}} with a human-readable message that does not leak internals.
- httptest tests for the happy path and for every code above, including empty body, a string where a number is expected, missing b for add, and GET on the endpoint.

cmd/server/main.go:
- PORT from the environment, default 8080. STATIC_DIR from the environment, default frontend/dist; when the directory exists, serve it with an index.html fallback for client-side routes, otherwise only the API.
- http.Server with ReadHeaderTimeout, ReadTimeout, WriteTimeout and IdleTimeout set. Graceful shutdown on SIGINT and SIGTERM with signal.NotifyContext and a 10 second shutdown timeout. Log startup and shutdown with log/slog.

Makefile at the repository root with targets test, coverage, run and build for the backend (frontend targets come later). coverage runs go test ./... -race -coverprofile and writes backend/coverage.txt with the output of go tool cover -func. Commit coverage.txt.

Before you report: gofmt -l must print nothing, go vet ./... must be clean, go test ./... -race -cover must pass. Commit in four steps: calculator package with tests, httpapi with tests, server main with Makefile, coverage report. Commit messages in English, no mention of tooling.

Report the test output with per-package coverage and the commit list, then stop and wait for prompt 3.
```

Result: four commits as requested. `calculator` (96.9% coverage) exposes `Operation`, `ParseOperation`, `Calculate` and `Round`; `httpapi` (100%) registers the endpoint for all methods and answers 405 and 404 inside the JSON envelope; `main.go` serves `frontend/dist` with an index fallback and drains connections on SIGINT/SIGTERM. `gofmt -l`, `go vet` and `go test -race` are clean. The total in `coverage.txt` reads 66.4% only because `cmd/server` has no tests.

## 3. Frontend: Vite scaffold, API client, Calculator component, styles and coverage

Tool: Claude Code.

```text
Prompt 3. Backend reviewed and accepted as is. Now the frontend. Append this whole message verbatim to PROMPTS.md as prompt 3.

## Frontend

Scaffold frontend/ with the Vite react-ts template (React 19, TypeScript strict, Node 26 is installed). Keep the template's ESLint setup and make npm run lint pass. Commit package-lock.json so npm ci works in CI.

Dependencies: react and react-dom only. Dev dependencies: vite, @vitejs/plugin-react, typescript, eslint and what the template brings, vitest, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, @vitest/coverage-v8. No UI library, no state library, no HTTP client library.

src/api/client.ts:
- Operation as a string union that mirrors the backend: add, subtract, multiply, divide, power, sqrt, percent. Export a list of operations with a human label for each, in that order.
- class ApiError extends Error with code and status. 
- async function calculate(operation, a, b?) that POSTs JSON to /api/v1/calculate. For sqrt send only a. On a non-2xx response parse the {"error":{"code","message"}} envelope and throw ApiError with that code and message; if the body is not that envelope, throw ApiError with code UNEXPECTED_RESPONSE. On a network failure throw ApiError with code NETWORK_ERROR and a short message. Return the numeric result on success.
- Tests with fetch mocked (vi.fn or vi.stubGlobal): success, each error path above, sqrt request body has no b, request has the right method, path, headers and body.

src/components/Calculator.tsx:
- A form with two labeled number inputs (a and b), a labeled select with the seven operations, and a submit button. Submitting with Enter works. When sqrt is selected, the b input is hidden and not required.
- Client-side validation before calling the API: empty or non-numeric input shows an inline message and does not call the API.
- While a request is in flight the button is disabled and shows that it is working.
- The result renders in a region with aria-live="polite". Errors from the API render in an element with role="alert" showing the message from the backend. A new submit clears the previous result and error.
- State with useState only. No context, no reducer, no global store.
- Tests with Testing Library and user-event, with the client module mocked: renders inputs and all seven operations; happy path shows the result; API error shows the message in the alert; invalid input shows the inline message and the client is not called; selecting sqrt hides b and the client is called without b; the button is disabled while the promise is pending.

Styles: plain CSS in one file. Usable at 375 px wide without horizontal scroll, inputs and buttons at least 44 px tall, visible focus outline, readable contrast. No CSS framework.

src/App.tsx renders a heading and the Calculator. src/main.tsx as the template has it.

vite.config.ts: dev server proxy from /api to http://localhost:8080; build output to dist; vitest configured with environment jsdom, a setup file that imports @testing-library/jest-dom/vitest, globals off, and coverage with provider v8 and reporters text and lcov.

package.json scripts: dev, build, preview, lint, typecheck (tsc --noEmit -p tsconfig.app.json or the template's equivalent), test (vitest run), test:coverage (vitest run --coverage).

Makefile at the repository root: add frontend-install (npm ci), frontend-test, frontend-build and frontend-coverage targets, and make test and make coverage run both layers. make coverage writes frontend/coverage.txt with the text summary and keeps backend/coverage.txt as it is. make run builds the frontend first so the Go binary serves it. Add node_modules, dist and coverage/ to .gitignore. Commit both coverage.txt files.

Before you report: npm ci, npm run typecheck, npm run lint, npm test and npm run build must all pass. Then a smoke test: npm run build, start the Go server from the repository root, and curl / and POST /api/v1/calculate to confirm the binary serves the built frontend and the API together.

Commit in steps: scaffold, API client with tests, Calculator component with tests, styles, Makefile and coverage. English messages, no mention of tooling.

Report the test and coverage output for the frontend, the smoke test result and the commit list, then stop and wait for prompt 4.
```

Result: six commits (scaffold, API client, Calculator component, App test, stylesheet, Makefile and coverage). The current Vite react-ts template ships oxlint instead of ESLint, so the template's linter was kept and `npm run lint` passes with it. Frontend tests: 21 passing, 100% statements, branches, functions and lines. Smoke test from the repository root confirmed the Go binary serves `index.html`, the hashed JS bundle and `POST /api/v1/calculate` together.

## 4. Packaging and CI: health endpoint, Dockerfile, Compose, GitHub Actions

Tool: Claude Code.

```text
Prompt 4. Frontend reviewed and accepted as is; oxlint instead of ESLint is fine. Now packaging and CI. Append this whole message verbatim to PROMPTS.md as prompt 4.

## Health endpoint

Add GET /api/v1/health to the httpapi package returning 200 {"status":"ok"} with the JSON content type. Any other method on that path returns 405 through the same envelope as the rest. Add httptest cases for both. This is what Docker and Compose use for health checks.

## Dockerfile

Multi-stage, at the repository root:
1. Frontend build stage on node:26-alpine: copy frontend/package.json and package-lock.json first, npm ci, then copy the rest of frontend/ and npm run build.
2. Backend build stage on golang:1.26-alpine: copy backend/go.mod first and run go mod download, then copy backend/ and build a static binary with CGO_ENABLED=0 and -trimpath -ldflags="-s -w".
3. Final stage on gcr.io/distroless/static-debian12:nonroot. Copy the binary to /app/server and the built frontend to /app/frontend/dist. Set WORKDIR /app, ENV PORT=8080 and STATIC_DIR=/app/frontend/dist, EXPOSE 8080, run as the nonroot user, ENTRYPOINT the binary.

Add a .dockerignore that excludes .git, node_modules, dist, bin, coverage files and markdown except what the build needs.

## docker-compose.yml

One service, calculator, built from the Dockerfile, port 8080 mapped to 8080, restart unless-stopped, and a healthcheck that hits the health endpoint. The distroless image has no shell or curl, so implement the healthcheck in a way that works there, for example a tiny Go health probe compiled into the image as a second binary and invoked by the healthcheck, or document why the healthcheck lives in Compose only if that is simpler. Choose the simplest option that actually works and explain the choice in a comment.

## CI

.github/workflows/ci.yml running on push and pull_request to main, with three jobs:
- backend: actions/setup-go with go-version-file backend/go.mod; check that gofmt -l prints nothing (fail if it does), go vet ./..., go test ./... -race -cover.
- frontend: actions/setup-node with node 26 and npm cache keyed on frontend/package-lock.json; npm ci, npm run typecheck, npm run lint, npm test, npm run build.
- docker: docker/build-push-action or a plain docker build with push disabled, so a broken Dockerfile fails the pipeline.
Use pinned major versions of the official actions. Keep the workflow short.

## Makefile

Add docker-build and docker-run targets. docker-run maps port 8080 and removes the container on exit.

## Verification before you report

docker build must succeed. Run the container, confirm GET / returns the built UI, POST /api/v1/calculate returns a result, GET /api/v1/health returns ok, and docker stop ends the container quickly because SIGTERM is handled. If the Docker daemon is not running on this machine, say so explicitly instead of skipping silently. Run make test once more to confirm nothing regressed.

Commit in steps: health endpoint with tests, Dockerfile with .dockerignore and compose, CI workflow, Makefile targets. English messages, no mention of tooling. Do not push.

Report the docker build and run results, the health check behaviour and the commit list, then stop and wait for prompt 5.
```

Result: four commits plus a refreshed backend coverage report. The health endpoint answers GET with `{"status":"ok"}` and 405 otherwise; a second tiny Go binary, `cmd/healthcheck`, serves as the container health check because distroless has no shell. `docker build` produced a 13.6 MB image; the container served the UI, the API and the health endpoint as `nonroot`, reported `healthy` after the first 30 s interval, and `docker stop` returned in 0.35 s with exit code 0. The CI actions were pinned to their current majors (checkout v7, setup-go v7, setup-node v7, build-push-action v7).

## 5. End-to-end tests with Playwright, request file for reviewers

Tool: Claude Code.

```text
Prompt 5. First finish the container verification from prompt 4 and report it. Then add end-to-end tests. Append this whole message verbatim to PROMPTS.md as prompt 5.

## End-to-end tests with Playwright

Create a separate top-level package e2e/ with its own package.json so the frontend dependencies stay clean. Dev dependencies: @playwright/test and typescript. Chromium only. Scripts: test (playwright test) and install-browsers (playwright install --with-deps chromium).

playwright.config.ts:
- baseURL http://127.0.0.1:8090.
- webServer that builds and starts the real stack: from the repository root, build the frontend (npm ci and npm run build in frontend/ if dist is missing), build the Go binary, and start it with PORT=8090 and STATIC_DIR=frontend/dist. Reuse an existing server when one is already listening, so a developer can also run the tests against a running container on that port. Timeout generous enough for a cold build.
- retries 0 locally, 1 in CI. Trace on first retry. Reporter list locally, github plus html in CI.

tests/ui.spec.ts, three tests through the browser:
1. Add 2 and 3 shows the result 5 in the result region.
2. Divide 1 by 0 shows the backend message in the alert and no result.
3. Selecting Square root hides the b input and sqrt of 16 shows 4.
Use accessible locators (getByLabel, getByRole), no CSS selectors or test ids.

tests/api.spec.ts, using Playwright's request fixture against the same server:
1. GET /api/v1/health returns 200 and {"status":"ok"}.
2. POST add 0.1 and 0.2 returns 200 and result 0.3.
3. POST divide by zero returns 422 with code DIVISION_BY_ZERO.
4. POST an unknown operation returns 400 with code INVALID_OPERATION.
5. GET on /api/v1/calculate returns 405 with code METHOD_NOT_ALLOWED and an Allow header.
6. POST a malformed body returns 400 with code INVALID_JSON.

## Request file for reviewers

Add docs/api.http with one request per case above, plus sqrt and percent, in the format the VS Code REST Client and JetBrains HTTP client understand, with a variable for the base URL defaulting to http://localhost:8080. Keep it short and commented so it reads as documentation.

## CI and Makefile

Add an e2e job to .github/workflows/ci.yml that sets up Go and Node, installs e2e dependencies, installs Chromium with system deps, and runs the Playwright tests. Upload the Playwright report as an artifact on failure. Add e2e-install and e2e targets to the Makefile, and make e2e not part of make test (unit tests stay fast); document that in the Makefile help comments.

## Verification before you report

npm ci and npx playwright install chromium in e2e/, then npm test there from a clean state with no server running, so the webServer path is exercised. Then run it once more against the running Docker container on port 8090 to confirm the reuse path. make test must still pass.

Commit in steps: e2e package with config, UI spec, API spec, api.http, CI job and Makefile targets. English messages, no mention of tooling. Do not push.

Report the Playwright output for both runs and the commit list, then stop and wait for prompt 6.
```

Result: five commits. Playwright 1.64 with Chromium only, a start script that builds the frontend when `dist` is missing and compiles the Go binary, and `reuseExistingServer` so a running container on port 8090 is used instead. Cold run: 9 passed in 12.9 s including the full build; run against the Docker container: 9 passed in 1.7 s. `@types/node` was added to the e2e package so `tsc` can type `process.env`.

## 6. README and self-documenting Makefile

Tool: Claude Code.

```text
Prompt 6. Packaging and end-to-end tests reviewed and verified on my side (image built, container probed, Playwright green against it). Now the README. Append this whole message verbatim to PROMPTS.md as prompt 6.

## README.md

Write it in English for a reviewer who has ten minutes and will follow it literally on a clean machine. Short sentences, no marketing. Every command must be copy-pasteable from the repository root and must work as written. Sections, in this order:

1. Title, one-line description, and a CI badge for github.com/gartox/sezzle-calculator (the repository is not pushed yet; use the standard workflow badge URL for a workflow named CI on main).
2. What it does: the seven operations in one line, the stack in one line (Go 1.26 standard library, React 19 with TypeScript and Vite, Playwright, Docker).
3. Quick start, three ways, each in its own subsection with prerequisites and commands:
   - Docker: docker compose up --build, then open http://localhost:8080. Also the plain docker build and docker run equivalents.
   - Local build: Go 1.26 and Node 26, make run, open http://localhost:8080.
   - Development with hot reload: terminal one runs the Go server, terminal two runs npm run dev in frontend, open http://localhost:5173; explain in one sentence that Vite proxies /api to port 8080.
4. Project layout: a short tree with one line per top-level directory and the key packages.
5. API: the endpoint, a request and a success response, a table of error codes with HTTP status and when each occurs (INVALID_JSON, INVALID_OPERATION, INVALID_OPERAND, DIVISION_BY_ZERO, NEGATIVE_SQRT, RESULT_OVERFLOW, METHOD_NOT_ALLOWED, NOT_FOUND), the health endpoint, and curl examples for: add, sqrt, percent, divide by zero, unknown operation, malformed body, GET on the endpoint. Show the exact response each returns. Mention docs/api.http for the VS Code and JetBrains clients.
6. Tests: unit tests per layer and the make targets; how coverage is produced and where backend/coverage.txt and frontend/coverage.txt come from; state the per-package numbers honestly, including that cmd/server has no unit tests and is covered by the end-to-end suite instead; end-to-end with Playwright: what it covers, make e2e, that it starts the stack itself or reuses a server on port 8090 such as the container; what CI runs.
7. Design decisions, one short paragraph each, with the alternative considered where there was one: single endpoint with an operation enum instead of one route per operation; standard library only; the calculator package is pure and the handler only maps errors to status codes; the error envelope and the 400 versus 422 split; numeric precision: float64 with rounding to 12 significant digits, why that is acceptable for a calculator and why money would need arbitrary-precision decimals; the semantics chosen for percent, sqrt and power; no CORS because development uses the Vite proxy and production is same-origin; one binary serving the UI and the API; distroless image with a Go health probe; Playwright for both browser and API end-to-end tests.
8. Assumptions and limitations: operands are JSON numbers (no strings, no BigInt), results outside float64 are reported as RESULT_OVERFLOW, no authentication or rate limiting, no persistence, single instance.
9. Prompts: one sentence pointing to PROMPTS.md.

Do not state how long the work took; that goes in the submission form. Do not mention AI tooling anywhere in the README.

## Makefile

Add a help target as the default that lists the targets with their comments, so make with no arguments is self-documenting.

## Verification before you report

Run every command in the README exactly as written, from the repository root, in the order they appear, and fix the README or the Makefile if any differs. Confirm the curl examples return exactly the responses shown. make test and make e2e must pass.

Commit in two steps: README, Makefile help target. English messages, no mention of tooling. Do not push.

Report which commands you ran and anything you had to correct, then stop and wait for prompt 7.
```

Result: README with the nine sections and a self-documenting Makefile (`make` prints every target with its comment). Every README command was run from the repository root in order: `docker compose up --build`, `docker build` and `docker run`, `make run` from a wiped tree (`npm ci`, bundle and binary rebuilt), the two hot-reload terminals with a request through the Vite proxy, the eight curl examples compared byte for byte with the responses shown, `make test`, `make coverage`, `make e2e-install`, `make e2e` and plain `make`. Two Makefile corrections came out of it: frontend targets now install `node_modules` when missing so `make run` works on a clean machine, and `frontend/coverage.txt` keeps only the coverage table so it no longer changes with timestamps on every run.

## 7. Security hardening, vulnerability scanning and Node 24 minimum

Tool: Claude Code.

```text
Prompt 7. README reviewed and accepted. Now security hardening, dependency vulnerability scanning and a Node 24 minimum. Append this whole message verbatim to PROMPTS.md as prompt 7. A prompt 8 follows in a separate message: finish and commit everything here first, then start it.

## Node 24 minimum

- Add "engines": {"node": ">=24"} to frontend/package.json and e2e/package.json, and a .nvmrc at the repository root with 24.
- Dockerfile frontend build stage on node:24-alpine (the LTS) instead of 26.
- CI frontend job as a matrix on Node 24 and 26; e2e job on 24. Keep the cache keys working with the matrix.
- README prerequisites say Node 24 or newer.

## Dependency and image vulnerability scanning

- CI job security with three steps that fail on high or critical findings: npm audit --audit-level=high in frontend and in e2e (after npm ci); govulncheck ./... in backend (go run golang.org/x/vuln/cmd/govulncheck@latest or actions/setup-go plus go install); Trivy on the built image with aquasecurity/trivy-action, severity HIGH,CRITICAL, ignore-unfixed true, exit-code 1.
- .github/dependabot.yml with weekly updates for npm in /frontend and /e2e, gomod in /backend, docker in /, and github-actions in /. Group minor and patch updates so the PR noise stays low.
- Run the same three scans locally now. For Trivy, if it is not installed, run it through its Docker image against the local image (docker run with the Docker socket mounted) rather than installing anything on this machine. Paste the real output in your report. If anything is found, fix it when a non-breaking update exists; otherwise document it in the README security section with the reason.

## Security headers and caching for the served UI

In cmd/server, add a small middleware around the whole mux that sets on every response: X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy no-referrer, Permissions-Policy that disables camera, microphone and geolocation, and a Content-Security-Policy that allows only self for default-src, script-src, style-src, connect-src and img-src (plus data: for images), with frame-ancestors none, base-uri self and form-action self. Confirm the Vite build has no inline scripts or styles that the policy would block; if it does, adjust the build, not the policy. Cache-Control: no-cache for index.html and the API, and public, max-age=31536000, immutable for the hashed files under /assets/.

Put the middleware in its own file in cmd/server with unit tests using httptest, which also gives cmd/server real coverage. Add one Playwright API test asserting the nosniff and CSP headers on GET /. Update the coverage.txt files and the coverage table in the README.

## Review of what exists

Check and report, fixing where needed: no secrets or environment files tracked; the static file server cannot be used to read outside STATIC_DIR (path traversal); request body limit and server timeouts in place; the error messages never echo internals; the container runs as nonroot and the image has no shell. Add a Security section to the README listing what is covered and what is deliberately out of scope (authentication, rate limiting, TLS termination, which belong to the deployment in front of the service).

## Verification before you report

make test, make e2e and docker build must pass on Node 24: switch to Node 24 with nvm for the frontend and e2e steps (nvm use 24, or install it with nvm if missing) and show the versions used. The three scans run locally with their output.

Commit in steps: Node 24 engines and images, security headers middleware with tests, scanning job and Dependabot, README security section. English messages, no mention of tooling. Do not push.

Report the scan output, the header values observed with curl -I on / and on an asset, and the commit list. Then continue with prompt 8.
```

Result: five commits. Node 24 is the minimum (`engines`, `.nvmrc`, `node:24-alpine`, CI matrix on 24 and 26). A `secureHeaders` middleware in `cmd/server` sets the five headers and the cache policy on every response, with httptest coverage that also exercises the static handler against `..` traversal, lifting `cmd/server` from 0% to 46.3% and the backend total to 77.5%. Scans: `npm audit` found 0 vulnerabilities in both packages; `govulncheck` reported 15 standard library vulnerabilities in Go 1.26.5 (all fixed by 1.26.9), so `go.mod` now pins 1.26.10 and the scan reports none; Trivy on the image found 0 in the Debian layer and in both Go binaries. A `security` CI job and Dependabot were added. Verified on Node 24.21.0: `make test`, `make e2e` (10 passed) and `docker build`.
