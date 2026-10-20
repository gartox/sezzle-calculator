package httpapi

import (
	"log/slog"
	"net/http"
	"time"
)

// AccessLog writes one log record per request after it completes: request ID,
// method, path, status, duration, bytes written and client IP. It never reads
// or logs request bodies, and logs the path without the query string.
func AccessLog(logger *slog.Logger, trustProxy bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)

		logger.LogAttrs(r.Context(), slog.LevelInfo, "request",
			slog.String("request_id", RequestIDFrom(r.Context())),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", rec.status()),
			slog.Float64("duration_ms", float64(time.Since(start).Microseconds())/1000),
			slog.Int64("bytes", rec.bytes),
			slog.String("client_ip", ClientIP(r, trustProxy)),
		)
	})
}

// statusRecorder captures the status code and body size of a response.
type statusRecorder struct {
	http.ResponseWriter
	code  int
	bytes int64
}

func (s *statusRecorder) WriteHeader(code int) {
	if s.code == 0 {
		s.code = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.code == 0 {
		s.code = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += int64(n)
	return n, err
}

// Unwrap lets http.ResponseController reach the underlying writer.
func (s *statusRecorder) Unwrap() http.ResponseWriter {
	return s.ResponseWriter
}

func (s *statusRecorder) status() int {
	if s.code == 0 {
		return http.StatusOK
	}
	return s.code
}
