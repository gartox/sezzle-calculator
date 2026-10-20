package httpapi

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAccessLog(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	handler := RequestID(AccessLog(logger, false, NewHandler(nil)))

	req := httptest.NewRequest(http.MethodPost, calculatePath+"?secret=query", strings.NewReader(`{"operation":"divide","a":1,"b":0}`))
	req.RemoteAddr = "203.0.113.7:51234"
	req.Header.Set(RequestIDHeader, "log-me")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("log output is not one JSON record: %v\n%s", err, buf.String())
	}

	want := map[string]any{
		"msg":        "request",
		"request_id": "log-me",
		"method":     "POST",
		"path":       calculatePath,
		"status":     float64(422),
		"bytes":      float64(rec.Body.Len()),
		"client_ip":  "203.0.113.7",
	}
	for key, value := range want {
		if line[key] != value {
			t.Errorf("%s = %v, want %v", key, line[key], value)
		}
	}
	if _, ok := line["duration_ms"].(float64); !ok {
		t.Errorf("duration_ms = %v, want a number", line["duration_ms"])
	}
	if strings.Contains(buf.String(), "secret") || strings.Contains(buf.String(), "divide") {
		t.Errorf("log leaked the query string or the request body: %s", buf.String())
	}
}

func TestAccessLogDefaultsToStatusOK(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))

	tests := []struct {
		name    string
		handler http.HandlerFunc
		want    float64
	}{
		{name: "nothing written", handler: func(http.ResponseWriter, *http.Request) {}, want: 200},
		{name: "body without header", handler: func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("hi")) }, want: 200},
		{name: "header written twice keeps the first", handler: func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusTeapot)
			w.WriteHeader(http.StatusInternalServerError)
		}, want: 418},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf.Reset()
			AccessLog(logger, false, tt.handler).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
			var line map[string]any
			if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
				t.Fatal(err)
			}
			if line["status"] != tt.want {
				t.Fatalf("status = %v, want %v", line["status"], tt.want)
			}
		})
	}
}

func TestStatusRecorderUnwrap(t *testing.T) {
	inner := httptest.NewRecorder()
	rec := &statusRecorder{ResponseWriter: inner}
	if rec.Unwrap() != inner {
		t.Fatal("Unwrap must return the wrapped ResponseWriter")
	}
}
