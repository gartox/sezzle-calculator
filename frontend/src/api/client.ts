// Typed client for the calculator API. The request, response and error
// types come from schema.d.ts, which is generated from the OpenAPI document
// (`npm run generate:api`), so the UI cannot drift from the backend contract.

import type { components } from './schema'

type Schemas = components['schemas']

export type Operation = Schemas['Operation']
type CalculateRequest = Schemas['CalculateRequest']

/** Codes the client raises itself when there is no usable API response. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'UNEXPECTED_RESPONSE' | 'TIMEOUT'

/** Every code an {@link ApiError} can carry: the API's codes plus the client's. */
export type ErrorCode = Schemas['ErrorCode'] | ClientErrorCode

type UnaryOperation = Schemas['UnaryOperation']

/** Operations that take a single operand. */
export const UNARY_OPERATIONS: ReadonlySet<Operation> = new Set<UnaryOperation>(['sqrt'])

function isUnary(operation: Operation): operation is UnaryOperation {
  return UNARY_OPERATIONS.has(operation)
}

/**
 * Builds the body in the contract's shape: a unary request carries only `a`,
 * a binary request needs `b` too. A binary call without `b` is a bug in the
 * caller, not a request worth sending, so it throws.
 */
export function requestBody(operation: Operation, a: number, b?: number): CalculateRequest {
  if (isUnary(operation)) {
    return { operation, a }
  }
  if (b === undefined) {
    throw new TypeError(`Operation "${operation}" needs a second operand.`)
  }
  return { operation, a, b }
}

export const CALCULATE_PATH = '/api/v1/calculate'

/**
 * Error raised by {@link calculate}. `code` is the backend's error code
 * (for example DIVISION_BY_ZERO) or one of the client-side codes
 * NETWORK_ERROR, UNEXPECTED_RESPONSE and TIMEOUT. `status` is the HTTP status, or 0
 * when no response was received. `requestId` is set when the backend answered,
 * so a user can quote it.
 */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  /** The server's ID for the failed request; undefined for client-side errors. */
  readonly requestId?: string

  constructor(code: ErrorCode, message: string, status: number, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.requestId = requestId
  }
}

// The guard checks the envelope's shape. The code itself is trusted to be one
// of the contract's values: the API is same-origin and built from the same
// OpenAPI document as these types.
function isErrorEnvelope(body: unknown): body is Schemas['ErrorResponse'] {
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
 * For unary operations (sqrt) `b` is omitted from the request. `signal`
 * cancels the request; the caller owns the timeout.
 */
export async function calculate(
  operation: Operation,
  a: number,
  b?: number,
  signal?: AbortSignal,
): Promise<number> {
  const payload = requestBody(operation, a, b)

  let response: Response
  try {
    response = await fetch(CALCULATE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
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
      throw new ApiError(body.error.code, body.error.message, response.status, body.error.requestId)
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
