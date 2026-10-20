package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
)

// RequestIDHeader carries the request ID in both directions.
const RequestIDHeader = "X-Request-Id"

const maxRequestIDLength = 64

type requestIDKey struct{}

// RequestID gives every request an ID, stores it in the request context and
// echoes it in the X-Request-Id response header. A caller-supplied ID is kept
// when it is safe to log (1 to 64 letters, digits, dashes or underscores);
// anything else is replaced by a random one.
//
// The middleware is idempotent: when an outer layer has already assigned an
// ID, it passes the request through unchanged. NewHandler wraps itself with it
// so the API always has an ID, and the server wraps the whole mux with it so
// static responses and the access log get one too.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if RequestIDFrom(r.Context()) != "" {
			next.ServeHTTP(w, r)
			return
		}
		id := r.Header.Get(RequestIDHeader)
		if !validRequestID(id) {
			id = newRequestID()
		}
		w.Header().Set(RequestIDHeader, id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey{}, id)))
	})
}

// RequestIDFrom returns the request ID stored by RequestID, or "" if none.
func RequestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

func validRequestID(id string) bool {
	if id == "" || len(id) > maxRequestIDLength {
		return false
	}
	for _, c := range id {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-', c == '_':
		default:
			return false
		}
	}
	return true
}

// newRequestID returns 16 random bytes as 32 hex characters. Since Go 1.24
// crypto/rand.Read never returns an error; it aborts the program if the
// system's randomness source fails.
func newRequestID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
