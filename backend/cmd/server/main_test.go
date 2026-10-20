package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSpaHandler(t *testing.T) {
	dir := t.TempDir()
	mustWrite(t, filepath.Join(dir, "index.html"), "<h1>index</h1>")
	mustWrite(t, filepath.Join(dir, "assets", "app.js"), "console.log(1)")
	mustWrite(t, filepath.Join(dir, "nested", "file.txt"), "nested")
	// A file next to the static directory must never be reachable.
	mustWrite(t, filepath.Join(filepath.Dir(dir), "outside.txt"), "secret")

	handler := spaHandler(dir)

	tests := []struct {
		name     string
		path     string
		wantCode int
		wantBody string
	}{
		{name: "root serves index", path: "/", wantCode: 200, wantBody: "<h1>index</h1>"},
		{name: "existing asset", path: "/assets/app.js", wantCode: 200, wantBody: "console.log(1)"},
		{name: "unknown path falls back to index", path: "/some/client/route", wantCode: 200, wantBody: "<h1>index</h1>"},
		{name: "missing asset is a 404, not index", path: "/assets/index-OLDHASH.js", wantCode: 404, wantBody: "404 page not found"},
		{name: "assets directory is not listed", path: "/assets/", wantCode: 404, wantBody: "404 page not found"},
		{name: "assets without slash is not listed", path: "/assets", wantCode: 404, wantBody: "404 page not found"},
		{name: "other directories fall back to index", path: "/nested", wantCode: 200, wantBody: "<h1>index</h1>"},
		// net/http refuses any path that still contains ".." after decoding,
		// so a traversal attempt is answered with 400 and never reads a file.
		{name: "dot segments are rejected", path: "/../outside.txt", wantCode: 400, wantBody: "invalid URL path"},
		{name: "encoded dot segments are rejected", path: "/assets/%2e%2e/%2e%2e/outside.txt", wantCode: 400, wantBody: "invalid URL path"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))
			if rec.Code != tt.wantCode {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantCode)
			}
			body := strings.TrimSpace(rec.Body.String())
			if body != tt.wantBody {
				t.Fatalf("body = %q, want %q", body, tt.wantBody)
			}
			if strings.Contains(body, "secret") {
				t.Fatalf("response leaked a file outside the static directory: %q", body)
			}
		})
	}
}

func TestIsDir(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "file")
	mustWrite(t, file, "x")

	if !isDir(dir) {
		t.Errorf("isDir(%q) = false, want true", dir)
	}
	if isDir(file) {
		t.Errorf("isDir(%q) = true for a file, want false", file)
	}
	if isDir(filepath.Join(dir, "missing")) {
		t.Error("isDir(missing) = true, want false")
	}
}

func TestEnvOr(t *testing.T) {
	t.Setenv("CALCULATOR_TEST_VAR", "set")
	if got := envOr("CALCULATOR_TEST_VAR", "fallback"); got != "set" {
		t.Errorf("envOr(set) = %q, want %q", got, "set")
	}
	t.Setenv("CALCULATOR_TEST_VAR", "")
	if got := envOr("CALCULATOR_TEST_VAR", "fallback"); got != "fallback" {
		t.Errorf("envOr(empty) = %q, want %q", got, "fallback")
	}
}

func mustWrite(t *testing.T, name, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(name), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(name, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestNewLogger(t *testing.T) {
	var buf bytes.Buffer
	newLogger("json", &buf).Info("hello", "k", "v")
	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil || line["msg"] != "hello" || line["k"] != "v" {
		t.Fatalf("json format: got %q (err %v)", buf.String(), err)
	}

	for _, format := range []string{"", "text", "anything-else"} {
		buf.Reset()
		newLogger(format, &buf).Info("hello", "k", "v")
		if !strings.Contains(buf.String(), "msg=hello k=v") {
			t.Fatalf("format %q: got %q, want text output", format, buf.String())
		}
	}
}

func TestRateLimitFromEnv(t *testing.T) {
	tests := []struct {
		rps, burst string
		wantRPS    float64
		wantBurst  int
		wantErr    bool
	}{
		{rps: "", burst: "", wantRPS: 10, wantBurst: 20},
		{rps: "0", burst: "", wantRPS: 0, wantBurst: 20},
		{rps: "1", burst: "2", wantRPS: 1, wantBurst: 2},
		{rps: "0.5", burst: "1", wantRPS: 0.5, wantBurst: 1},
		{rps: "-1", wantErr: true},
		{rps: "fast", wantErr: true},
		{burst: "0", wantErr: true},
		{burst: "many", wantErr: true},
	}
	for _, tt := range tests {
		t.Setenv("RATE_LIMIT_RPS", tt.rps)
		t.Setenv("RATE_LIMIT_BURST", tt.burst)
		rps, burst, err := rateLimitFromEnv()
		if (err != nil) != tt.wantErr {
			t.Fatalf("rps=%q burst=%q: err = %v, wantErr %v", tt.rps, tt.burst, err, tt.wantErr)
		}
		if !tt.wantErr && (rps != tt.wantRPS || burst != tt.wantBurst) {
			t.Fatalf("rps=%q burst=%q: got %v, %d", tt.rps, tt.burst, rps, burst)
		}
	}
}

func TestMissingAssetIsNotCachedForever(t *testing.T) {
	dir := t.TempDir()
	mustWrite(t, filepath.Join(dir, "index.html"), "<h1>index</h1>")
	mustWrite(t, filepath.Join(dir, "assets", "app.js"), "console.log(1)")
	handler := secureHeaders(spaHandler(dir))

	for path, want := range map[string]string{
		"/assets/app.js":     cacheImmutable,
		"/assets/missing.js": cacheNone,
		"/assets/":           cacheNone,
		"/some/client/route": cacheNone,
	} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if got := rec.Header().Get("Cache-Control"); got != want {
			t.Errorf("%s: Cache-Control = %q, want %q (status %d)", path, got, want, rec.Code)
		}
	}
}
