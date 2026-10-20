import { useState } from 'react'
import { ApiError, calculate, type Operation } from '../api/client'

export interface CalculationError {
  message: string
  requestId?: string
}

/**
 * Runs calculations against the API and tracks the latest outcome. Starting a
 * new run clears the previous result and error.
 */
export function useCalculation() {
  const [result, setResult] = useState<number | null>(null)
  const [error, setError] = useState<CalculationError | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  function reset() {
    setResult(null)
    setError(null)
  }

  async function run(operation: Operation, a: number, b?: number) {
    reset()
    setIsLoading(true)
    try {
      setResult(await calculate(operation, a, b))
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? { message: caught.message, requestId: caught.requestId }
          : { message: 'Something went wrong. Please try again.' },
      )
    } finally {
      setIsLoading(false)
    }
  }

  return { result, error, isLoading, run, reset }
}
