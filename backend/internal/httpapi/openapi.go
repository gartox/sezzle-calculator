package httpapi

import (
	_ "embed"
	"net/http"
)

// openAPISpec is the API contract, embedded so the binary always serves the
// document it was built from. The frontend types are generated from the same
// file and a test keeps its enums in sync with the Go code.
//
//go:embed openapi.yaml
var openAPISpec []byte

func handleOpenAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeError(w, http.StatusMethodNotAllowed, CodeMethodNotAllowed, "Use GET to fetch the OpenAPI document.")
		return
	}
	w.Header().Set("Content-Type", "application/yaml")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(openAPISpec)
}
