// Command server runs the calculator API and, when a built frontend is
// available, serves it from the same process.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/gartox/sezzle-calculator/backend/internal/httpapi"
)

const (
	defaultPort      = "8080"
	defaultStaticDir = "frontend/dist"
	shutdownTimeout  = 10 * time.Second
)

func main() {
	if err := run(); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	port := envOr("PORT", defaultPort)
	staticDir := envOr("STATIC_DIR", defaultStaticDir)
	// Trust X-Forwarded-For only behind a proxy that sets it; see httpapi.ClientIP.
	trustProxy := os.Getenv("TRUST_PROXY") == "true"

	logger := newLogger(os.Getenv("LOG_FORMAT"), os.Stderr)
	slog.SetDefault(logger)

	rps, burst, err := rateLimitFromEnv()
	if err != nil {
		return err
	}
	limiter := httpapi.NewRateLimiter(rps, burst, trustProxy)
	defer limiter.Stop()
	slog.Info("rate limit", "rps", rps, "burst", burst, "enabled", limiter != nil, "trust_proxy", trustProxy)

	mux := http.NewServeMux()
	mux.Handle("/api/", httpapi.NewHandler(limiter))
	if isDir(staticDir) {
		mux.Handle("/", spaHandler(staticDir))
		slog.Info("serving frontend", "dir", staticDir)
	} else {
		slog.Info("frontend build not found, serving API only", "dir", staticDir)
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           secureHeaders(httpapi.RequestID(httpapi.AccessLog(logger, trustProxy, mux))),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serveErr := make(chan error, 1)
	go func() {
		slog.Info("server listening", "addr", srv.Addr)
		serveErr <- srv.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	slog.Info("shutdown signal received, draining connections", "timeout", shutdownTimeout.String())
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	limiter.Stop()
	slog.Info("server stopped")
	return nil
}

// spaHandler serves files from dir and falls back to index.html for paths
// that do not exist, so client-side routes resolve to the application.
func spaHandler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	index := filepath.Join(dir, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested := filepath.Join(dir, filepath.FromSlash(path.Clean("/"+r.URL.Path)))
		if _, err := os.Stat(requested); errors.Is(err, fs.ErrNotExist) {
			http.ServeFile(w, r, index)
			return
		}
		files.ServeHTTP(w, r)
	})
}

// newLogger returns a JSON logger when format is "json" and a text logger
// otherwise. JSON suits log collectors; text is easier to read in a terminal.
func newLogger(format string, w io.Writer) *slog.Logger {
	if format == "json" {
		return slog.New(slog.NewJSONHandler(w, nil))
	}
	return slog.New(slog.NewTextHandler(w, nil))
}

// rateLimitFromEnv reads RATE_LIMIT_RPS (default 10, 0 disables the limit)
// and RATE_LIMIT_BURST (default 20).
func rateLimitFromEnv() (float64, int, error) {
	rps, err := strconv.ParseFloat(envOr("RATE_LIMIT_RPS", "10"), 64)
	if err != nil || rps < 0 {
		return 0, 0, fmt.Errorf("RATE_LIMIT_RPS must be a number >= 0, got %q", os.Getenv("RATE_LIMIT_RPS"))
	}
	burst, err := strconv.Atoi(envOr("RATE_LIMIT_BURST", "20"))
	if err != nil || burst < 1 {
		return 0, 0, fmt.Errorf("RATE_LIMIT_BURST must be an integer >= 1, got %q", os.Getenv("RATE_LIMIT_BURST"))
	}
	return rps, burst, nil
}

func isDir(name string) bool {
	info, err := os.Stat(name)
	return err == nil && info.IsDir()
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
