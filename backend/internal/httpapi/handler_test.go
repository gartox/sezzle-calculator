package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gartox/sezzle-calculator/backend/internal/calculator"
)

const calculatePath = "/api/v1/calculate"

func TestCalculateSuccess(t *testing.T) {
	tests := []struct {
		name string
		body string
		want float64
	}{
		{name: "add", body: `{"operation":"add","a":2,"b":3}`, want: 5},
		{name: "subtract", body: `{"operation":"subtract","a":2,"b":3}`, want: -1},
		{name: "multiply", body: `{"operation":"multiply","a":2,"b":3}`, want: 6},
		{name: "divide", body: `{"operation":"divide","a":3,"b":2}`, want: 1.5},
		{name: "power", body: `{"operation":"power","a":2,"b":10}`, want: 1024},
		{name: "sqrt without b", body: `{"operation":"sqrt","a":16}`, want: 4},
		{name: "sqrt ignores b", body: `{"operation":"sqrt","a":16,"b":-1}`, want: 4},
		{name: "percent", body: `{"operation":"percent","a":15,"b":200}`, want: 30},
		{name: "float noise is rounded", body: `{"operation":"add","a":0.1,"b":0.2}`, want: 0.3},
		{name: "zero operand is not missing", body: `{"operation":"multiply","a":0,"b":5}`, want: 0},
		{name: "unknown fields are ignored", body: `{"operation":"add","a":1,"b":1,"extra":true}`, want: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, http.MethodPost, calculatePath, tt.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s; want 200", rec.Code, rec.Body)
			}
			assertJSONContentType(t, rec)
			var resp struct {
				Result *float64 `json:"result"`
			}
			decodeBody(t, rec, &resp)
			if resp.Result == nil || *resp.Result != tt.want {
				t.Fatalf("result = %v, want %v (body %s)", resp.Result, tt.want, rec.Body)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{name: "malformed json", method: http.MethodPost, path: calculatePath, body: `{"operation":"add",`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "empty body", method: http.MethodPost, path: calculatePath, body: ``, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "string where number expected", method: http.MethodPost, path: calculatePath, body: `{"operation":"add","a":"2","b":3}`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "number where string expected", method: http.MethodPost, path: calculatePath, body: `{"operation":1,"a":2,"b":3}`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "json array instead of object", method: http.MethodPost, path: calculatePath, body: `[1,2,3]`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "trailing data", method: http.MethodPost, path: calculatePath, body: `{"operation":"add","a":2,"b":3} extra`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "number out of float64 range", method: http.MethodPost, path: calculatePath, body: `{"operation":"add","a":1e999,"b":3}`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "body too large", method: http.MethodPost, path: calculatePath, body: `{"operation":"add","a":2,"b":3,"pad":"` + strings.Repeat("x", maxBodyBytes) + `"}`, wantStatus: 400, wantCode: CodeInvalidJSON},
		{name: "unknown operation", method: http.MethodPost, path: calculatePath, body: `{"operation":"modulo","a":2,"b":3}`, wantStatus: 400, wantCode: CodeInvalidOperation},
		{name: "missing operation", method: http.MethodPost, path: calculatePath, body: `{"a":2,"b":3}`, wantStatus: 400, wantCode: CodeInvalidOperation},
		{name: "missing a", method: http.MethodPost, path: calculatePath, body: `{"operation":"add","b":3}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "missing b for add", method: http.MethodPost, path: calculatePath, body: `{"operation":"add","a":2}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "null operand", method: http.MethodPost, path: calculatePath, body: `{"operation":"add","a":null,"b":3}`, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "division by zero", method: http.MethodPost, path: calculatePath, body: `{"operation":"divide","a":1,"b":0}`, wantStatus: 422, wantCode: CodeDivisionByZero},
		{name: "negative sqrt", method: http.MethodPost, path: calculatePath, body: `{"operation":"sqrt","a":-1}`, wantStatus: 422, wantCode: CodeNegativeSqrt},
		{name: "power overflow", method: http.MethodPost, path: calculatePath, body: `{"operation":"power","a":1e308,"b":2}`, wantStatus: 422, wantCode: CodeResultOverflow},
		{name: "multiply overflow", method: http.MethodPost, path: calculatePath, body: `{"operation":"multiply","a":1e308,"b":10}`, wantStatus: 422, wantCode: CodeResultOverflow},
		{name: "get on endpoint", method: http.MethodGet, path: calculatePath, body: ``, wantStatus: 405, wantCode: CodeMethodNotAllowed},
		{name: "put on endpoint", method: http.MethodPut, path: calculatePath, body: `{"operation":"add","a":2,"b":3}`, wantStatus: 405, wantCode: CodeMethodNotAllowed},
		{name: "unknown api route", method: http.MethodPost, path: "/api/v1/nothing", body: `{}`, wantStatus: 404, wantCode: CodeNotFound},
		{name: "api root", method: http.MethodGet, path: "/api/", body: ``, wantStatus: 404, wantCode: CodeNotFound},
		{name: "trailing slash is a different route", method: http.MethodPost, path: calculatePath + "/", body: `{"operation":"add","a":2,"b":3}`, wantStatus: 404, wantCode: CodeNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, tt.method, tt.path, tt.body)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, body = %s; want %d", rec.Code, rec.Body, tt.wantStatus)
			}
			assertJSONContentType(t, rec)
			var resp struct {
				Error struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			decodeBody(t, rec, &resp)
			if resp.Error.Code != tt.wantCode {
				t.Fatalf("error code = %q, want %q (body %s)", resp.Error.Code, tt.wantCode, rec.Body)
			}
			if resp.Error.Message == "" {
				t.Fatalf("error message is empty (body %s)", rec.Body)
			}
		})
	}
}

func TestMethodNotAllowedSetsAllowHeader(t *testing.T) {
	rec := do(t, http.MethodGet, calculatePath, "")
	if got := rec.Header().Get("Allow"); got != http.MethodPost {
		t.Fatalf("Allow header = %q, want %q", got, http.MethodPost)
	}
}

func do(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	NewHandler().ServeHTTP(rec, req)
	return rec
}

func assertJSONContentType(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), v); err != nil {
		t.Fatalf("response is not valid JSON: %v (body %s)", err, rec.Body)
	}
}

// JSON cannot carry NaN or Infinity, so the operand branch of the error
// mapping is exercised directly rather than through a request.
func TestMapCalculationError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{name: "invalid operand", err: calculator.ErrInvalidOperand, wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "wrapped invalid operand", err: fmt.Errorf("context: %w", calculator.ErrInvalidOperand), wantStatus: 400, wantCode: CodeInvalidOperand},
		{name: "unknown operation", err: calculator.ErrUnknownOperation, wantStatus: 400, wantCode: CodeInvalidOperation},
		{name: "unexpected error", err: errors.New("boom"), wantStatus: 400, wantCode: CodeInvalidOperation},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, code, message := mapCalculationError(tt.err)
			if status != tt.wantStatus || code != tt.wantCode || message == "" {
				t.Fatalf("mapCalculationError(%v) = %d, %q, %q; want %d, %q, non-empty message", tt.err, status, code, message, tt.wantStatus, tt.wantCode)
			}
		})
	}
}
