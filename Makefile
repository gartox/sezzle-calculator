BACKEND := backend
BIN := bin/server

.PHONY: test coverage run build clean

## test: run the backend tests with the race detector and coverage summary
test:
	cd $(BACKEND) && go test ./... -race -cover

## coverage: run the backend tests and write backend/coverage.txt
coverage:
	cd $(BACKEND) && go test ./... -race -coverprofile=coverage.out && go tool cover -func=coverage.out > coverage.txt
	cat $(BACKEND)/coverage.txt

## build: compile the server binary into bin/server
build:
	cd $(BACKEND) && go build -o ../$(BIN) ./cmd/server

## run: build and start the server from the repository root (serves frontend/dist when present)
run: build
	./$(BIN)

## clean: remove build and coverage artifacts
clean:
	rm -rf bin $(BACKEND)/coverage.out
