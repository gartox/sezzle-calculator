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

## 8. Code style with oxlint and Prettier, pull request validation, image publishing

Tool: Claude Code.

```text
Prompt 8. Start this only after prompt 7 is committed. Append this whole message verbatim to PROMPTS.md as prompt 8.

## Code style: oxlint stays, Prettier is added

- Keep oxlint as the linter in frontend and add the same setup to e2e: an .oxlintrc.json there (or one shared at the root if oxlint supports it cleanly) and a lint script.
- Add Prettier as a dev dependency in frontend and e2e with one shared configuration at the repository root, .prettierrc, matching the style the code already has: no semicolons, single quotes, print width 100, trailing commas everywhere. Add .prettierignore for node_modules, dist, coverage, playwright-report, test-results and package-lock.json.
- Scripts in both packages: format (prettier --write .) and format:check (prettier --check .).
- Run prettier --write once and commit that diff on its own as "Apply Prettier formatting" so the convention change is separate from any logic change. If oxlint and Prettier disagree on a rule, disable the stylistic rule in oxlint; Prettier owns formatting.
- Makefile: lint (gofmt check, go vet, oxlint in both packages), format (gofmt -w, prettier --write in both) and format-check targets. make lint and make format-check must be part of what CI runs.

## Validation on every pull request

- In .github/workflows/ci.yml, add lint and format:check steps to the frontend job and a lint plus format:check step sequence to the e2e job, before the tests, so a PR with lint or format violations fails fast. The workflow already triggers on pull_request to main; keep that.
- Add .github/pull_request_template.md with three short headings: What, Why, How it was tested.

## Publish the image from main

- Add a publish job that runs only on push to main (not on pull requests) and only after backend, frontend, docker, e2e and security succeed. It logs in to GitHub Container Registry with the built-in GITHUB_TOKEN (permissions packages: write, contents: read), builds the image with docker/build-push-action and pushes ghcr.io/gartox/sezzle-calculator tagged with latest and with the commit SHA. No other secrets.
- README: a Deploy section with the docker pull and docker run commands for that image, and a sentence that the image is published automatically from main by CI. A Code style section with the lint and format commands and one line on why oxlint plus Prettier.

## Verification before you report

make lint, make format-check, make test and make e2e must pass. The publish job cannot run locally; say so and show that the workflow file validates (for example with actionlint via its Docker image, or by reviewing the YAML carefully if that is not available).

Commit in steps: Prettier configuration and scripts, Apply Prettier formatting, oxlint for e2e and Makefile targets, CI validation steps and PR template, publish job and README sections. English messages, no mention of tooling. Do not push.

Report the commands run, the number of files Prettier changed, and the commit list, then stop and wait for prompt 9.
```

Result: five commits. Prettier 3.9 with the shared `.prettierrc` reformatted 7 files (five frontend sources and two `tsconfig.json`), committed on their own; oxlint had nothing to say about them, so no rule was disabled. e2e got the same oxlint setup and a `lint` script; the Makefile gained `lint`, `format` and `format-check`, and the frontend and e2e CI jobs run lint and `format:check` before the tests. The `publish` job pushes `ghcr.io/gartox/sezzle-calculator` (`latest` and the commit SHA) only on pushes to `main` after the five other jobs, with the workflow token alone. Verified on Node 24.21.0: `make lint`, `make format-check`, `make test` and `make e2e` (10 passed). The publish job cannot run locally; actionlint 1.7.12 reports 0 errors on the workflow (the Docker image pull stalled, so it ran through `go run` instead).

## 9. OpenAPI contract, rate limiting, request IDs and access log

Tool: Claude Code.

```text
Prompt 9. Finish prompt 8 first (actionlint check, record it in PROMPTS.md, commit). Prompts 7 and 8 are verified on my side on a clean clone with Node 24: lint, format, tests, npm audit, govulncheck, headers and traversal all good. Then start this. Append this whole message verbatim to PROMPTS.md as prompt 9.

## Contract as the source of truth: OpenAPI

- Write docs/openapi.yaml (OpenAPI 3.1) describing POST /api/v1/calculate and GET /api/v1/health: request schema with the operation enum and a and b as numbers, b documented as required except for sqrt; success schema; the error envelope schema with the code enum (every code the handler can return, including RATE_LIMITED below); one named example per error response; the 400, 405, 404, 413 if applicable, 422 and 429 responses; X-Request-Id as a response header on every operation.
- Serve it at GET /api/v1/openapi.yaml with Content-Type application/yaml, embedded in the binary with go:embed (move or copy the file so the embed path works without a build step, and keep exactly one source file; if it must live under backend/, make docs/openapi.yaml a short pointer in the README instead of a duplicate).
- Go contract test in internal/httpapi: parse the spec with a minimal YAML-free approach (or a tiny dependency-free scan of the code enum in the YAML) and assert that the set of error codes in the spec equals the set of Code constants in handler.go, and that the operation enum equals calculator.Operations. A drift on either side must fail the test. Standard library only.
- Frontend: generate src/api/schema.d.ts from the spec with openapi-typescript as a dev dependency, script generate:api. client.ts derives Operation and the error code type from the generated types instead of declaring them by hand. Commit the generated file. Add a CI step in the frontend job that runs generate:api and fails if git diff shows any change, so the spec and the client cannot drift.

## Rate limiting

- Middleware in its own file under internal/httpapi (or cmd/server if it fits better; justify in a comment) that limits POST /api/v1/calculate per client IP with a token bucket, standard library only. Defaults: 10 requests per second with a burst of 20, configurable with RATE_LIMIT_RPS and RATE_LIMIT_BURST; RATE_LIMIT_RPS=0 disables it.
- Over the limit: 429 with code RATE_LIMITED in the same envelope and a Retry-After header in whole seconds.
- Client IP from the connection's remote address. Only when TRUST_PROXY=true, take the first address of X-Forwarded-For. Document why it is off by default (spoofing).
- Evict idle buckets so memory does not grow without bound (for example a sweep every minute that drops buckets idle for more than three minutes), with a stop function wired into graceful shutdown.
- Unit tests with an injectable clock: burst allowed, request over the burst rejected with 429 and Retry-After, refill after time passes, separate IPs isolated, X-Forwarded-For ignored unless TRUST_PROXY, eviction of idle buckets, disabled when RPS is 0.
- The health endpoint and static files are not rate limited.

## Request ID and access log

- Middleware that reads X-Request-Id from the request if it is a safe value (up to 64 characters of letters, digits, dash and underscore), otherwise generates a random 16-byte hex ID with crypto/rand, sets it on the response header and in the request context.
- Access log with log/slog after each request: request ID, method, path, status, duration in milliseconds, bytes written, client IP. JSON handler when LOG_FORMAT=json, text otherwise. Never log request bodies.
- Error responses include the request ID in the envelope as error.requestId so a user can report it. Update the OpenAPI schema, the frontend ApiError (requestId field) and the alert text to show it in small print.
- Unit tests: ID propagated when valid, replaced when invalid or missing, present in the error envelope, log line has the fields (capture slog output).

## Tests, docs and checks

- Playwright API tests: X-Request-Id present on responses and echoed when sent; the error envelope carries requestId; GET /api/v1/openapi.yaml returns 200 and YAML. Do not test the 429 end to end; set RATE_LIMIT_RPS=0 in the Playwright webServer env so the suite never trips it, and say so in a comment.
- docs/api.http: add the openapi.yaml request and a request with a custom X-Request-Id.
- README: API section links the spec and says the frontend types are generated from it; a Rate limiting subsection with the defaults and env vars; Observability subsection with request ID and log format; update the error code table with RATE_LIMITED 429; Configuration table with every environment variable the server reads (PORT, STATIC_DIR, RATE_LIMIT_RPS, RATE_LIMIT_BURST, TRUST_PROXY, LOG_FORMAT) and its default; update the coverage table.

## Verification before you report

make lint, make format-check, make test, make e2e and docker build pass. Show with curl: X-Request-Id on a response, requestId in an error body, the openapi endpoint, and a burst that hits 429 with Retry-After (run the binary with RATE_LIMIT_RPS=1 RATE_LIMIT_BURST=2 and send five quick requests). Show npm run generate:api followed by an empty git diff. Break the contract on purpose once (remove a code from the spec in a scratch change), show the Go contract test failing, then revert.

Commit in steps: OpenAPI spec and served endpoint with contract test, generated client types and CI drift check, request ID and access log, rate limiting, end-to-end and api.http updates, README. English messages, no mention of tooling. Do not push.

Report the curl outputs, the contract test failure and revert, coverage per package and the commit list, then stop and wait for prompt 10.
```

Result: eight commits, with one session break mid-prompt. The OpenAPI document lives at `backend/internal/httpapi/openapi.yaml` because `go:embed` cannot reach outside the package; it is the single copy, served at `/api/v1/openapi.yaml`, and the README points to it instead of a duplicate under `docs/`. A standard-library contract test compares its `ErrorCode` and `Operation` enums with the handler's `Code` constants (parsed with `go/ast`) and `calculator.Operations`; it caught the new `RATE_LIMITED` before the spec had it, and a scratch removal of `RESULT_OVERFLOW` failed it as expected before the revert. openapi-typescript 7.13 only declares TypeScript 5, so an npm `overrides` entry points it at the project's TypeScript 6; CI regenerates the types and fails on any diff. Request IDs, a JSON or text access log and a per-IP token bucket (`RATE_LIMIT_RPS`, `RATE_LIMIT_BURST`, `TRUST_PROXY`) were added; with RPS 1 and burst 2, five quick requests gave 200, 200, then three 429s with `Retry-After: 1`. Verified on Node 24.21.0 and Go 1.26.10: `make lint`, `make format-check`, `make test` (httpapi 100%, server 47.3%, calculator 96.9%, healthcheck 57.1%, frontend 100%), `make e2e` (14 passed) and `docker build` (13.8 MB). Two small follow-ups came out of verification: the README log example now uses a captured line, and the shutdown timeout logs as `10s` instead of nanoseconds in JSON.

## 10. Adversarial review, known fixes and final clean-clone verification

Tool: Claude Code.

```text
Prompt 10. Jesús wants you to continue the work from where it stopped and take it to a submittable state. Append this whole message verbatim to PROMPTS.md as prompt 10. Work through all of it without waiting for another prompt.

## 1. Adversarial review

Act as the Sezzle senior engineer who has ten minutes and twenty other candidates. Read the repository cold, as if you had not written it, and list every finding in severity order: correctness bugs, untested edge cases, non-idiomatic Go or React, inconsistencies between README, OpenAPI, code and tests, anything that would make a reviewer frown. Probe at least: very large and very small magnitudes, negative zero, numbers in exponent notation, a JSON body with duplicate keys, extra unknown fields, operation in a different case ("ADD"), whitespace around the operation, a body with only whitespace, a Content-Type other than JSON, concurrent requests under the race detector with rate limiting on, and what the UI shows for each backend error code. Write the findings to your reply first, then fix every one that is a real defect. For each finding you decide not to fix, give one line of reason.

## 2. Known items to fix

- README prerequisites say Go 1.26 while go.mod requires 1.26.10; with an older 1.26 patch the build depends on downloading the toolchain. State the exact versions (Go 1.26.10 or newer, Node 24 or newer) in every place they appear: README, Makefile help if relevant, CI, Dockerfile comments.
- Calculator.tsx is one 124-line component. Extract a small NumberField component for the labeled input with its error, so no function in the frontend is longer than about 60 lines. Keep the tests passing and add one for NumberField if it carries logic.
- Scope: the assignment asked for 2 to 4 hours. Add a short "Scope" section near the top of the README that separates what was required (the calculator, tests with coverage, README, prompts, optional Dockerfile) from what was added beyond it (end-to-end tests, security hardening and scanning, OpenAPI with generated types, rate limiting, request IDs, CI and image publishing), with one line on why each extra was worth it for a payments company. Do not claim a time spent.
- PROMPTS.md: add an empty section at the end titled "What I did without AI" containing only the line "To be written by the author." Do not write its content; Jesús writes it.

## 3. Final verification

Clone the repository into a new empty folder outside it and, on Node 24 and Go 1.26.10, follow the README literally from top to bottom: every quick start option, every curl example compared byte for byte, make lint, make format-check, make test, make e2e, docker compose up with the health check reaching healthy. Then run the three security scans. Paste the real output of each step. If anything fails, fix it in the original repository, commit, and repeat the clean-clone run until it passes from start to finish.

## Rules

Small commits on main with clear English messages. No AI markers anywhere: the local commit-msg hook rejects them. Do not create a remote and do not push; that needs Jesús's explicit yes. When done, report: the findings list with what you fixed and what you did not, the clean-clone results, coverage per package, the final commit count, and the commit list for this prompt. Then stop.
```

Result: the probes and a cold read found 21 items; 15 were fixed in small commits and 6 were kept with a reason. Fixed: a missing hashed asset fell back to `index.html` with a one-year immutable cache, and `/assets/` listed its files (both now 404, not cached); repeated JSON keys silently took the last value and keys matched case-insensitively (now exact keys, duplicates rejected); any `Content-Type` was accepted (now `415 UNSUPPORTED_MEDIA_TYPE`); a `null` body and a missing operation had misleading errors; negative zero leaked as `-0`; HEAD on the health check was 405; the e2e script could test a stale bundle; the Go image tag floated while `go.mod` needs 1.26.10; the README described pattern routing the code does not use and stated Go 1.26 instead of 1.26.10. Added tests for concurrent rate limiting under `-race` and for the alert shown for every error code. Kept by design: exact lowercase operation names, 12-significant-digit rounding of large integers, the mux's `/api` redirect, the indentation-based contract scan, 405 on OPTIONS, and results that arrive after an edit. `Calculator` was split into `NumberField`, `OperationSelect`, `CalculationResult` and a `useCalculation` hook (longest frontend function now 57 lines). The README gained a Scope section. A clean clone followed the README twice on Node 24.21.0 and Go 1.26.10: Compose healthy, `docker build` and `docker run`, `make run`, the hot-reload pair through the Vite proxy, 8 of 8 curl examples byte for byte, `make test`, `coverage`, `e2e` (15 passed), `lint`, `format` and `format-check` with no changes left behind, and clean `npm audit`, `govulncheck` and Trivy. The first run found one wrong test count in the README, fixed before the second.

## 11. Product UI with atomic design and Storybook (phase A)

Tool: Claude Code.

```text
Prompt 11. This replaces the stopped prompt 11, which was never applied. Append this whole message verbatim to PROMPTS.md as prompt 11 and keep the "What I did without AI" section last in the file.

Jesús tested the app by hand: the form with two inputs and a select does not feel like a calculator. We are rebuilding the UI as a product, with atomic design and Storybook. The API contract does not change: every arithmetic result still comes from POST /api/v1/calculate, chaining is several calls, sqrt sends only a, percent stays "a percent of b", status comes from GET /api/v1/health, errors carry requestId.

This prompt has two phases with a review gate. Do phase A only, then stop and report. Phase B starts only when I send the go-ahead.

## Design research and decisions (write this into docs/design.md in your own words, as the design rationale)

References and what we take from each:
- iOS Calculator: 4-column keypad, equals at bottom right, the active operator stays highlighted, the value shrinks to fit. We follow the standard layout to reuse users' muscle memory.
- Google Calculator: the expression line stays visible above the result, backspace sits next to equals, history is one tap away.
- Windows Calculator: full keyboard parity, history beside the keypad on wide screens.
- Fintech products: calm neutrals, a single accent color, tabular numbers, clear states, no decorative gradients.

UX principles and how each is applied:
- Recognition over recall: the expression line always shows what was typed, with real symbols ("2 + 3 ×", "15 % of 200").
- Visibility of system status: a Ready or Offline pill backed by the health endpoint; a busy state on the equals key that appears only if a response takes longer than 300 ms, to avoid flicker.
- Error prevention: the keypad blocks a second dot and entries longer than 15 digits; equals looks inactive when there is nothing to calculate.
- Error recovery: an error replaces the result with a plain explanation and a small "Ref" with the request ID, keeps the expression visible, and any key recovers.
- Fitts's law: keys at least 56 px on phones, equals the most prominent, zero double width.
- Platform conventions: layout below, operator column in accent, active operator marked with aria-pressed and a visible outline, not color alone.
- Accessibility: WCAG AA contrast in both themes, visible focus, accessible names on every key, results announced through aria-live="polite", prefers-reduced-motion respected.
- Keyboard parity: 0 to 9 and . for input, + - * / ^ % for operators, Enter or = for equals, Backspace, Escape for all clear, r for square root, n for sign; a key typed on the keyboard briefly shows its pressed state on screen.

Layout, phone first:
- Header: product name "Calculator" and the status pill.
- Display: expression line (small, muted) above the value (large, right aligned, tabular, grouped with thousands separators for display only, shrinking to fit and switching to exponent notation beyond what fits). Tapping or clicking the value copies it, with a short "Copied" confirmation announced politely.
- Function row with secondary chips: √x and xʸ, plus a History toggle.
- Keypad, 4 columns:
  AC, ±, %, ÷
  7, 8, 9, ×
  4, 5, 6, −
  1, 2, 3, +
  0 (double width), ., ⌫ ... rebalance as needed so that equals sits at the bottom right and backspace sits next to it; if the grid needs a fifth row, use: 0, ., ⌫, = with zero single width. Choose the version that keeps 4 equal columns and document the choice.
- History: last 10 results, client side only (sessionStorage wrapped in try/catch, works without it). Each entry shows expression and result and reuses the result as the current value when clicked. On screens 900 px and wider it sits beside the calculator; on phones it opens as a sheet from the toggle.
- Evaluation is left to right like a basic calculator: 2 + 3 × 4 = 20, with the intermediate 5 shown after pressing ×.

Visual identity: our own, calm and fintech-like. Do not imitate Sezzle's brand or any other product's colors or wording. Neutral graphite and ivory surfaces, one accent for operators and equals, system font stack, tabular numbers, soft radius, subtle press feedback. Light and dark themes from prefers-color-scheme, both validated for contrast.

## Atomic design structure

src/design/tokens.css with CSS custom properties for color (light and dark), spacing, radius, typography, shadow and motion. Components live under src/components/atoms, molecules, organisms, templates and pages, each with its .tsx, a CSS Module, a .stories.tsx and tests where there is logic:
- Atoms: Key (variants digit, operator, function, utility, equals; states default, hover, active operator, pressed, disabled, busy), StatusDot, Icon (inline SVG for backspace and history), Spinner, VisuallyHidden.
- Molecules: StatusPill, ExpressionLine, DisplayValue (formatting, shrink to fit, copy), ErrorNotice (message and Ref), HistoryItem.
- Organisms: CalculatorHeader, Display, Keypad (grid, keyboard highlight), HistoryPanel.
- Templates: CalculatorTemplate (responsive layout, history beside or as a sheet).
- Pages: CalculatorPage, which wires the keypad state and the API. It receives the API client and the health check as props with the real ones as defaults, so stories and tests inject fakes without network mocking libraries.
- Keypad state as a pure reducer in src/calculator/keypad.ts, no React and no network.

## Storybook

Storybook 10.6.3 with @storybook/react-vite, addon-docs (autodocs), addon-a11y with axe failing on violations, and addon-vitest so every story runs as a test in a real browser (Chromium through Playwright). A Foundations docs page shows the tokens: color swatches with contrast ratios, spacing scale, type scale, radius and motion. Every component has stories for each variant and state, in light and dark. Organisms and the page get play functions for interaction (typing a calculation, chaining, an error, keyboard only). Scripts: storybook, build-storybook, test-storybook. Makefile targets: storybook, storybook-build, storybook-test.

## Phase A: build now, then stop

1. docs/design.md with the research, principles, layout and identity decisions above, in your words.
2. Storybook installed and configured as described, with the Foundations page.
3. Tokens, all atoms and all molecules, each with stories in light and dark and a11y passing.
4. Screenshots captured with Playwright from Storybook, saved under docs/design/: Foundations, the Key atom with all variants, and the molecules, each at 375 and 1024 px wide in light and dark.
5. make lint, make format-check and the Storybook story tests pass. Nothing in the running app changes yet: the old form stays until phase B.

Commit in small steps with clear English messages; no AI markers (the local hook rejects them); no remote, no push. Report the screenshot paths, the story count and the a11y results, then stop and wait for the phase B go-ahead.
```

Result (phase A only; phase B waits for the go-ahead): `docs/design.md` records the research, principles, layout and identity. The bottom row is `0 . ⌫ =` with zero at single width, the only option that keeps four equal columns with equals bottom right and backspace beside it. Storybook 10.6.3 runs with the docs, a11y and Vitest addons; a theme decorator renders every story in light and dark side by side, so axe (set to fail) checks both in one run. Tokens, a Foundations page with contrast ratios computed live from the resolved tokens, five atoms and five molecules came with 61 stories, all passing axe in Chromium, and 140 unit tests at 100% frontend coverage. 32 screenshots are in `docs/design/` (seven targets plus a real-pointer hover capture of the keys, at 375 and 1024 px in both themes). Findings along the way: axe flagged "AC" and "√x" under WCAG 2.5.3 (label in name), so their names became "AC, all clear" and "square root of x"; the history item's accessible name ran its parts together until explicit spaces were added; shrink to fit overflowed at 375 px until separators were weighted as half a digit; a fake-timer test raced with real time and was rewritten with a manual clock; and the jsdom smoke test used `import.meta.glob`, which Vitest's file-system module cache left stale, silently skipping new stories, so it now scans the directory at run time. The running app is unchanged: its sources are identical to `6b1b7fe`, and `make test` and `make e2e` (15 passed) still pass. Storybook tests are not yet in CI; that belongs with phase B.

## 12. Backend and pipeline review fixes

Tool: Claude Code.

```text
Prompt 12. Before phase B of the UI, the backend and the pipeline must be at 100%. An independent reviewer (Codex, acting as the CTO of a payments company) reviewed the backend and infrastructure and requested changes. I reproduced or confirmed every finding below against the code; all eleven are real. Fix all of them. Append this whole message verbatim to PROMPTS.md as prompt 12 and keep the author section last.

Do not touch the design system work from prompt 11 phase A, except the generated API types and the API client if the OpenAPI change below requires it.

## Correctness

1. Percent overflows in the intermediate step (calculator.go, percent): percent(100, 1e308) returns RESULT_OVERFLOW although 1e308 is representable. Compute so that a representable result never overflows in between (for example try a*b/100 and fall back to (a/100)*b or a*(b/100) when the first is not finite, then round). Add table cases: intermediate overflow that should succeed, subnormal operands, and a genuine overflow that must still fail.
2. Underflowing literals silently become zero (handler decode): {"operation":"divide","a":1,"b":1e-999} answers DIVISION_BY_ZERO, and 1e-999 + 0 answers 0, although the README promises out-of-range literals are rejected. Decode operands with json.Number or an equivalent that keeps the lexeme, and reject a nonzero literal that parses to zero or to infinity with INVALID_OPERAND and a clear message. Add positive and negative underflow tests, and make the README and the OpenAPI say exactly what happens.

## Rate limiting

3. RATE_LIMIT_RPS and RATE_LIMIT_BURST validation (cmd/server/main.go and the limiter constructor): NaN and ±Inf are accepted; NaN breaks refill after the first request, +Inf disables throttling. Reject non-finite values at startup with a clear error and validate the constructor inputs the same way. Test both.
4. Eviction resets slow buckets early (ratelimit.go sweep): a depleted bucket is evicted after three minutes even when refilling takes longer, and the client gets a full burst back. Evict only buckets that would already be full, that is idle for at least max(idleTTL, burst/rps). Test a low-rate configuration with the injected clock.
5. Unbounded bucket map: a client rotating addresses (IPv6) grows memory without limit, and the sweep scans the whole map under the request mutex. Add a maximum bucket count (configurable, sensible default such as 10,000) with a documented admission policy, for example evicting the least recently seen bucket or answering 429 for new clients when full; keep the sweep cheap. Test saturation and concurrent access under -race.

## Static files

6. Symlinks escape STATIC_DIR (cmd/server/main.go): http.Dir and os.Stat follow symlinks outside the directory, contrary to the README. Serve through os.Root (os.OpenRoot and root.FS(), Go 1.24+) so lookups are confined, keep the index.html fallback and the 404 for missing assets, and add a test with a symlink that points outside the directory.

## Contract

7. OpenAPI request schema (backend/internal/httpapi/openapi.yaml, CalculateRequest): it requires only operation and a, so it accepts {"operation":"add","a":1}, which the handler rejects. Model a unary request (sqrt) and a binary request (the other six) as oneOf branches with b required for binary. Regenerate the frontend types, adjust the client if the types change, and extend the contract test so it validates representative valid and invalid requests and responses against the schema itself, not only the enums. Standard library only on the Go side; if real schema validation needs a dependency, do that check in the frontend or e2e package with a small, justified dev dependency instead.

## CI and supply chain

8. Publish the artifact that was tested (ci.yml): today publish rebuilds the image separately from the one scanned, and no job starts the container. Build the image once, run it in CI with a smoke test (health becomes healthy, a calculation returns the expected result, an error returns the envelope), scan that same image with Trivy, and publish that exact image by digest.
9. Pin what executes in CI: pin every action to a full commit SHA with the version in a trailing comment (resolve the SHAs with gh api, do not guess them), pin govulncheck to a specific version instead of @latest, and pin the Dockerfile base images by digest with the tag kept in a comment. Make sure Dependabot keeps all three kinds of pins up to date.
10. Ordered publishing: add a concurrency group to the publish path so an older run cannot overwrite latest after a newer one, and publish an immutable commit tag next to latest. Document in the README that deployments should use the digest or the commit tag.

## Tooling

11. Makefile gofmt checks (lint and format-check): the recipe ignores the exit status of gofmt -l, so a syntax error with empty stdout passes. Fail when gofmt exits non-zero as well as when it lists files. Prove it once by introducing a syntax error in a scratch copy, then discard the copy.

## Verification before you report

Run make lint, make format-check, make test with -race, make e2e, the storybook tests from phase A, docker build, the container smoke test you added, and the three security scans, on Node 24.21.0 and Go 1.26.10, and then repeat everything from a clean clone. Show the curl output for: percent 100 of 1e308, divide 1 by 1e-999, the server refusing RATE_LIMIT_RPS=NaN, and a request rejected by the new OpenAPI schema check. Update the README where behavior changed and the coverage table.

Small commits with clear English messages, one per finding where practical, no AI markers, no remote, no push. Report a table with each finding number, the commit that fixed it and the test that proves it, then stop. After this, the reviewer will review again before UI phase B starts.
```

Result: all eleven findings fixed, one commit per finding except the CI and supply chain work, which took four. Percent now falls back to reordered forms only when `a*b/100` is not finite, so `percent(100, 1e308)` is `1e308` while `200% of 1e308` still overflows. Operands are decoded as `json.Number`, and a literal that would overflow or round to zero is `INVALID_OPERAND`, so `1 / 1e-999` no longer looks like a division by zero. The rate limiter takes a validated config that refuses NaN and infinities at startup and in the constructor. It evicts only buckets idle for `max(3 min, burst/rps)`, and caps tracked clients at 10,000 by default, evicting the least recently seen rather than refusing new clients. Static files go through `os.Root`; a test with symlinks to a file and a directory outside `STATIC_DIR` failed before the change and passes after it. The request schema is a `oneOf` of unary and binary requests. An Ajv contract suite in the e2e package validates requests and live responses against the served document; weakening the schema on purpose made it fail. CI builds the image once, smoke tests and scans it, and publishes that artifact after checking its image ID. The commit tag is never overwritten, and `latest` moves only from the head of `main`. Actions are pinned by commit SHA, govulncheck v1.9.0 by a separate tools module, and base images by digest, all kept current by Dependabot. The Makefile gofmt check now fails on a syntax error, proven on a scratch copy that was then deleted. Two slips were caught along the way: an assignment that would have hidden a nil pointer inside an error interface, and a `git checkout` that briefly reverted the uncommitted schema, restored from a backup before going on. Verified locally and again from a clean clone on Node 24.21.0 and Go 1.26.10: lint, format, race tests, 143 frontend unit tests at 100%, 30 e2e tests, 61 story tests, docker build, the container smoke test, and clean `npm audit`, govulncheck and Trivy.

## 13. Second review: fail-closed publishing and regression tests for every guard

Tool: Claude Code.

```text
Prompt 13. The reviewer re-reviewed prompt 12 and still requests changes. Seven findings are FIXED. Four are PARTIALLY FIXED because nothing would fail if someone reverted the fix, and there are four new findings. I checked them against the code; all are real. Append this whole message verbatim to PROMPTS.md as prompt 13 and keep the author section last. Do not start UI phase B and do not touch the design system.

## New findings

1. ci.yml publish, registry lookup fails open: any failure of docker manifest inspect (timeout, auth, 5xx) falls through to docker push, so a transient error on a rerun can overwrite a commit tag the README calls immutable. Proceed with the push only on a positively identified "manifest not found"; fail the job on any other error.
2. ci.yml publish, promotion cannot recover: if the commit tag is pushed but the head check or the latest push fails, a rerun finds the commit tag, skips, and never promotes. Separate the two steps: publishing the commit tag is idempotent, and promotion always resolves the published digest, checks that this commit is still the head of main, and points latest at that digest.
3. scripts/smoke-test.sh checks bodies but not status codes: assert exactly 200 for health, 200 for the calculation and 422 for the division by zero, alongside the body checks.
4. The missing-asset cache test was lost: restore a test that runs the real stack, secureHeaders around the static handler built by mustStaticHandler, and asserts that a missing asset under /assets/ returns 404 without the immutable Cache-Control, that an existing hashed asset keeps it, and that an asset reached through an outside symlink is refused.

## Close the partial findings with tests that would fail on regression

5. Move the publish logic out of inline YAML into scripts/publish.sh, a POSIX shell script that takes the image, the commit and the registry as arguments and calls docker through a variable such as DOCKER=${DOCKER:-docker}. Add scripts/publish_test.sh that runs it against a fake docker (a small script on PATH that records calls and answers from fixtures) and covers: tag absent then pushed; tag already present then not pushed and promotion still attempted; lookup unauthorized or timing out then the script fails without pushing; commit no longer head of main then latest is not moved; promotion failed once then succeeds on a rerun. Run it in CI and from the Makefile.
6. Add scripts/check-supply-chain.sh, run in CI and by make lint, that fails if any uses: in .github/workflows is not a 40-character SHA, if any FROM in the Dockerfile has no @sha256 digest, or if govulncheck or any go run or go install in the repo uses @latest. Add a test that feeds it a fixture with each violation and expects failure.
7. Add a regression test for the Makefile gofmt guard: a script that copies a file with a syntax error into a temporary module, runs the same GOFMT_CHECK recipe against it, and expects failure; and does the same with an unformatted but valid file. Run it from make test or a dedicated target that CI calls.
8. For publication ordering, the publish_test.sh case "commit no longer head of main" is the regression test; mention in the README that the concurrency group plus that check is what prevents an older run from moving latest.

## Verification before you report

make lint, make format-check, make test with -race, make e2e, the storybook tests, the new shell tests, the smoke test against a freshly built container, docker build, and the three scans, on Node 24.21.0 and Go 1.26.10, then again from a clean clone. Prove each new guard once by breaking it in a scratch copy and showing the failure, then discard the scratch copy. shellcheck the new scripts if it is available, through its Docker image if it is not installed.

Small commits with clear English messages, no AI markers, no remote, no push. Report a table with finding number, commit and the test that would fail on regression, then stop. The reviewer reviews again after this.
```

## What I did without AI

To be written by the author.
