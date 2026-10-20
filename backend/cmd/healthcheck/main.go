// Command healthcheck probes the server's health endpoint and exits with a
// non-zero status unless it answers 200. The runtime image is distroless,
// with no shell, curl or wget, so Docker and Compose run this binary as the
// container health check instead.
package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if err := check("http://127.0.0.1:"+port+"/api/v1/health", 2*time.Second); err != nil {
		fmt.Fprintln(os.Stderr, "health check failed:", err)
		os.Exit(1)
	}
}

// check performs one GET against url and reports any outcome other than 200.
func check(url string, timeout time.Duration) error {
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return nil
}
