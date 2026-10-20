// Package httpapi exposes the calculator over HTTP as a JSON API.
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
)

type calculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

type calculateResponse struct {
	Result float64 `json:"result"`
}

type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// NewHandler returns the API router. Every route lives under /api/ and
// every response, including errors, is JSON.
func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/calculate", handleCalculate)
	mux.HandleFunc("/api/", handleNotFound)
	return mux
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, CodeMethodNotAllowed, "Use POST to calculate.")
		return
	}

	req, err := decodeRequest(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, CodeInvalidJSON, "Request body must be a JSON object with a string \"operation\" and numeric \"a\" and \"b\".")
		return
	}

	op, err := calculator.ParseOperation(req.Operation)
	if err != nil {
		writeError(w, http.StatusBadRequest, CodeInvalidOperation,
			fmt.Sprintf("Unknown operation %q. Supported operations: %s.", req.Operation, supportedOperations()))
		return
	}

	if req.A == nil {
		writeError(w, http.StatusBadRequest, CodeInvalidOperand, "Operand \"a\" is required.")
		return
	}
	var b float64
	if op != calculator.Sqrt {
		if req.B == nil {
			writeError(w, http.StatusBadRequest, CodeInvalidOperand, fmt.Sprintf("Operand \"b\" is required for %q.", op))
			return
		}
		b = *req.B
	}

	result, err := calculator.Calculate(op, *req.A, b)
	if err != nil {
		status, code, message := mapCalculationError(err)
		writeError(w, status, code, message)
		return
	}
	writeJSON(w, http.StatusOK, calculateResponse{Result: result})
}

func handleNotFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotFound, CodeNotFound, "No such API route.")
}

// decodeRequest parses exactly one JSON object from the body. Anything else
// (syntax errors, wrong types, an empty body, trailing data, an oversized
// body) is reported as an error.
func decodeRequest(w http.ResponseWriter, r *http.Request) (calculateRequest, error) {
	var req calculateRequest
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		return req, err
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return req, errors.New("unexpected data after JSON object")
	}
	return req, nil
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

func supportedOperations() string {
	names := make([]string, len(calculator.Operations))
	for i, op := range calculator.Operations {
		names[i] = string(op)
	}
	return strings.Join(names, ", ")
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorResponse{Error: errorDetail{Code: code, Message: message}})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// The body is a small struct of our own, so encoding cannot fail; and once
	// the status is written there is nothing useful left to report.
	_ = json.NewEncoder(w).Encode(body)
}
