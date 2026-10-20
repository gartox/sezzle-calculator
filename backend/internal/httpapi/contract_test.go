package httpapi

import (
	"go/ast"
	"go/parser"
	"go/token"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/gartox/sezzle-calculator/backend/internal/calculator"
)

// The OpenAPI document is the contract clients are generated from. These
// tests fail when its enums and the Go code disagree in either direction.

func TestOpenAPIErrorCodesMatchHandler(t *testing.T) {
	spec := specEnum(t, "ErrorCode")
	code := handlerCodeConstants(t)

	if !slices.Equal(spec, code) {
		t.Fatalf("error codes differ\n  openapi.yaml: %v\n  handler.go:   %v", spec, code)
	}
}

func TestOpenAPIOperationsMatchCalculator(t *testing.T) {
	spec := specEnum(t, "Operation")
	code := make([]string, 0, len(calculator.Operations))
	for _, op := range calculator.Operations {
		code = append(code, string(op))
	}
	slices.Sort(code)

	if !slices.Equal(spec, code) {
		t.Fatalf("operations differ\n  openapi.yaml: %v\n  calculator:   %v", spec, code)
	}
}

// specEnum returns the sorted enum values of a schema under
// components.schemas in the embedded document. It understands exactly the
// layout used in openapi.yaml (a `Name:` line at four spaces, an `enum:` line
// below it, then `- value` items) so no YAML library is needed.
func specEnum(t *testing.T, schema string) []string {
	t.Helper()
	lines := strings.Split(string(openAPISpec), "\n")

	start := -1
	for i, line := range lines {
		if line == "    "+schema+":" {
			start = i
			break
		}
	}
	if start < 0 {
		t.Fatalf("schema %q not found in openapi.yaml", schema)
	}

	var values []string
	inEnum := false
	for _, line := range lines[start+1:] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		indent := len(line) - len(strings.TrimLeft(line, " "))
		if indent <= 4 {
			break // next schema
		}
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "enum:":
			inEnum = true
		case inEnum && strings.HasPrefix(trimmed, "- "):
			values = append(values, strings.TrimSpace(strings.TrimPrefix(trimmed, "- ")))
		case inEnum:
			inEnum = false
		}
	}
	if len(values) == 0 {
		t.Fatalf("schema %q has no enum values in openapi.yaml", schema)
	}
	slices.Sort(values)
	return values
}

// handlerCodeConstants parses handler.go and returns the sorted values of
// every string constant whose name starts with "Code".
func handlerCodeConstants(t *testing.T) []string {
	t.Helper()
	file, err := parser.ParseFile(token.NewFileSet(), "handler.go", nil, 0)
	if err != nil {
		t.Fatalf("parse handler.go: %v", err)
	}

	var values []string
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.CONST {
			continue
		}
		for _, spec := range gen.Specs {
			vs := spec.(*ast.ValueSpec)
			for i, name := range vs.Names {
				if !strings.HasPrefix(name.Name, "Code") || i >= len(vs.Values) {
					continue
				}
				lit, ok := vs.Values[i].(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					continue
				}
				value, err := strconv.Unquote(lit.Value)
				if err != nil {
					t.Fatalf("unquote %s: %v", lit.Value, err)
				}
				values = append(values, value)
			}
		}
	}
	if len(values) == 0 {
		t.Fatal("no Code constants found in handler.go")
	}
	slices.Sort(values)
	return values
}
