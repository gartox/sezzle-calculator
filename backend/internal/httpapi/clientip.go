package httpapi

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// ClientIP returns the address of the client that sent r.
//
// By default it is the connection's remote address, which the client cannot
// forge. Only when trustProxy is true is the first address in X-Forwarded-For
// used instead: that header is set by whoever sends the request, so trusting it
// without a proxy in front lets any client pick its own IP and dodge per-IP
// limits. Enable it only behind a reverse proxy that overwrites the header.
func ClientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		first, _, _ := strings.Cut(r.Header.Get("X-Forwarded-For"), ",")
		if addr, err := netip.ParseAddr(strings.TrimSpace(first)); err == nil {
			return addr.String()
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
