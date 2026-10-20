// Typed client for the calculator API. Mirrors the backend contract in
// backend/internal/httpapi so the UI never builds requests by hand.

export type Operation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'sqrt'
  | 'percent'

export interface OperationOption {
  value: Operation
  label: string
}

/** Every supported operation with a label for the UI, in display order. */
export const OPERATIONS: readonly OperationOption[] = [
  { value: 'add', label: 'Add (a + b)' },
  { value: 'subtract', label: 'Subtract (a − b)' },
  { value: 'multiply', label: 'Multiply (a × b)' },
  { value: 'divide', label: 'Divide (a ÷ b)' },
  { value: 'power', label: 'Power (a ^ b)' },
  { value: 'sqrt', label: 'Square root (√a)' },
  { value: 'percent', label: 'Percent (a % of b)' },
]

/** Operations that take a single operand. */
export const UNARY_OPERATIONS: ReadonlySet<Operation> = new Set<Operation>(['sqrt'])

export const CALCULATE_PATH = '/api/v1/calculate'

/**
 * Error raised by {@link calculate}. `code` is the backend's error code
 * (for example DIVISION_BY_ZERO) or one of the client-side codes
 * NETWORK_ERROR and UNEXPECTED_RESPONSE. `status` is the HTTP status, or 0
 * when no response was received.
 */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

interface ErrorEnvelope {
  error: { code: string; message: string }
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false
  }
  const error = (body as { error: unknown }).error
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

/**
 * Sends one calculation to the API and resolves with the numeric result.
 * For unary operations (sqrt) `b` is omitted from the request.
 */
export async function calculate(
  operation: Operation,
  a: number,
  b?: number,
): Promise<number> {
  const payload: { operation: Operation; a: number; b?: number } = { operation, a }
  if (!UNARY_OPERATIONS.has(operation)) {
    payload.b = b
  }

  let response: Response
  try {
    response = await fetch(CALCULATE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the calculator service.', 0)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }

  if (!response.ok) {
    if (isErrorEnvelope(body)) {
      throw new ApiError(body.error.code, body.error.message, response.status)
    }
    throw new ApiError(
      'UNEXPECTED_RESPONSE',
      `The calculator service returned an unexpected response (HTTP ${response.status}).`,
      response.status,
    )
  }

  const result = (body as { result?: unknown } | undefined)?.result
  if (typeof result !== 'number') {
    throw new ApiError(
      'UNEXPECTED_RESPONSE',
      'The calculator service returned an unexpected response.',
      response.status,
    )
  }
  return result
}
