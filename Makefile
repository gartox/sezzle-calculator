BACKEND := backend
FRONTEND := frontend
BIN := bin/server

.PHONY: test coverage run build clean \
        backend-test backend-coverage backend-build \
        frontend-install frontend-test frontend-coverage frontend-build

## test: run the tests of both layers
test: backend-test frontend-test

## coverage: run both test suites and write backend/coverage.txt and frontend/coverage.txt
coverage: backend-coverage frontend-coverage

## build: build the frontend and compile the server binary into bin/server
build: frontend-build backend-build

## run: build everything and start the server from the repository root, serving frontend/dist
run: build
	./$(BIN)

## clean: remove build and coverage artifacts
clean:
	rm -rf bin $(BACKEND)/coverage.out $(FRONTEND)/dist $(FRONTEND)/coverage

# Backend (Go)

backend-test:
	cd $(BACKEND) && go test ./... -race -cover

backend-coverage:
	cd $(BACKEND) && go test ./... -race -coverprofile=coverage.out && go tool cover -func=coverage.out > coverage.txt
	cat $(BACKEND)/coverage.txt

backend-build:
	cd $(BACKEND) && go build -o ../$(BIN) ./cmd/server

# Frontend (React)

## frontend-install: install frontend dependencies from the lockfile
frontend-install:
	cd $(FRONTEND) && npm ci

frontend-test:
	cd $(FRONTEND) && npm test

frontend-coverage:
	cd $(FRONTEND) && NO_COLOR=1 npm run test:coverage 2>&1 | tee coverage.txt

frontend-build:
	cd $(FRONTEND) && npm run build
