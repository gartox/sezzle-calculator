package httpapi

import (
	"container/list"
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

// DefaultMaxClients bounds memory when RateLimitConfig.MaxClients is zero.
const DefaultMaxClients = 10_000

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
//
// Memory is bounded. At most MaxClients buckets are kept, in a list ordered by
// when each client was last seen. When the table is full, a new client evicts
// the least recently seen one. The alternative, answering 429 to every new
// client while full, would let anyone who fills the table with rotating
// addresses lock out all new legitimate clients; eviction only resets the
// oldest client to a full bucket, which a client rotating addresses gets
// anyway. Idle buckets are swept from the old end of the list, so a sweep
// costs only the buckets it removes.
type RateLimiter struct {
	rps        float64
	burst      float64
	trustProxy bool
	idleAfter  time.Duration
	maxClients int
	now        func() time.Time

	mu      sync.Mutex
	clients map[string]*list.Element // each value is a *bucket
	recency *list.List               // most recently seen at the front

	stopOnce sync.Once
	stop     chan struct{}
	done     chan struct{}
}

type bucket struct {
	key    string
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
	// MaxClients caps how many clients are tracked at once; zero means
	// DefaultMaxClients. When the table is full, the least recently seen
	// client is forgotten to admit a new one (see RateLimiter).
	MaxClients int
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
	if c.MaxClients < 0 {
		return fmt.Errorf("rate limit: max clients must be at least 1, got %d", c.MaxClients)
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
	maxClients := cfg.MaxClients
	if maxClients == 0 {
		maxClients = DefaultMaxClients
	}
	return &RateLimiter{
		rps:        cfg.RPS,
		burst:      float64(cfg.Burst),
		trustProxy: cfg.TrustProxy,
		idleAfter:  idleAfterFor(cfg.RPS, float64(cfg.Burst)),
		maxClients: maxClients,
		now:        now,
		clients:    make(map[string]*list.Element),
		recency:    list.New(),
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
	b := l.touch(key, now)
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := (1 - b.tokens) / l.rps * float64(time.Second)
	if wait >= math.MaxInt64 {
		return false, time.Duration(math.MaxInt64)
	}
	return false, time.Duration(wait)
}

// touch returns key's bucket refilled up to now and marks it most recently
// seen, creating it (and evicting the least recently seen client if the
// table is full) when key is new. The caller holds l.mu.
func (l *RateLimiter) touch(key string, now time.Time) *bucket {
	if e, ok := l.clients[key]; ok {
		b := e.Value.(*bucket)
		elapsed := max(now.Sub(b.last).Seconds(), 0)
		b.tokens = math.Min(l.burst, b.tokens+elapsed*l.rps)
		b.last = now
		l.recency.MoveToFront(e)
		return b
	}
	if l.recency.Len() >= l.maxClients {
		l.remove(l.recency.Back())
	}
	b := &bucket{key: key, tokens: l.burst, last: now}
	l.clients[key] = l.recency.PushFront(b)
	return b
}

func (l *RateLimiter) remove(e *list.Element) {
	delete(l.clients, e.Value.(*bucket).key)
	l.recency.Remove(e)
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
// refilled to full, so dropping them changes nothing for their clients. It
// walks from the least recently seen end and stops at the first bucket that
// is still recent, so it never scans clients it will keep.
func (l *RateLimiter) sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	for e := l.recency.Back(); e != nil; e = l.recency.Back() {
		if now.Sub(e.Value.(*bucket).last) < l.idleAfter {
			return
		}
		l.remove(e)
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
