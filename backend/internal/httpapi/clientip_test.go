package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientIP(t *testing.T) {
	tests := []struct {
		name       string
		remote     string
		forwarded  string
		trustProxy bool
		want       string
	}{
		{name: "remote address", remote: "203.0.113.7:51234", want: "203.0.113.7"},
		{name: "ipv6 remote address", remote: "[2001:db8::1]:443", want: "2001:db8::1"},
		{name: "forwarded header ignored by default", remote: "10.0.0.2:80", forwarded: "198.51.100.9", want: "10.0.0.2"},
		{name: "forwarded header used behind a proxy", remote: "10.0.0.2:80", forwarded: "198.51.100.9", trustProxy: true, want: "198.51.100.9"},
		{name: "first forwarded address wins", remote: "10.0.0.2:80", forwarded: " 198.51.100.9 , 10.0.0.1", trustProxy: true, want: "198.51.100.9"},
		{name: "garbage forwarded header falls back", remote: "10.0.0.2:80", forwarded: "not-an-ip", trustProxy: true, want: "10.0.0.2"},
		{name: "empty forwarded header falls back", remote: "10.0.0.2:80", trustProxy: true, want: "10.0.0.2"},
		{name: "remote address without port", remote: "10.0.0.3", want: "10.0.0.3"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = tt.remote
			if tt.forwarded != "" {
				req.Header.Set("X-Forwarded-For", tt.forwarded)
			}
			if got := ClientIP(req, tt.trustProxy); got != tt.want {
				t.Fatalf("ClientIP = %q, want %q", got, tt.want)
			}
		})
	}
}
