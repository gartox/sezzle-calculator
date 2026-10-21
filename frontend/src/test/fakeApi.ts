// A local stand-in for the API, for stories and tests: it computes results
// the way the backend does for ordinary inputs and answers division by zero
// and a negative square root with the backend's error envelope.
import { ApiError, type Operation } from '../api/client'

export const FAKE_REQUEST_ID = '3f9c2a7d41e84b0c9a5d6e1f2b3c4d5e'

function round(value: number): number {
  return Number(value.toPrecision(12))
}

export function compute(operation: Operation, a: number, b = 0): number {
  switch (operation) {
    case 'add':
      return round(a + b)
    case 'subtract':
      return round(a - b)
    case 'multiply':
      return round(a * b)
    case 'divide':
      if (b === 0)
        throw new ApiError('DIVISION_BY_ZERO', 'Cannot divide by zero.', 422, FAKE_REQUEST_ID)
      return round(a / b)
    case 'power':
      return round(a ** b)
    case 'sqrt':
      if (a < 0) {
        throw new ApiError(
          'NEGATIVE_SQRT',
          'Cannot take the square root of a negative number.',
          422,
          FAKE_REQUEST_ID,
        )
      }
      return round(Math.sqrt(a))
    case 'percent':
      return round((a * b) / 100)
  }
}

/** An async calculate that answers after `delayMs`. */
export function fakeCalculate(delayMs = 0) {
  return (operation: Operation, a: number, b?: number) =>
    new Promise<number>((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(compute(operation, a, b))
        } catch (error) {
          reject(error)
        }
      }, delayMs)
    })
}
