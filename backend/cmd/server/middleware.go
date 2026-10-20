package main

import (
	"net/http"
	"strings"
)

// contentSecurityPolicy only allows resources from this origin. The Vite build
// emits no inline scripts or styles, so nothing needs 'unsafe-inline'.
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self'; " +
	"connect-src 'self'; " +
	"img-src 'self' data:; " +
	"frame-ancestors 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'"

const (
	// Vite names bundled files with a content hash, so they can be cached
	// forever; a new build produces new names.
	cacheImmutable = "public, max-age=31536000, immutable"
	// index.html and API responses must always be revalidated.
	cacheNone = "no-cache"
)

// secureHeaders wraps next and sets protective headers and the cache policy
// on every response, including errors and static files.
func secureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("Cache-Control", cacheControlFor(r.URL.Path))
		next.ServeHTTP(w, r)
	})
}

func cacheControlFor(path string) string {
	if strings.HasPrefix(path, "/assets/") {
		return cacheImmutable
	}
	return cacheNone
}
