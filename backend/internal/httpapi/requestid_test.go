package httpapi

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

var generatedID = regexp.MustCompile(`^[0-9a-f]{32}$`)

func TestRequestID(t *testing.T) {
	tests := []struct {
		name     string
		incoming string
		wantKept bool
	}{
		{name: "valid id is propagated", incoming: "abc-123_XYZ", wantKept: true},
		{name: "64 characters is allowed", incoming: strings.Repeat("a", 64), wantKept: true},
		{name: "missing id is generated", incoming: "", wantKept: false},
		{name: "65 characters is replaced", incoming: strings.Repeat("a", 65), wantKept: false},
		{name: "spaces are replaced", incoming: "has space", wantKept: false},
		{name: "log injection is replaced", incoming: "id\nlevel=ERROR", wantKept: false},
		{name: "non-ascii is replaced", incoming: "idé", wantKept: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var seen string
			handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seen = RequestIDFrom(r.Context())
			}))
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.incoming != "" {
				req.Header.Set(RequestIDHeader, tt.incoming)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			header := rec.Header().Get(RequestIDHeader)
			if header != seen {
				t.Fatalf("header %q and context %q differ", header, seen)
			}
			if tt.wantKept {
				if header != tt.incoming {
					t.Fatalf("id = %q, want the incoming %q", header, tt.incoming)
				}
				return
			}
			if !generatedID.MatchString(header) {
				t.Fatalf("id = %q, want 32 random hex characters", header)
			}
		})
	}
}

func TestRequestIDIsUniquePerRequest(t *testing.T) {
	handler := RequestID(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	seen := map[string]bool{}
	for range 100 {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
		id := rec.Header().Get(RequestIDHeader)
		if seen[id] {
			t.Fatalf("duplicate id %q", id)
		}
		seen[id] = true
	}
}

func TestRequestIDIsIdempotent(t *testing.T) {
	var inner string
	handler := RequestID(RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inner = RequestIDFrom(r.Context())
	})))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if got := rec.Header().Get(RequestIDHeader); got != inner {
		t.Fatalf("outer header %q, inner context %q; nested middleware must reuse the id", got, inner)
	}
}

func TestErrorEnvelopeCarriesRequestID(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, calculatePath, strings.NewReader(`{"operation":"divide","a":1,"b":0}`))
	req.Header.Set(RequestIDHeader, "report-me-42")
	rec := httptest.NewRecorder()
	NewHandler().ServeHTTP(rec, req)

	var resp struct {
		Error struct {
			RequestID string `json:"requestId"`
		} `json:"error"`
	}
	decodeBody(t, rec, &resp)
	if resp.Error.RequestID != "report-me-42" {
		t.Fatalf("error.requestId = %q, want %q (body %s)", resp.Error.RequestID, "report-me-42", rec.Body)
	}
}
