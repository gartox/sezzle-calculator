package httpapi

import (
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeClock is a manually advanced clock for deterministic refill tests.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newFakeClock() *fakeClock {
	return &fakeClock{t: time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// post sends one calculation through a handler built with limiter, from the
// given remote address and optional X-Forwarded-For header.
func post(t *testing.T, h http.Handler, remote, forwarded string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, calculatePath, strings.NewReader(`{"operation":"add","a":1,"b":2}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = remote
	if forwarded != "" {
		req.Header.Set("X-Forwarded-For", forwarded)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestRateLimitBurstThenReject(t *testing.T) {
	clock := newFakeClock()
	h := NewHandler(mustLimiter(t, RateLimitConfig{RPS: 10, Burst: 20}, clock.Now))

	for i := range 20 {
		if rec := post(t, h, "203.0.113.1:1000", ""); rec.Code != http.StatusOK {
			t.Fatalf("request %d within the burst: status %d, want 200", i+1, rec.Code)
		}
	}

	rec := post(t, h, "203.0.113.1:1000", "")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("request over the burst: status %d, want 429", rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "1" {
		t.Fatalf("Retry-After = %q, want %q", got, "1")
	}
	assertJSONContentType(t, rec)
	var resp struct {
		Error struct {
			Code      string `json:"code"`
			Message   string `json:"message"`
			RequestID string `json:"requestId"`
		} `json:"error"`
	}
	decodeBody(t, rec, &resp)
	if resp.Error.Code != CodeRateLimited || resp.Error.RequestID == "" {
		t.Fatalf("envelope = %+v, want RATE_LIMITED with a request ID", resp.Error)
	}
	if resp.Error.Message != "Too many requests. Try again in 1 second." {
		t.Fatalf("message = %q", resp.Error.Message)
	}
}

func TestRateLimitRefill(t *testing.T) {
	clock := newFakeClock()
	h := NewHandler(mustLimiter(t, RateLimitConfig{RPS: 10, Burst: 2}, clock.Now))
	const ip = "203.0.113.2:1000"

	post(t, h, ip, "")
	post(t, h, ip, "")
	if rec := post(t, h, ip, ""); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("bucket should be empty, got %d", rec.Code)
	}

	clock.Advance(100 * time.Millisecond) // one token at 10/s
	if rec := post(t, h, ip, ""); rec.Code != http.StatusOK {
		t.Fatalf("after one token refilled: status %d, want 200", rec.Code)
	}
	if rec := post(t, h, ip, ""); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("only one token should have refilled, got %d", rec.Code)
	}

	clock.Advance(time.Hour) // refill caps at the burst
	for i := range 2 {
		if rec := post(t, h, ip, ""); rec.Code != http.StatusOK {
			t.Fatalf("refilled request %d: status %d, want 200", i+1, rec.Code)
		}
	}
	if rec := post(t, h, ip, ""); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("refill must not exceed the burst, got %d", rec.Code)
	}
}

func TestRateLimitRetryAfterRoundsUp(t *testing.T) {
	clock := newFakeClock()
	h := NewHandler(mustLimiter(t, RateLimitConfig{RPS: 0.4, Burst: 1}, clock.Now)) // one token every 2.5 s
	post(t, h, "203.0.113.3:1000", "")

	rec := post(t, h, "203.0.113.3:1000", "")
	if got := rec.Header().Get("Retry-After"); got != "3" {
		t.Fatalf("Retry-After = %q, want %q (2.5 s rounded up)", got, "3")
	}
	if !strings.Contains(rec.Body.String(), "Try again in 3 seconds.") {
		t.Fatalf("message should use the plural: %s", rec.Body)
	}
}

func TestRateLimitIsolatesClients(t *testing.T) {
	clock := newFakeClock()
	h := NewHandler(mustLimiter(t, RateLimitConfig{RPS: 1, Burst: 1}, clock.Now))

	if rec := post(t, h, "198.51.100.1:1", ""); rec.Code != http.StatusOK {
		t.Fatalf("first client: %d", rec.Code)
	}
	if rec := post(t, h, "198.51.100.1:2", ""); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("same IP on another port must share the bucket, got %d", rec.Code)
	}
	if rec := post(t, h, "198.51.100.2:1", ""); rec.Code != http.StatusOK {
		t.Fatalf("a different IP must have its own bucket, got %d", rec.Code)
	}
}

func TestRateLimitForwardedFor(t *testing.T) {
	clock := newFakeClock()
	const proxy = "10.0.0.1:443"

	untrusted := NewHandler(mustLimiter(t, RateLimitConfig{RPS: 1, Burst: 1}, clock.Now))
	post(t, untrusted, proxy, "198.51.100.10")
	if rec := post(t, untrusted, proxy, "198.51.100.11"); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("without TRUST_PROXY a spoofed X-Forwarded-For must not grant a new bucket, got %d", rec.Code)
	}

	trusted := NewHandler(mustLimiter(t, RateLimitConfig{RPS: 1, Burst: 1, TrustProxy: true}, clock.Now))
	post(t, trusted, proxy, "198.51.100.10")
	if rec := post(t, trusted, proxy, "198.51.100.11"); rec.Code != http.StatusOK {
		t.Fatalf("with TRUST_PROXY each forwarded client has its own bucket, got %d", rec.Code)
	}
	if rec := post(t, trusted, proxy, "198.51.100.10"); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("with TRUST_PROXY the forwarded client is limited, got %d", rec.Code)
	}
}

func TestRateLimitEvictsIdleBuckets(t *testing.T) {
	clock := newFakeClock()
	l := mustLimiter(t, RateLimitConfig{RPS: 10, Burst: 20}, clock.Now)
	l.allow("idle")
	clock.Advance(2 * time.Minute)
	l.allow("recent")

	clock.Advance(idleTTL - time.Minute + time.Second) // idle is 3m1s old, recent 1m1s
	l.sweep()

	if l.tracked("idle") {
		t.Error("bucket idle for longer than idleTTL was kept")
	}
	if !l.tracked("recent") {
		t.Error("recently used bucket was evicted")
	}
}

func TestRateLimitSweeperRunsOnTickAndStops(t *testing.T) {
	clock := newFakeClock()
	l := mustLimiter(t, RateLimitConfig{RPS: 10, Burst: 20}, clock.Now)
	tick := make(chan time.Time)
	go l.run(tick)

	l.allow("idle")
	clock.Advance(idleTTL + time.Second)
	tick <- clock.Now() // unbuffered: the loop has received it
	l.Stop()            // waits for the loop to exit, so the sweep has finished
	l.Stop()            // a second call is safe

	if l.size() != 0 {
		t.Fatalf("sweeper did not evict on tick: %d buckets left", l.size())
	}
}

func TestNewRateLimiterStartsAndStops(t *testing.T) {
	l, err := NewRateLimiter(RateLimitConfig{RPS: 10, Burst: 20})
	if l == nil || err != nil {
		t.Fatalf("NewRateLimiter = %v, %v; want a limiter", l, err)
	}
	done := make(chan struct{})
	go func() { l.Stop(); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Stop did not return")
	}
}

func TestRateLimitDisabled(t *testing.T) {
	l, err := NewRateLimiter(RateLimitConfig{RPS: 0, Burst: 20})
	if l != nil || err != nil {
		t.Fatalf("NewRateLimiter(RPS 0) = %v, %v; want nil, nil", l, err)
	}
	l.Stop() // safe on nil
	h := NewHandler(l)
	for i := range 50 {
		if rec := post(t, h, "203.0.113.9:1", ""); rec.Code != http.StatusOK {
			t.Fatalf("request %d: status %d, want 200", i+1, rec.Code)
		}
	}
}

func TestRateLimitConfigValidation(t *testing.T) {
	tests := []struct {
		name    string
		cfg     RateLimitConfig
		wantErr bool
		wantNil bool
	}{
		{name: "valid", cfg: RateLimitConfig{RPS: 10, Burst: 20}},
		{name: "fractional rate", cfg: RateLimitConfig{RPS: 0.5, Burst: 1}},
		{name: "zero disables", cfg: RateLimitConfig{RPS: 0, Burst: 20}, wantNil: true},
		{name: "NaN rate", cfg: RateLimitConfig{RPS: math.NaN(), Burst: 20}, wantErr: true},
		{name: "infinite rate", cfg: RateLimitConfig{RPS: math.Inf(1), Burst: 20}, wantErr: true},
		{name: "negative infinite rate", cfg: RateLimitConfig{RPS: math.Inf(-1), Burst: 20}, wantErr: true},
		{name: "negative rate", cfg: RateLimitConfig{RPS: -1, Burst: 20}, wantErr: true},
		{name: "zero burst", cfg: RateLimitConfig{RPS: 1, Burst: 0}, wantErr: true},
		{name: "zero burst even when disabled", cfg: RateLimitConfig{RPS: 0, Burst: 0}, wantErr: true},
		{name: "explicit client cap", cfg: RateLimitConfig{RPS: 1, Burst: 1, MaxClients: 5}},
		{name: "negative client cap", cfg: RateLimitConfig{RPS: 1, Burst: 1, MaxClients: -1}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l, err := newRateLimiter(tt.cfg, time.Now)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && (l == nil) != tt.wantNil {
				t.Fatalf("limiter = %v, want nil %v", l, tt.wantNil)
			}
			public, perr := NewRateLimiter(tt.cfg)
			if (perr != nil) != tt.wantErr {
				t.Fatalf("NewRateLimiter err = %v, wantErr %v", perr, tt.wantErr)
			}
			public.Stop()
		})
	}
}

func TestRateLimitSkipsOtherRoutesAndMethods(t *testing.T) {
	clock := newFakeClock()
	h := NewHandler(mustLimiter(t, RateLimitConfig{RPS: 1, Burst: 1}, clock.Now))
	post(t, h, "203.0.113.5:1", "") // empties the bucket

	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, healthPath},
		{http.MethodGet, "/api/v1/openapi.yaml"},
		{http.MethodGet, calculatePath},
	} {
		for range 3 {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			req.RemoteAddr = "203.0.113.5:1"
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code == http.StatusTooManyRequests {
				t.Fatalf("%s %s was rate limited", tc.method, tc.path)
			}
		}
	}
}

func TestRetryAfterSeconds(t *testing.T) {
	tests := []struct {
		wait time.Duration
		want int
	}{
		{wait: 0, want: 1},
		{wait: time.Nanosecond, want: 1},
		{wait: 100 * time.Millisecond, want: 1},
		{wait: time.Second, want: 1},
		{wait: time.Second + time.Nanosecond, want: 2},
		{wait: 2500 * time.Millisecond, want: 3},
	}
	for _, tt := range tests {
		if got := retryAfterSeconds(tt.wait); got != tt.want {
			t.Errorf("retryAfterSeconds(%v) = %d, want %d", tt.wait, got, tt.want)
		}
	}
}

func TestRateLimitConcurrentRequests(t *testing.T) {
	clock := newFakeClock()
	h := NewHandler(mustLimiter(t, RateLimitConfig{RPS: 1, Burst: 20}, clock.Now))

	var allowed, limited atomic.Int64
	var wg sync.WaitGroup
	for i := range 200 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ip := "203.0.113.10:1"
			if i%2 == 1 {
				ip = "203.0.113.11:1"
			}
			switch post(t, h, ip, "").Code {
			case http.StatusOK:
				allowed.Add(1)
			case http.StatusTooManyRequests:
				limited.Add(1)
			}
		}()
	}
	wg.Wait()

	// Two clients with a burst of 20 each and no time passing: exactly 40 get
	// through, whatever the interleaving. Run with -race.
	if allowed.Load() != 40 || limited.Load() != 160 {
		t.Fatalf("allowed=%d limited=%d, want 40 and 160", allowed.Load(), limited.Load())
	}
}

// mustLimiter builds a limiter with an injected clock and fails on bad config.
func mustLimiter(t *testing.T, cfg RateLimitConfig, now func() time.Time) *RateLimiter {
	t.Helper()
	l, err := newRateLimiter(cfg, now)
	if err != nil || l == nil {
		t.Fatalf("newRateLimiter(%+v) = %v, %v", cfg, l, err)
	}
	return l
}

func TestRateLimitSlowRateIsNotResetEarly(t *testing.T) {
	// One request every 100 s with a burst of 5: a full refill takes 500 s,
	// longer than idleTTL. Evicting after idleTTL would hand back 5 requests.
	clock := newFakeClock()
	l := mustLimiter(t, RateLimitConfig{RPS: 0.01, Burst: 5}, clock.Now)
	h := NewHandler(l)
	const ip = "198.51.100.40:1"
	for range 5 {
		post(t, h, ip, "")
	}
	if rec := post(t, h, ip, ""); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("bucket should be empty, got %d", rec.Code)
	}

	clock.Advance(idleTTL + time.Second) // 181 s: 1.81 tokens back, not 5
	l.sweep()
	if !l.tracked(ip[:len(ip)-2]) {
		t.Fatal("a depleted slow bucket was evicted before it refilled")
	}
	if rec := post(t, h, ip, ""); rec.Code != http.StatusOK {
		t.Fatalf("one token has refilled, got %d", rec.Code)
	}
	if rec := post(t, h, ip, ""); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("only one token had refilled; a second request must be limited, got %d", rec.Code)
	}

	clock.Advance(500 * time.Second) // now full: eviction is harmless
	l.sweep()
	if l.tracked(ip[:len(ip)-2]) {
		t.Fatal("a bucket idle for its full refill time should be evicted")
	}
}

func TestIdleAfterFor(t *testing.T) {
	tests := []struct {
		rps, burst float64
		want       time.Duration
	}{
		{rps: 10, burst: 20, want: idleTTL},
		{rps: 0.01, burst: 5, want: 500 * time.Second},
		{rps: 1, burst: 180, want: idleTTL},
		{rps: 1, burst: 181, want: 181 * time.Second},
		{rps: 1e-300, burst: 1, want: time.Duration(math.MaxInt64)},
	}
	for _, tt := range tests {
		if got := idleAfterFor(tt.rps, tt.burst); got != tt.want {
			t.Errorf("idleAfterFor(%v, %v) = %v, want %v", tt.rps, tt.burst, got, tt.want)
		}
	}
}

func TestRateLimitClientCapEvictsLeastRecentlySeen(t *testing.T) {
	clock := newFakeClock()
	l := mustLimiter(t, RateLimitConfig{RPS: 1, Burst: 1, MaxClients: 3}, clock.Now)

	for _, key := range []string{"a", "b", "c"} {
		l.allow(key)
		clock.Advance(time.Millisecond)
	}
	l.allow("a") // "a" is now the most recent; "b" the least
	l.allow("d") // table full: "b" is forgotten

	if l.size() != 3 {
		t.Fatalf("size = %d, want the cap of 3", l.size())
	}
	for key, want := range map[string]bool{"a": true, "b": false, "c": true, "d": true} {
		if l.tracked(key) != want {
			t.Errorf("tracked(%q) = %v, want %v", key, !want, want)
		}
	}
	// "a" kept its spent bucket: eviction of others does not reset it.
	if ok, _ := l.allow("a"); ok {
		t.Error(`"a" should still be limited after the eviction of "b"`)
	}
}

func TestRateLimitDefaultClientCap(t *testing.T) {
	l := mustLimiter(t, RateLimitConfig{RPS: 1, Burst: 1}, time.Now)
	if l.maxClients != DefaultMaxClients {
		t.Fatalf("maxClients = %d, want %d", l.maxClients, DefaultMaxClients)
	}
}

func TestRateLimitSaturationUnderConcurrency(t *testing.T) {
	// Many goroutines with distinct addresses, as from a client rotating IPv6
	// addresses: the table never exceeds its cap. Run with -race.
	clock := newFakeClock()
	l := mustLimiter(t, RateLimitConfig{RPS: 1, Burst: 1, MaxClients: 100}, clock.Now)
	h := NewHandler(l)

	var wg sync.WaitGroup
	for g := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range 50 {
				post(t, h, fmt.Sprintf("[2001:db8::%x:%x]:1", g, i), "")
			}
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for range 20 {
			l.sweep()
		}
	}()
	wg.Wait()

	if l.size() > 100 || l.recency.Len() != len(l.clients) {
		t.Fatalf("size = %d (list %d, map %d), want at most 100 and both in step", l.size(), l.recency.Len(), len(l.clients))
	}
}

func TestRateLimitSweepStopsAtFirstRecentBucket(t *testing.T) {
	clock := newFakeClock()
	l := mustLimiter(t, RateLimitConfig{RPS: 10, Burst: 20}, clock.Now)
	l.allow("old-1")
	l.allow("old-2")
	clock.Advance(idleTTL)
	l.allow("new-1")
	l.allow("new-2")

	l.sweep()

	if l.size() != 2 || !l.tracked("new-1") || !l.tracked("new-2") {
		t.Fatalf("after sweep: size %d, want only the two recent clients", l.size())
	}
}

func TestRateLimitWaitDoesNotOverflow(t *testing.T) {
	l := mustLimiter(t, RateLimitConfig{RPS: 1e-300, Burst: 1}, time.Now)
	l.allow("slow")
	ok, wait := l.allow("slow")
	if ok || wait != time.Duration(math.MaxInt64) {
		t.Fatalf("allow = %v, %v; want limited with the maximum wait", ok, wait)
	}
}

// tracked and size let tests inspect the table without reaching into it.
func (l *RateLimiter) tracked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	_, ok := l.clients[key]
	return ok
}

func (l *RateLimiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.clients)
}
