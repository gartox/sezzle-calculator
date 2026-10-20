// Package calculator implements the arithmetic behind the calculator API.
// It has no knowledge of HTTP: callers pass an Operation and two operands
// and get back a rounded result or one of the sentinel errors below.
package calculator

import (
	"errors"
	"fmt"
	"math"
	"strconv"
)

// Operation identifies an arithmetic operation supported by the calculator.
type Operation string

// Supported operations.
const (
	Add      Operation = "add"
	Subtract Operation = "subtract"
	Multiply Operation = "multiply"
	Divide   Operation = "divide"
	Power    Operation = "power"
	Sqrt     Operation = "sqrt"
	Percent  Operation = "percent"
)

// Operations lists every supported operation in a stable order.
var Operations = []Operation{Add, Subtract, Multiply, Divide, Power, Sqrt, Percent}

// Errors returned by Calculate. Callers should compare them with errors.Is.
var (
	ErrUnknownOperation = errors.New("unknown operation")
	ErrInvalidOperand   = errors.New("operand is not a finite number")
	ErrDivisionByZero   = errors.New("division by zero")
	ErrNegativeSqrt     = errors.New("square root of a negative number")
	ErrOverflow         = errors.New("result is not a finite number")
)

// SignificantDigits is the precision every result is rounded to. Twelve
// digits hides binary floating-point noise (0.1 + 0.2 becomes 0.3) while
// staying well within what float64 can represent.
const SignificantDigits = 12

// ParseOperation validates s and converts it into an Operation.
func ParseOperation(s string) (Operation, error) {
	op := Operation(s)
	for _, known := range Operations {
		if op == known {
			return op, nil
		}
	}
	return "", fmt.Errorf("%w: %q", ErrUnknownOperation, s)
}

// Calculate applies op to a and b and returns the result rounded to
// SignificantDigits. Sqrt uses only a and ignores b. Percent returns a
// percent of b, so Percent with a=15 and b=200 yields 30. Power returns a
// raised to b.
func Calculate(op Operation, a, b float64) (float64, error) {
	if _, err := ParseOperation(string(op)); err != nil {
		return 0, err
	}
	if !isFinite(a) {
		return 0, fmt.Errorf("%w: a", ErrInvalidOperand)
	}
	if op != Sqrt && !isFinite(b) {
		return 0, fmt.Errorf("%w: b", ErrInvalidOperand)
	}

	var result float64
	switch op {
	case Add:
		result = a + b
	case Subtract:
		result = a - b
	case Multiply:
		result = a * b
	case Divide:
		if b == 0 {
			return 0, ErrDivisionByZero
		}
		result = a / b
	case Power:
		result = math.Pow(a, b)
	case Sqrt:
		if a < 0 {
			return 0, ErrNegativeSqrt
		}
		result = math.Sqrt(a)
	case Percent:
		result = a * b / 100
	}

	if !isFinite(result) {
		return 0, ErrOverflow
	}
	return Round(result), nil
}

// Round rounds x to SignificantDigits significant digits. It formats the
// value in decimal and parses it back, so the result is the float64 nearest
// to the rounded decimal and never overflows, whatever the magnitude of x.
// Negative zero becomes zero: IEEE 754 keeps the sign (-1 * 0 is -0), but a
// calculator showing "-0" only confuses people.
func Round(x float64) float64 {
	if x == 0 {
		return 0
	}
	rounded, err := strconv.ParseFloat(strconv.FormatFloat(x, 'g', SignificantDigits, 64), 64)
	if err != nil {
		// FormatFloat always produces a parseable number for finite input;
		// fall back to the original value rather than fail.
		return x
	}
	return rounded
}

func isFinite(x float64) bool {
	return !math.IsNaN(x) && !math.IsInf(x, 0)
}
