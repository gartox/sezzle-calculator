// Package httpapi exposes the calculator over HTTP as a JSON API.
package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
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

// calculateRequest keeps each operand as its JSON lexeme so that range
// problems can be told apart from zero: strconv turns 1e-999 into 0 silently.
type calculateRequest struct {
	Operation string
	A         *json.Number
	B         *json.Number
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
	a, err := parseOperand("a", *req.A)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, CodeInvalidOperand, operandMessage(err))
		return
	}
	var b float64
	if !op.Unary() {
		if req.B == nil {
			writeError(w, r, http.StatusBadRequest, CodeInvalidOperand, fmt.Sprintf("Operand \"b\" is required for %q.", op))
			return
		}
		if b, err = parseOperand("b", *req.B); err != nil {
			writeError(w, r, http.StatusBadRequest, CodeInvalidOperand, operandMessage(err))
			return
		}
	}

	result, err := calculator.Calculate(op, a, b)
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

	if raw, ok := fields["operation"]; ok {
		if err := json.Unmarshal(raw, &req.Operation); err != nil {
			return req, fmt.Errorf("field \"operation\": %w", err)
		}
	}
	for name, target := range map[string]**json.Number{"a": &req.A, "b": &req.B} {
		raw, ok := fields[name]
		if !ok {
			continue
		}
		n, err := decodeNumber(raw)
		if err != nil {
			return req, fmt.Errorf("field %q: %w", name, err)
		}
		*target = n
	}
	return req, nil
}

// decodeNumber reads a JSON number without converting it, so 1e-999 and
// 1e999 reach parseOperand intact. null is nil, meaning the operand is
// missing; any other type is an error.
func decodeNumber(raw json.RawMessage) (*json.Number, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var value any
	if err := dec.Decode(&value); err != nil {
		return nil, err
	}
	switch v := value.(type) {
	case nil:
		return nil, nil
	case json.Number:
		return &v, nil
	default:
		return nil, fmt.Errorf("want a number, got %T", v)
	}
}

// operandRangeError reports a number literal that float64 cannot represent.
type operandRangeError struct {
	name     string
	tooLarge bool
}

func (e *operandRangeError) Error() string {
	if e.tooLarge {
		return fmt.Sprintf("operand %q overflows float64", e.name)
	}
	return fmt.Sprintf("operand %q underflows float64 to zero", e.name)
}

// operandMessage is the explanation sent to the client for a parseOperand
// error.
func operandMessage(err error) string {
	var rangeErr *operandRangeError
	if errors.As(err, &rangeErr) {
		return rangeErr.message()
	}
	return "Operands must be finite numbers."
}

// message is the explanation sent to the client.
func (e *operandRangeError) message() string {
	if e.tooLarge {
		return fmt.Sprintf("Operand %q is too large for a 64-bit floating-point number.", e.name)
	}
	return fmt.Sprintf("Operand %q is too small for a 64-bit floating-point number; it would round to zero.", e.name)
}

// parseOperand converts a JSON number to float64 and rejects literals that
// float64 cannot represent: a magnitude so large it would become infinity,
// and a nonzero value so small it would round to zero. Without the second
// check, {"operation":"divide","a":1,"b":1e-999} would be a division by zero.
// A JSON number is always valid ParseFloat syntax, so the only error left is
// ErrRange, which ParseFloat returns with an infinite value.
func parseOperand(name string, n json.Number) (float64, error) {
	value, err := strconv.ParseFloat(string(n), 64)
	if err != nil {
		return 0, &operandRangeError{name: name, tooLarge: true}
	}
	if value == 0 && hasNonzeroDigit(string(n)) {
		return 0, &operandRangeError{name: name}
	}
	return value, nil
}

// hasNonzeroDigit reports whether a number literal's mantissa is not zero.
func hasNonzeroDigit(literal string) bool {
	mantissa, _, _ := strings.Cut(strings.ToLower(literal), "e")
	return strings.ContainsAny(mantissa, "123456789")
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
