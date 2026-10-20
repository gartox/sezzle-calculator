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
