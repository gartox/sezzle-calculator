package calculator

import (
	"errors"
	"math"
	"testing"
)

func TestCalculate(t *testing.T) {
	tests := []struct {
		name    string
		op      Operation
		a, b    float64
		want    float64
		wantErr error
	}{
		{name: "add", op: Add, a: 2, b: 3, want: 5},
		{name: "add negatives", op: Add, a: -2, b: -3, want: -5},
		{name: "add rounds float noise", op: Add, a: 0.1, b: 0.2, want: 0.3},
		{name: "add large numbers", op: Add, a: 1e300, b: 1e300, want: 2e300},
		{name: "subtract", op: Subtract, a: 10, b: 4, want: 6},
		{name: "subtract to negative", op: Subtract, a: 4, b: 10, want: -6},
		{name: "subtract negative operand", op: Subtract, a: -2, b: -3, want: 1},
		{name: "multiply", op: Multiply, a: 6, b: 7, want: 42},
		{name: "multiply by negative", op: Multiply, a: -6, b: 7, want: -42},
		{name: "multiply large numbers", op: Multiply, a: 1e200, b: 1e100, want: 1e300},
		{name: "multiply overflows", op: Multiply, a: 1e308, b: 10, wantErr: ErrOverflow},
		{name: "divide", op: Divide, a: 10, b: 4, want: 2.5},
		{name: "divide negative", op: Divide, a: -9, b: 3, want: -3},
		{name: "divide rounds repeating decimal", op: Divide, a: 1, b: 3, want: 0.333333333333},
		{name: "divide by zero", op: Divide, a: 1, b: 0, wantErr: ErrDivisionByZero},
		{name: "divide zero by zero", op: Divide, a: 0, b: 0, wantErr: ErrDivisionByZero},
		{name: "power", op: Power, a: 2, b: 10, want: 1024},
		{name: "power negative base", op: Power, a: -2, b: 3, want: -8},
		{name: "power fractional exponent", op: Power, a: 9, b: 0.5, want: 3},
		{name: "power negative exponent", op: Power, a: 2, b: -2, want: 0.25},
		{name: "power zero to zero", op: Power, a: 0, b: 0, want: 1},
		{name: "power overflows", op: Power, a: 1e308, b: 2, wantErr: ErrOverflow},
		{name: "power zero to negative is infinite", op: Power, a: 0, b: -1, wantErr: ErrOverflow},
		{name: "power negative base fractional exponent is not real", op: Power, a: -8, b: 0.5, wantErr: ErrOverflow},
		{name: "sqrt", op: Sqrt, a: 16, want: 4},
		{name: "sqrt of zero", op: Sqrt, a: 0, want: 0},
		{name: "sqrt ignores b", op: Sqrt, a: 16, b: 99, want: 4},
		{name: "sqrt ignores non-finite b", op: Sqrt, a: 16, b: math.NaN(), want: 4},
		{name: "sqrt rounds irrational result", op: Sqrt, a: 2, want: 1.41421356237},
		{name: "sqrt of negative", op: Sqrt, a: -4, wantErr: ErrNegativeSqrt},
		{name: "percent", op: Percent, a: 15, b: 200, want: 30},
		{name: "percent of zero", op: Percent, a: 15, b: 0, want: 0},
		{name: "percent negative", op: Percent, a: -50, b: 80, want: -40},
		{name: "percent overflows", op: Percent, a: 1e308, b: 1e308, wantErr: ErrOverflow},
		{name: "percent with intermediate overflow: 100% of 1e308", op: Percent, a: 100, b: 1e308, want: 1e308},
		{name: "percent with intermediate overflow: 1e308% of 100", op: Percent, a: 1e308, b: 100, want: 1e308},
		{name: "percent of the largest float", op: Percent, a: 50, b: math.MaxFloat64, want: 8.98846567431e307},
		{name: "percent of a negative huge value", op: Percent, a: -100, b: 1e308, want: -1e308},
		{name: "percent genuine overflow: 200% of 1e308", op: Percent, a: 200, b: 1e308, wantErr: ErrOverflow},
		{name: "percent subnormal a keeps its value", op: Percent, a: 5e-324, b: 100, want: 5e-324},
		{name: "percent subnormal b keeps its value", op: Percent, a: 100, b: 5e-324, want: 5e-324},
		{name: "percent of a subnormal that underflows is zero", op: Percent, a: 1, b: 5e-324, want: 0},
		{name: "nan operand a", op: Add, a: math.NaN(), b: 1, wantErr: ErrInvalidOperand},
		{name: "nan operand b", op: Add, a: 1, b: math.NaN(), wantErr: ErrInvalidOperand},
		{name: "positive infinity operand", op: Multiply, a: math.Inf(1), b: 1, wantErr: ErrInvalidOperand},
		{name: "negative infinity operand", op: Subtract, a: 1, b: math.Inf(-1), wantErr: ErrInvalidOperand},
		{name: "multiply negative by zero is zero, not -0", op: Multiply, a: -1, b: 0, want: 0},
		{name: "sqrt of negative zero is zero", op: Sqrt, a: math.Copysign(0, -1), want: 0},
		{name: "percent of negative number by zero is zero", op: Percent, a: 0, b: -5, want: 0},
		{name: "divide by negative zero", op: Divide, a: 1, b: math.Copysign(0, -1), wantErr: ErrDivisionByZero},
		{name: "underflow rounds to zero", op: Multiply, a: 1e-200, b: 1e-200, want: 0},
		{name: "unknown operation", op: Operation("modulo"), a: 1, b: 2, wantErr: ErrUnknownOperation},
		{name: "empty operation", op: Operation(""), a: 1, b: 2, wantErr: ErrUnknownOperation},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Calculate(%q, %v, %v) error = %v, want %v", tt.op, tt.a, tt.b, err, tt.wantErr)
			}
			if err != nil {
				return
			}
			if got != tt.want {
				t.Fatalf("Calculate(%q, %v, %v) = %v, want %v", tt.op, tt.a, tt.b, got, tt.want)
			}
			if got == 0 && math.Signbit(got) {
				t.Fatalf("Calculate(%q, %v, %v) = -0, want 0", tt.op, tt.a, tt.b)
			}
		})
	}
}

func TestParseOperation(t *testing.T) {
	for _, op := range Operations {
		got, err := ParseOperation(string(op))
		if err != nil || got != op {
			t.Errorf("ParseOperation(%q) = %q, %v; want %q, nil", op, got, err, op)
		}
	}

	for _, s := range []string{"", "modulo", "ADD", " add"} {
		if _, err := ParseOperation(s); !errors.Is(err, ErrUnknownOperation) {
			t.Errorf("ParseOperation(%q) error = %v, want ErrUnknownOperation", s, err)
		}
	}
}

func TestRound(t *testing.T) {
	tests := []struct {
		name string
		in   float64
		want float64
	}{
		{name: "zero", in: 0, want: 0},
		{name: "negative zero becomes zero", in: math.Copysign(0, -1), want: 0},
		{name: "integer unchanged", in: 1024, want: 1024},
		{name: "negative unchanged", in: -2.5, want: -2.5},
		{name: "float noise removed", in: 0.1 + 0.2, want: 0.3},
		{name: "negative float noise removed", in: -0.1 - 0.2, want: -0.3},
		{name: "repeating decimal truncated to 12 digits", in: 2.0 / 3.0, want: 0.666666666667},
		{name: "small magnitude keeps 12 digits", in: 1.0 / 3.0e10, want: 3.33333333333e-11},
		{name: "integer beyond 12 digits is rounded", in: 123456789012345, want: 123456789012000},
		{name: "large magnitude does not overflow", in: math.MaxFloat64, want: 1.79769313486e308},
		{name: "tiny magnitude survives", in: 5e-324, want: 5e-324},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Round(tt.in)
			if got != tt.want || math.Signbit(got) != math.Signbit(tt.want) {
				t.Fatalf("Round(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestUnary(t *testing.T) {
	for _, op := range Operations {
		if got, want := op.Unary(), op == Sqrt; got != want {
			t.Errorf("%s.Unary() = %v, want %v", op, got, want)
		}
	}
}
