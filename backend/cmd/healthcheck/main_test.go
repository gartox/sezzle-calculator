package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCheck(t *testing.T) {
	healthy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer healthy.Close()
	unhealthy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer unhealthy.Close()
	unreachable := httptest.NewServer(http.NotFoundHandler())
	unreachable.Close()

	if err := check(healthy.URL, time.Second); err != nil {
		t.Errorf("check(healthy) = %v, want nil", err)
	}
	if err := check(unhealthy.URL, time.Second); err == nil {
		t.Error("check(unhealthy) = nil, want error")
	}
	if err := check(unreachable.URL, time.Second); err == nil {
		t.Error("check(unreachable) = nil, want error")
	}
}
