// Package httpapi exposes the calculator over HTTP as a JSON API.
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/gartox/sezzle-calculator/backend/internal/calculator"
)

// maxBodyBytes caps the request body; a calculation never needs more.
const maxBodyBytes = 1 << 20

// Error codes returned in the "error.code" field of failed responses.
const (
	CodeInvalidJSON      = "INVALID_JSON"
	CodeInvalidOperation = "INVALID_OPERATION"
	CodeInvalidOperand   = "INVALID_OPERAND"
	CodeDivisionByZero   = "DIVISION_BY_ZERO"
	CodeNegativeSqrt     = "NEGATIVE_SQRT"
	CodeResultOverflow   = "RESULT_OVERFLOW"
	CodeMethodNotAllowed = "METHOD_NOT_ALLOWED"
	CodeNotFound         = "NOT_FOUND"
	CodeRateLimited      = "RATE_LIMITED"
	// CodeUnsupportedMediaType rejects bodies not declared as JSON. Besides
	// being honest about the contract, it means a cross-site form or a
	// text/plain fetch, which browsers send without a CORS preflight, can
	// never reach the calculation.
	CodeUnsupportedMediaType = "UNSUPPORTED_MEDIA_TYPE"
)

type calculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

type calculateResponse struct {
	Result float64 `json:"result"`
}

type healthResponse struct {
	Status string `json:"status"`
}

type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

// NewHandler returns the API router. Every route lives under /api/ and
// every response, including errors, is JSON. limiter throttles the calculate
// endpoint per client; nil disables rate limiting. Health checks and the
// OpenAPI document are never limited.
func NewHandler(limiter *RateLimiter) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/v1/calculate", limiter.Limit(http.HandlerFunc(handleCalculate)))
	mux.HandleFunc("/api/v1/health", handleHealth)
	mux.HandleFunc("/api/v1/openapi.yaml", handleOpenAPI)
	mux.HandleFunc("/api/", handleNotFound)
	return RequestID(mux)
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, r, http.StatusMethodNotAllowed, CodeMethodNotAllowed, "Use POST to calculate.")
		return
	}
	if !isJSON(r.Header.Get("Content-Type")) {
		writeError(w, r, http.StatusUnsupportedMediaType, CodeUnsupportedMediaType, "Content-Type must be application/json.")
		return
	}

	req, err := decodeRequest(w, r)
	if err != nil {
		message := "Request body must be a JSON object with a string \"operation\" and numeric \"a\" and \"b\"."
		var dup duplicateKeyError
		if errors.As(err, &dup) {
			message = fmt.Sprintf("Key %q appears more than once in the request body.", string(dup))
		}
		writeError(w, r, http.StatusBadRequest, CodeInvalidJSON, message)
		return
	}

	if req.Operation == "" {
		writeError(w, r, http.StatusBadRequest, CodeInvalidOperation,
			fmt.Sprintf("Field \"operation\" is required. Supported operations: %s.", supportedOperations()))
		return
	}
	op, err := calculator.ParseOperation(req.Operation)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, CodeInvalidOperation,
			fmt.Sprintf("Unknown operation %q. Supported operations: %s.", req.Operation, supportedOperations()))
		return
	}

	if req.A == nil {
		writeError(w, r, http.StatusBadRequest, CodeInvalidOperand, "Operand \"a\" is required.")
		return
	}
	var b float64
	if op != calculator.Sqrt {
		if req.B == nil {
			writeError(w, r, http.StatusBadRequest, CodeInvalidOperand, fmt.Sprintf("Operand \"b\" is required for %q.", op))
			return
		}
		b = *req.B
	}

	result, err := calculator.Calculate(op, *req.A, b)
	if err != nil {
		status, code, message := mapCalculationError(err)
		writeError(w, r, status, code, message)
		return
	}
	writeJSON(w, http.StatusOK, calculateResponse{Result: result})
}

// readMethods is the Allow value for the read-only routes. HEAD is accepted
// because many load balancers probe with it; net/http drops the body.
const readMethods = "GET, HEAD"

func isRead(r *http.Request) bool {
	return r.Method == http.MethodGet || r.Method == http.MethodHead
}

// handleHealth answers liveness probes from Docker, Compose and load balancers.
func handleHealth(w http.ResponseWriter, r *http.Request) {
	if !isRead(r) {
		w.Header().Set("Allow", readMethods)
		writeError(w, r, http.StatusMethodNotAllowed, CodeMethodNotAllowed, "Use GET to check health.")
		return
	}
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func handleNotFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, r, http.StatusNotFound, CodeNotFound, "No such API route.")
}

// duplicateKeyError reports a key that appears twice in the request object.
type duplicateKeyError string

func (e duplicateKeyError) Error() string { return fmt.Sprintf("duplicate key %q", string(e)) }

var errNotObject = errors.New("request body is not a JSON object")

// decodeRequest parses exactly one JSON object from the body. Anything else
// (syntax errors, wrong types, an empty body, a non-object such as null,
// trailing data, an oversized body, a repeated key) is reported as an error.
//
// Keys match exactly. encoding/json would otherwise accept "A" for "a" and
// let a repeated key silently overwrite the first one, so a proxy that reads
// the first "operation" and this server that reads the last would disagree
// about what the request asks for. Unknown keys are ignored.
func decodeRequest(w http.ResponseWriter, r *http.Request) (calculateRequest, error) {
	var req calculateRequest
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)

	fields, err := decodeObject(dec)
	if err != nil {
		return req, err
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return req, errors.New("unexpected data after JSON object")
	}

	targets := map[string]any{"operation": &req.Operation, "a": &req.A, "b": &req.B}
	for name, target := range targets {
		raw, ok := fields[name]
		if !ok {
			continue
		}
		if err := json.Unmarshal(raw, target); err != nil {
			return req, fmt.Errorf("field %q: %w", name, err)
		}
	}
	return req, nil
}

// decodeObject reads one JSON object and returns its members by exact key.
func decodeObject(dec *json.Decoder) (map[string]json.RawMessage, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '{' {
		return nil, errNotObject
	}

	fields := make(map[string]json.RawMessage)
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		// Inside an object, Token returns each key as a string or fails with
		// a syntax error, so the assertion cannot fail.
		key := tok.(string)
		if _, seen := fields[key]; seen {
			return nil, duplicateKeyError(key)
		}
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return nil, err
		}
		fields[key] = raw
	}
	if _, err := dec.Token(); err != nil { // the closing brace
		return nil, err
	}
	return fields, nil
}

func mapCalculationError(err error) (status int, code, message string) {
	switch {
	case errors.Is(err, calculator.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, CodeDivisionByZero, "Cannot divide by zero."
	case errors.Is(err, calculator.ErrNegativeSqrt):
		return http.StatusUnprocessableEntity, CodeNegativeSqrt, "Cannot take the square root of a negative number."
	case errors.Is(err, calculator.ErrOverflow):
		return http.StatusUnprocessableEntity, CodeResultOverflow, "The result is not a finite number."
	case errors.Is(err, calculator.ErrInvalidOperand):
		return http.StatusBadRequest, CodeInvalidOperand, "Operands must be finite numbers."
	default:
		// ParseOperation already validated the operation, so this is unreachable
		// unless the calculator grows new errors; report it as a bad operation.
		return http.StatusBadRequest, CodeInvalidOperation, "The operation could not be performed."
	}
}

// isJSON reports whether a Content-Type header names application/json,
// with or without parameters such as charset.
func isJSON(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	return err == nil && mediaType == "application/json"
}

func supportedOperations() string {
	names := make([]string, len(calculator.Operations))
	for i, op := range calculator.Operations {
		names[i] = string(op)
	}
	return strings.Join(names, ", ")
}

// writeError sends the error envelope. The request ID lets a user quote the
// failing request and lets an operator find it in the access log.
func writeError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	writeJSON(w, status, errorResponse{Error: errorDetail{
		Code:      code,
		Message:   message,
		RequestID: RequestIDFrom(r.Context()),
	}})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// The body is a small struct of our own, so encoding cannot fail; and once
	// the status is written there is nothing useful left to report.
	_ = json.NewEncoder(w).Encode(body)
}
