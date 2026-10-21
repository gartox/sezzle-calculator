// Command server runs the calculator API and, when a built frontend is
// available, serves it from the same process.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strconv"
	"strings"
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

	rateCfg, err := rateLimitFromEnv(trustProxy)
	if err != nil {
		return err
	}
	limiter, err := httpapi.NewRateLimiter(rateCfg)
	if err != nil {
		return err
	}
	defer limiter.Stop()
	slog.Info("rate limit", "rps", rateCfg.RPS, "burst", rateCfg.Burst, "max_clients", rateCfg.MaxClients,
		"enabled", limiter != nil, "trust_proxy", trustProxy)

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

// spaHandler serves files from dir. Paths that do not exist fall back to
// index.html so client-side routes resolve to the application, except under
// /assets/: a missing hashed file must be a 404, or a browser asking for an old
// bundle after a deploy would cache index.html as JavaScript for a year.
// Directories other than the root are never listed.
func spaHandler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	index := filepath.Join(dir, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := path.Clean("/" + r.URL.Path)
		info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(clean)))
		switch {
		case err == nil && !info.IsDir(), clean == "/":
			files.ServeHTTP(w, r)
		case strings.HasPrefix(clean, "/assets/") || clean == "/assets":
			// The middleware marked /assets/ immutable; a 404 must not be.
			w.Header().Set("Cache-Control", cacheNone)
			http.NotFound(w, r)
		default:
			http.ServeFile(w, r, index)
		}
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

// rateLimitFromEnv reads RATE_LIMIT_RPS (default 10, 0 disables the limit),
// RATE_LIMIT_BURST (default 20) and RATE_LIMIT_MAX_CLIENTS (default 10,000).
// NaN and infinities parse as floats but are rejected: NaN would break
// refills and +Inf would never throttle.
func rateLimitFromEnv(trustProxy bool) (httpapi.RateLimitConfig, error) {
	cfg := httpapi.RateLimitConfig{TrustProxy: trustProxy}
	rps, err := strconv.ParseFloat(envOr("RATE_LIMIT_RPS", "10"), 64)
	if err != nil || math.IsNaN(rps) || math.IsInf(rps, 0) || rps < 0 {
		return cfg, fmt.Errorf("RATE_LIMIT_RPS must be a finite number >= 0, got %q", os.Getenv("RATE_LIMIT_RPS"))
	}
	burst, err := strconv.Atoi(envOr("RATE_LIMIT_BURST", "20"))
	if err != nil || burst < 1 {
		return cfg, fmt.Errorf("RATE_LIMIT_BURST must be an integer >= 1, got %q", os.Getenv("RATE_LIMIT_BURST"))
	}
	maxClients, err := strconv.Atoi(envOr("RATE_LIMIT_MAX_CLIENTS", strconv.Itoa(httpapi.DefaultMaxClients)))
	if err != nil || maxClients < 1 {
		return cfg, fmt.Errorf("RATE_LIMIT_MAX_CLIENTS must be an integer >= 1, got %q", os.Getenv("RATE_LIMIT_MAX_CLIENTS"))
	}
	cfg.RPS, cfg.Burst, cfg.MaxClients = rps, burst, maxClients
	return cfg, cfg.Validate()
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
