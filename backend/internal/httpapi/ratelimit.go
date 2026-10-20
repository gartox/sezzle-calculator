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
	// idleTTL is how long a client may stay silent before its bucket is
	// dropped. A dropped bucket comes back full, which is what it would have
	// refilled to anyway at any sensible rate.
	idleTTL = 3 * time.Minute
)

// RateLimiter limits requests per client IP with a token bucket: each client
// may send up to burst requests at once, refilled at rps tokens per second.
// A nil *RateLimiter is valid and limits nothing.
type RateLimiter struct {
	rps        float64
	burst      float64
	trustProxy bool
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

// NewRateLimiter returns a limiter allowing rps requests per second with
// bursts of up to burst, and starts the goroutine that evicts idle clients.
// It returns nil, meaning no limit, when rps is zero or negative. Call Stop on
// shutdown. See ClientIP for what trustProxy changes.
func NewRateLimiter(rps float64, burst int, trustProxy bool) *RateLimiter {
	l := newRateLimiter(rps, burst, trustProxy, time.Now)
	if l == nil {
		return nil
	}
	ticker := time.NewTicker(sweepInterval)
	go func() {
		l.run(ticker.C)
		ticker.Stop()
	}()
	return l
}

// newRateLimiter builds a limiter without the sweeper goroutine, with an
// injectable clock for tests.
func newRateLimiter(rps float64, burst int, trustProxy bool, now func() time.Time) *RateLimiter {
	if rps <= 0 {
		return nil
	}
	if burst < 1 {
		burst = 1
	}
	return &RateLimiter{
		rps:        rps,
		burst:      float64(burst),
		trustProxy: trustProxy,
		now:        now,
		buckets:    make(map[string]*bucket),
		stop:       make(chan struct{}),
		done:       make(chan struct{}),
	}
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

// sweep drops buckets that have been idle longer than idleTTL, so memory is
// bounded by the number of clients seen in the last few minutes.
func (l *RateLimiter) sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := l.now().Add(-idleTTL)
	for key, b := range l.buckets {
		if b.last.Before(cutoff) {
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
