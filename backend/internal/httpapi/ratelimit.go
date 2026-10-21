package httpapi

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// This limiter lives in httpapi rather than cmd/server because it must answer
// with the API's error envelope (code RATE_LIMITED plus the request ID) and
// apply to one route only; from cmd/server it would have to duplicate both.

const (
	// sweepInterval is how often idle buckets are looked for.
	sweepInterval = time.Minute
	// idleTTL is the shortest time a client must stay silent before its
	// bucket can be dropped. At slow rates the limiter waits longer; see
	// idleAfterFor.
	idleTTL = 3 * time.Minute
)

// idleAfterFor is how long a bucket must be idle before eviction is safe. A
// dropped bucket comes back full, so it may only be dropped once it would
// have refilled to full anyway: after burst/rps seconds, and never sooner
// than idleTTL. Rates so slow that the refill time overflows a Duration are
// never evicted by idleness.
func idleAfterFor(rps, burst float64) time.Duration {
	refill := burst / rps * float64(time.Second)
	if refill >= math.MaxInt64 {
		return time.Duration(math.MaxInt64)
	}
	return max(idleTTL, time.Duration(refill))
}

// RateLimiter limits requests per client IP with a token bucket: each client
// may send up to burst requests at once, refilled at rps tokens per second.
// A nil *RateLimiter is valid and limits nothing.
type RateLimiter struct {
	rps        float64
	burst      float64
	trustProxy bool
	idleAfter  time.Duration
	now        func() time.Time

	mu      sync.Mutex
	buckets map[string]*bucket

	stopOnce sync.Once
	stop     chan struct{}
	done     chan struct{}
}

type bucket struct {
	tokens float64
	last   time.Time
}

// RateLimitConfig configures a RateLimiter.
type RateLimitConfig struct {
	// RPS is the sustained rate per client in requests per second. Zero
	// disables rate limiting; it must otherwise be finite and positive.
	RPS float64
	// Burst is how many requests a client may send at once. At least 1.
	Burst int
	// TrustProxy takes the client IP from X-Forwarded-For; see ClientIP.
	TrustProxy bool
}

// Validate reports a configuration that would not limit sensibly. NaN would
// poison every refill after the first request and +Inf would never throttle,
// so both are rejected rather than trusted.
func (c RateLimitConfig) Validate() error {
	if math.IsNaN(c.RPS) || math.IsInf(c.RPS, 0) || c.RPS < 0 {
		return fmt.Errorf("rate limit: RPS must be a finite number >= 0, got %v", c.RPS)
	}
	if c.Burst < 1 {
		return fmt.Errorf("rate limit: burst must be at least 1, got %d", c.Burst)
	}
	return nil
}

// NewRateLimiter returns a limiter for cfg and starts the goroutine that
// evicts idle clients; call Stop on shutdown. It returns nil, meaning no
// limit, when cfg.RPS is zero, and an error when cfg is invalid.
func NewRateLimiter(cfg RateLimitConfig) (*RateLimiter, error) {
	l, err := newRateLimiter(cfg, time.Now)
	if l == nil || err != nil {
		return nil, err
	}
	ticker := time.NewTicker(sweepInterval)
	go func() {
		l.run(ticker.C)
		ticker.Stop()
	}()
	return l, nil
}

// newRateLimiter builds a limiter without the sweeper goroutine, with an
// injectable clock for tests.
func newRateLimiter(cfg RateLimitConfig, now func() time.Time) (*RateLimiter, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if cfg.RPS == 0 {
		return nil, nil
	}
	return &RateLimiter{
		rps:        cfg.RPS,
		burst:      float64(cfg.Burst),
		trustProxy: cfg.TrustProxy,
		idleAfter:  idleAfterFor(cfg.RPS, float64(cfg.Burst)),
		now:        now,
		buckets:    make(map[string]*bucket),
		stop:       make(chan struct{}),
		done:       make(chan struct{}),
	}, nil
}

// Limit wraps next so that POST requests over a client's limit get 429 with a
// Retry-After header. Other methods pass through untouched.
func (l *RateLimiter) Limit(next http.Handler) http.Handler {
	if l == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}
		allowed, wait := l.allow(ClientIP(r, l.trustProxy))
		if !allowed {
			seconds := retryAfterSeconds(wait)
			w.Header().Set("Retry-After", strconv.Itoa(seconds))
			writeError(w, r, http.StatusTooManyRequests, CodeRateLimited, retryMessage(seconds))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Stop ends the eviction goroutine and waits for it. It is safe to call more
// than once and on a nil limiter.
func (l *RateLimiter) Stop() {
	if l == nil {
		return
	}
	l.stopOnce.Do(func() { close(l.stop) })
	<-l.done
}

// allow takes one token from key's bucket. When the bucket is empty it
// reports how long until the next token.
func (l *RateLimiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	} else {
		elapsed := now.Sub(b.last).Seconds()
		b.tokens = math.Min(l.burst, b.tokens+elapsed*l.rps)
		b.last = now
	}

	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	missing := 1 - b.tokens
	return false, time.Duration(missing / l.rps * float64(time.Second))
}

// run evicts idle buckets on every tick until Stop is called.
func (l *RateLimiter) run(tick <-chan time.Time) {
	defer close(l.done)
	for {
		select {
		case <-tick:
			l.sweep()
		case <-l.stop:
			return
		}
	}
}

// sweep drops buckets idle for at least idleAfter, which by then have
// refilled to full, so dropping them changes nothing for their clients.
func (l *RateLimiter) sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	for key, b := range l.buckets {
		if now.Sub(b.last) >= l.idleAfter {
			delete(l.buckets, key)
		}
	}
}

// retryAfterSeconds rounds a wait up to whole seconds, as Retry-After
// requires. It never returns less than 1: a token a few nanoseconds away can
// round to a zero duration, and "retry after 0 seconds" invites a tight loop.
func retryAfterSeconds(wait time.Duration) int {
	return max(1, int(math.Ceil(wait.Seconds())))
}

func retryMessage(seconds int) string {
	unit := "seconds"
	if seconds == 1 {
		unit = "second"
	}
	return fmt.Sprintf("Too many requests. Try again in %d %s.", seconds, unit)
}
