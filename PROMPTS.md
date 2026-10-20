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
