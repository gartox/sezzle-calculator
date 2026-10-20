# Calculator

A full-stack calculator: a Go REST API that performs the arithmetic and a React frontend that calls it.

[![CI](https://github.com/gartox/sezzle-calculator/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gartox/sezzle-calculator/actions/workflows/ci.yml)

## What it does

Seven operations: add, subtract, multiply, divide, power, square root and percent, each validated on both sides and computed by the API.

Stack: Go 1.26.10 standard library for the API, React 19 with TypeScript and Vite for the UI (Node 24 or newer), Playwright for end-to-end tests, Docker for packaging.

## Quick start

All commands run from the repository root. The three options are independent; pick one.

### Docker

Prerequisites: Docker Engine with Compose v2.

```bash
docker compose up --build
```

Open http://localhost:8080. Stop with `Ctrl+C`, then `docker compose down`.

The same image without Compose:

```bash
docker build -t sezzle-calculator .
```

```bash
docker run --rm -p 8080:8080 sezzle-calculator
```

### Local build

Prerequisites: Go 1.26.10 or newer and Node 24 or newer (`.nvmrc` selects 24). `backend/go.mod` requires Go 1.26.10; an older Go 1.26 release would have to download that toolchain first.

```bash
make run
```

This installs the frontend dependencies, builds the bundle into `frontend/dist`, compiles the server into `bin/server` and starts it. Open http://localhost:8080. Stop with `Ctrl+C`.

### Development with hot reload

Prerequisites: Go 1.26.10 or newer and Node 24 or newer.

Terminal one, the API:

```bash
cd backend && go run ./cmd/server
```

Terminal two, the UI:

```bash
cd frontend && npm ci && npm run dev
```

Open http://localhost:5173. The Vite dev server proxies every `/api` request to the Go server on port 8080, so the browser stays same-origin and no CORS setup is needed. The Go server logs that no frontend build was found and serves the API only; that is expected here, Vite serves the UI.

### Deploy

CI publishes the image to GitHub Container Registry automatically on every push to `main`, once all the other jobs have passed, tagged `latest` and with the commit SHA.

```bash
docker pull ghcr.io/gartox/sezzle-calculator:latest
```

```bash
docker run --rm -p 8080:8080 ghcr.io/gartox/sezzle-calculator:latest
```

Open http://localhost:8080. To pin a build, replace `latest` with the commit SHA shown in the `publish` job.

## Project layout

```
.
├── backend/                  Go module, standard library only
│   ├── cmd/server/           entrypoint: config, graceful shutdown, serves the UI
│   ├── cmd/healthcheck/      tiny probe used as the container health check
│   └── internal/
│       ├── calculator/       pure arithmetic and rounding, no HTTP
│       └── httpapi/          JSON handler, OpenAPI document, request IDs, access log, rate limit
├── frontend/                 React 19 + TypeScript + Vite
│   └── src/
│       ├── api/client.ts     typed client for POST /api/v1/calculate
│       ├── api/schema.d.ts   types generated from the OpenAPI document
│       └── components/       Calculator form and input validation
├── e2e/                      Playwright tests (browser and API) against the real stack
├── docs/api.http             ready-to-run requests for the VS Code and JetBrains HTTP clients
├── .github/workflows/ci.yml  lint, tests, scans, image build and publish
├── Dockerfile                multi-stage build, distroless runtime image
├── docker-compose.yml        one service with a health check
├── Makefile                  run `make` to list the targets
└── PROMPTS.md
```

## API

One endpoint performs every operation. The contract is an OpenAPI 3.1 document, [backend/internal/httpapi/openapi.yaml](backend/internal/httpapi/openapi.yaml), embedded in the binary and served at `GET /api/v1/openapi.yaml`. It lives inside the Go package because `go:embed` can only read files there; it is the only copy. The frontend's request, response and error types in `frontend/src/api/schema.d.ts` are generated from it with `npm run generate:api`, a Go test fails if its enums disagree with the handler's error codes or the calculator's operations, and CI fails if the generated types are stale.

```
POST /api/v1/calculate
Content-Type: application/json
```

Request:

```json
{"operation": "add", "a": 2, "b": 3}
```

Success, `200 OK`:

```json
{"result": 5}
```

`operation` is one of `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`, `percent`. `a` and `b` are JSON numbers. `sqrt` uses only `a`; the other six need both.

Every error has the same shape, `{"error": {"code": "...", "message": "...", "requestId": "..."}}`. The code is stable and meant for clients; the message is for people; the request ID identifies the request in the server log (see [Observability](#observability)).

| Code | Status | When |
|---|---|---|
| `INVALID_JSON` | 400 | The body is not a JSON object, has a wrong type (for example `"a": "2"`), repeats a key, is empty, has data after the object, or exceeds 1 MiB. |
| `INVALID_OPERATION` | 400 | `operation` is missing or not exactly one of the seven: names are lowercase and are not trimmed, so `ADD` and `" add "` are rejected. |
| `INVALID_OPERAND` | 400 | `a` is missing, or `b` is missing for a two-operand operation. Also NaN or infinite operands, which JSON cannot carry but the calculator package rejects on its own. |
| `DIVISION_BY_ZERO` | 422 | `divide` with `b` equal to 0. |
| `NEGATIVE_SQRT` | 422 | `sqrt` with `a` below 0. |
| `RESULT_OVERFLOW` | 422 | The result is not a finite number: `1e308 * 10`, `0 ^ -1`, `(-8) ^ 0.5`. |
| `METHOD_NOT_ALLOWED` | 405 | Any method other than POST on the endpoint (an `Allow` header lists the right one). |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | The request's `Content-Type` is not `application/json` (a `charset` parameter is fine). |
| `NOT_FOUND` | 404 | Any other path under `/api/`. |
| `RATE_LIMITED` | 429 | The client sent more calculations than its per-IP limit allows. A `Retry-After` header gives the wait in whole seconds. |

400 means the request is malformed; 422 means it was well formed but the operation cannot be performed.

Health check, used by Docker and Compose:

```
GET /api/v1/health  ->  200 {"status":"ok"}
```

### Rate limiting

`POST /api/v1/calculate` is limited per client IP with a token bucket: by default each client may send 20 requests at once and 10 per second after that. Over the limit the API answers `429 RATE_LIMITED` with `Retry-After`. The health check, the OpenAPI document and the static UI are not limited. Buckets idle for three minutes are dropped by a sweep that runs every minute, so memory is bounded by recently active clients.

The client IP is the TCP peer address. `X-Forwarded-For` is ignored unless `TRUST_PROXY=true`, because any client can set that header and would otherwise choose its own IP and bypass the limit. Turn it on only behind a reverse proxy that overwrites the header. The limit is per server instance; several replicas would each keep their own buckets.

### Observability

Every response carries an `X-Request-Id` header. A caller may send its own (1 to 64 letters, digits, dashes or underscores) and it is echoed back; anything else is replaced by 32 random hex characters. Error bodies repeat it as `error.requestId`, and the UI shows it in small print under an error so a user can quote it.

The server writes one access log line per request with the request ID, method, path (without the query string), status, duration in milliseconds, bytes written and client IP. Request bodies are never logged. Logs go to standard error as text by default, or as JSON with `LOG_FORMAT=json`:

```json
{"time":"2026-10-20T15:10:36.523224-06:00","level":"INFO","msg":"request","request_id":"readme-example","method":"POST","path":"/api/v1/calculate","status":422,"duration_ms":0.052,"bytes":102,"client_ip":"::1"}
```

### Configuration

The server reads these environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on. |
| `STATIC_DIR` | `frontend/dist` | Built frontend to serve; when the directory is missing only the API is served. The Docker image sets `/app/frontend/dist`. |
| `RATE_LIMIT_RPS` | `10` | Calculations per second per client IP. `0` disables rate limiting. |
| `RATE_LIMIT_BURST` | `20` | Requests a client may send at once before the per-second rate applies. Must be at least 1. |
| `TRUST_PROXY` | unset | `true` takes the client IP from the first `X-Forwarded-For` address. Leave unset unless a proxy sets that header. |
| `LOG_FORMAT` | text | `json` switches all logs to JSON lines. |

### Examples

Start the server first (any of the quick start options), then run these from a second terminal.

Add. The result is rounded to 12 significant digits, so `0.1 + 0.2` is `0.3`:

```bash
curl -s -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' -d '{"operation":"add","a":0.1,"b":0.2}'
```

```json
{"result":0.3}
```

Square root uses only `a`:

```bash
curl -s -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' -d '{"operation":"sqrt","a":16}'
```

```json
{"result":4}
```

Percent is "`a` percent of `b`", so 15% of 200:

```bash
curl -s -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' -d '{"operation":"percent","a":15,"b":200}'
```

```json
{"result":30}
```

Error responses include a request ID. Without an `X-Request-Id` header it is random on every call, so the error examples below send a fixed one to make the output reproducible.

Division by zero, `422`:

```bash
curl -s -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' -H 'X-Request-Id: readme-example' -d '{"operation":"divide","a":1,"b":0}'
```

```json
{"error":{"code":"DIVISION_BY_ZERO","message":"Cannot divide by zero.","requestId":"readme-example"}}
```

Unknown operation, `400`:

```bash
curl -s -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' -H 'X-Request-Id: readme-example' -d '{"operation":"modulo","a":1,"b":2}'
```

```json
{"error":{"code":"INVALID_OPERATION","message":"Unknown operation \"modulo\". Supported operations: add, subtract, multiply, divide, power, sqrt, percent.","requestId":"readme-example"}}
```

Malformed body, `400`:

```bash
curl -s -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' -H 'X-Request-Id: readme-example' -d '{"operation":"add",'
```

```json
{"error":{"code":"INVALID_JSON","message":"Request body must be a JSON object with a string \"operation\" and numeric \"a\" and \"b\".","requestId":"readme-example"}}
```

GET on the endpoint, `405` with `Allow: POST`:

```bash
curl -s -H 'X-Request-Id: readme-example' localhost:8080/api/v1/calculate
```

```json
{"error":{"code":"METHOD_NOT_ALLOWED","message":"Use POST to calculate.","requestId":"readme-example"}}
```

The OpenAPI document:

```bash
curl -s localhost:8080/api/v1/openapi.yaml | head -3
```

```yaml
openapi: 3.1.0
info:
  title: Calculator API
```

The same requests, plus the health check and a custom request ID, are in [docs/api.http](docs/api.http) for the VS Code REST Client extension and the JetBrains HTTP client.

## Tests

### Unit tests

Each layer has its own suite. Both run with:

```bash
make test
```

Backend (`make backend-test`): table-driven tests in `internal/calculator` for every operation, negative and large numbers, rounding, division by zero, negative square roots, overflow, NaN and infinite operands; `httptest` cases in `internal/httpapi` for the happy path and every error code, including empty, oversized and wrongly typed bodies. They run with the race detector.

Frontend (`make frontend-test`): Vitest with Testing Library. The API client is tested with a mocked `fetch` for the success path, each error path and the exact request it sends. The `Calculator` component is tested with the client mocked: rendering, validation, result and error display, the hidden `b` input for square root, the disabled button while a request is pending, and clearing of stale output.

### Coverage

```bash
make coverage
```

This writes `backend/coverage.txt` (`go tool cover -func` output) and `frontend/coverage.txt` (the Vitest v8 text table; an lcov report lands in `frontend/coverage/`). Both files are committed so the numbers can be read without running anything.

| Package | Coverage | Note |
|---|---|---|
| `backend/internal/calculator` | 96.9% | The only uncovered branch is an unreachable fallback in `Round`. |
| `backend/internal/httpapi` | 100% | Includes the rate limiter (with a fake clock), request IDs, the access log and the OpenAPI contract test. |
| `backend/cmd/healthcheck` | 57.1% | `check` is fully tested; `main` is not. |
| `backend/cmd/server` | 47.3% | The security headers middleware, the static handler (including traversal attempts), the logger and the environment parsing are tested. `run` (startup and graceful shutdown) is not; the end-to-end suite and the Docker verification exercise it. |
| `frontend/src` | 100% | Statements, branches, functions and lines. |

### End-to-end

Playwright drives the real stack: the Go binary serving the built frontend. Three browser tests (add, divide by zero, square root) use accessible locators only, and eleven API tests cover the health endpoint, rounding, each main error code, the `405` with its `Allow` header, a malformed body, the security headers, request IDs and the OpenAPI endpoint. The suite starts the server with `RATE_LIMIT_RPS=0`; the `429` path is covered by unit tests instead.

Install once (dependencies and Chromium):

```bash
make e2e-install
```

Then:

```bash
make e2e
```

Playwright starts the stack itself on port 8090, rebuilding the frontend bundle and the binary first so it never tests stale code. If something is already listening on 8090, for example the container started with `docker run --rm -p 8090:8080 sezzle-calculator`, the tests run against that instead. The suite is deliberately not part of `make test` so unit tests stay fast.

### CI

The workflow in `.github/workflows/ci.yml` runs on every push and pull request to `main` with six jobs: `backend` (gofmt check, `go vet`, tests with the race detector), `frontend` (`npm ci`, a check that the generated API types match the OpenAPI document, typecheck, lint, format check, tests, build, as a matrix on Node 24 and 26), `docker` (the image builds without being pushed), `e2e` (lint, format check and Playwright on Chromium with Node 24, with the HTML report uploaded as an artifact on failure), `security` (the scans described under [Security](#security)) and `publish` (pushes to `main` only, after the others pass; see [Deploy](#deploy)).

## Code style

```bash
make lint
```

```bash
make format
```

```bash
make format-check
```

`lint` runs `gofmt` and `go vet` on the backend and oxlint in `frontend/` and `e2e/`; `format` runs `gofmt -w` and Prettier (`--write`) in both packages; `format-check` fails if either tool would change a file. The shared Prettier configuration is `.prettierrc` at the repository root: no semicolons, single quotes, print width 100, trailing commas. oxlint finds bugs (unused values, hook misuse, unsafe patterns) and Prettier owns formatting, so neither tool has an opinion the other would fight. Both checks run in CI before the tests, so a pull request with lint or formatting violations fails fast.

## Design decisions

**One endpoint with an operation enum.** `POST /api/v1/calculate` takes the operation as a field. The alternative, one route per operation, means seven handlers with the same decoding and error handling. A single handler validates once and the frontend needs one client function.

**Standard library only.** `net/http`, `encoding/json`, `mime` and `log/slog` cover everything this service needs. Routes are registered by path and each handler checks the method itself, because Go's method patterns answer a wrong method with a plain-text 405 instead of the JSON error envelope. A framework would add a dependency and a learning curve for reviewers without removing any code here.

**A pure calculator package.** `internal/calculator` knows nothing about HTTP: it takes an operation and two floats and returns a result or a sentinel error. `internal/httpapi` only decodes, validates presence, and maps those errors to status codes with `errors.Is`. The arithmetic can be tested with a table and reused by anything else, and the handler tests stay about HTTP.

**Error envelope and the 400 versus 422 split.** Every failure returns `{"error": {"code", "message"}}`, including 404 and 405, which Go's default mux would otherwise answer in plain text. Codes let the frontend react without parsing messages. 400 is reserved for requests the server could not understand; 422 is for well-formed requests whose operation is impossible, so a client can tell a bug in its request from a bad input by the user.

**Numeric precision.** Operands and results are `float64`, and every result is rounded to 12 significant digits before it is returned, so `0.1 + 0.2` is `0.3` and `1 / 3` is `0.333333333333`. For a calculator that is the expected behaviour and the rounding is explicit and tested. Money is a different problem: binary floating point cannot represent most decimal amounts exactly, and rounding errors compound across sums and conversions, so a payments service would use arbitrary-precision decimals (`math/big` or a decimal library) and integer minor units at the boundaries, never floats.

**Semantics of percent, sqrt and power.** `percent(a, b)` is "`a` percent of `b`" (`percent(15, 200)` is `30`), the reading a calculator user expects; the alternative, `a / 100`, needs no second operand and is less useful. `sqrt` uses `a` and ignores `b` so the request shape stays the same for every operation. `power(a, b)` is `a` raised to `b`; a result that is infinite or not a real number (`0 ^ -1`, `(-8) ^ 0.5`) is reported as `RESULT_OVERFLOW` rather than guessed.

**No CORS.** In development Vite proxies `/api` to the Go server, and in production the same binary serves the UI, so the browser never makes a cross-origin request. Enabling CORS would open the API to other origins for no benefit.

**One binary serves the UI and the API.** The server looks for `frontend/dist` (or `STATIC_DIR`) and serves it with an `index.html` fallback. One process, one port and one container keep deployment trivial; a separate web server would only add a hop.

**Distroless image with a Go health probe.** The runtime image is `gcr.io/distroless/static-debian12:nonroot`, which contains the static binary and nothing else: no shell, no package manager, a smaller attack surface and a 14 MB image. Because there is no shell or `curl`, the health check is a second tiny Go binary that requests `/api/v1/health`.

**Playwright for both browser and API end-to-end tests.** One tool and one configuration exercise the real stack from a browser and from its `request` fixture, which keeps the API tests close to the UI tests and the CI job short. The suite reuses a running server, so the same tests validate the Docker image.

## Security

What the service covers:

- **Input.** The body must be declared as `application/json`, otherwise `415`; this also keeps cross-site forms and `text/plain` requests, which browsers send without a CORS preflight, away from the API. The body is capped at 1 MiB with `http.MaxBytesReader`. Keys match exactly and a repeated key is rejected, so a proxy and this server can never read the same body differently. Malformed JSON, wrong types, trailing data and out-of-range literals are rejected with `INVALID_JSON`; unknown fields are ignored. The operation is an exact enum.
- **Server limits.** `ReadHeaderTimeout` 5 s, `ReadTimeout` 10 s, `WriteTimeout` 10 s, `IdleTimeout` 60 s, and a 10 s graceful drain on `SIGINT` and `SIGTERM`.
- **Error responses.** Messages are fixed strings; nothing from the runtime (stack traces, paths, decoder errors) reaches the client. The only input echoed back is the operation name in `INVALID_OPERATION`, JSON-encoded.
- **Static files.** Served only from `STATIC_DIR`. Paths are cleaned before lookup and any path still containing `..` after decoding is refused with `400`; there is a unit test that tries to read a file next to the directory. The `index.html` fallback never leaves the directory.
- **Response headers.** Every response, including errors and assets, carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and a Content-Security-Policy restricted to this origin (`default-src`, `script-src`, `style-src`, `connect-src`, `img-src` plus `data:`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`). The Vite build emits no inline scripts or styles, so nothing needs `'unsafe-inline'`. `index.html` and the API are `Cache-Control: no-cache`; the hashed files under `/assets/` are `public, max-age=31536000, immutable`.
- **Container.** The runtime image is `gcr.io/distroless/static-debian12:nonroot`: a static binary, no shell, no package manager, running as `nonroot`. The health check is a Go binary for that reason.
- **Secrets.** None are needed and none are tracked; there are no environment files in the repository.
- **Supply chain.** The `security` CI job fails on high or critical findings from `npm audit` in `frontend/` and `e2e/`, from `govulncheck` on the backend, and from Trivy on the built image (`HIGH,CRITICAL`, unfixed findings ignored). Dependabot opens weekly pull requests for npm, Go, Docker and GitHub Actions, with minor and patch bumps grouped. `backend/go.mod` pins Go 1.26.10 because `govulncheck` reported standard library issues in `net/http` and `crypto/tls` for 1.26.5 that were fixed in 1.26.9; with 1.26.10 it reports none, and at the time of writing `npm audit` and Trivy report zero findings.

Deliberately out of scope, because they belong to the deployment in front of the service rather than to a calculator:

- Authentication and authorization. Every request is anonymous.
- Rate limiting across instances. The built-in limit (see [Rate limiting](#rate-limiting)) is per process and per IP; shared or per-account quotas belong in a gateway.
- TLS termination. The server speaks plain HTTP on one port; put it behind a reverse proxy or load balancer that terminates TLS.
- Audit trails and log retention. The access log goes to standard error for the platform to collect.

## Assumptions and limitations

- Operands are JSON numbers. Strings, BigInt and numeric literals outside the `float64` range are rejected as `INVALID_JSON`.
- Results that are infinite or not a number are reported as `RESULT_OVERFLOW` rather than returned.
- No authentication or authorization. Calculations are rate limited per IP and per instance only, and the request body is capped at 1 MiB.
- No persistence: every request is independent and nothing is stored.
- Single instance. The only state is the in-memory rate limit buckets, so several replicas behind a load balancer would work but would each apply the limit separately; nothing here sets that up.

## Prompts

The prompts used while building this project are in [PROMPTS.md](PROMPTS.md), in order, each with a note on what came out of it.
