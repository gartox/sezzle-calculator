package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSecureHeaders(t *testing.T) {
	handler := secureHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	tests := []struct {
		path      string
		wantCache string
	}{
		{path: "/", wantCache: cacheNone},
		{path: "/index.html", wantCache: cacheNone},
		{path: "/api/v1/calculate", wantCache: cacheNone},
		{path: "/api/v1/health", wantCache: cacheNone},
		{path: "/assets/index-abc123.js", wantCache: cacheImmutable},
		{path: "/assets/index-abc123.css", wantCache: cacheImmutable},
		{path: "/assets", wantCache: cacheNone},
	}

	fixed := map[string]string{
		"X-Content-Type-Options":  "nosniff",
		"X-Frame-Options":         "DENY",
		"Referrer-Policy":         "no-referrer",
		"Permissions-Policy":      "camera=(), microphone=(), geolocation=()",
		"Content-Security-Policy": contentSecurityPolicy,
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", rec.Code)
			}
			for name, want := range fixed {
				if got := rec.Header().Get(name); got != want {
					t.Errorf("%s = %q, want %q", name, got, want)
				}
			}
			if got := rec.Header().Get("Cache-Control"); got != tt.wantCache {
				t.Errorf("Cache-Control = %q, want %q", got, tt.wantCache)
			}
		})
	}
}

func TestContentSecurityPolicyDirectives(t *testing.T) {
	for _, directive := range []string{
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self'",
		"connect-src 'self'",
		"img-src 'self' data:",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	} {
		if !containsDirective(contentSecurityPolicy, directive) {
			t.Errorf("policy lacks directive %q: %s", directive, contentSecurityPolicy)
		}
	}
	if strings.Contains(contentSecurityPolicy, "unsafe-inline") {
		t.Errorf("policy must not allow unsafe-inline: %s", contentSecurityPolicy)
	}
}

func containsDirective(policy, directive string) bool {
	for _, part := range strings.Split(policy, ";") {
		if strings.TrimSpace(part) == directive {
			return true
		}
	}
	return false
}
