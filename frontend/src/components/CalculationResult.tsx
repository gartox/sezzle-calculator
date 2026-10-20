import type { CalculationError } from './useCalculation'

interface CalculationResultProps {
  result: number | null
  error: CalculationError | null
}

/**
 * The result region, announced politely to screen readers, and the error
 * alert with the request ID in small print when the server sent one.
 */
function CalculationResult({ result, error }: CalculationResultProps) {
  return (
    <>
      <output className="result" aria-live="polite">
        {result !== null && (
          <>
            <span className="result-label">Result</span>
            <span className="result-value">{String(result)}</span>
          </>
        )}
      </output>

      {error && (
        <p className="api-error" role="alert">
          {error.message}
          {error.requestId && <small className="request-id">Request ID: {error.requestId}</small>}
        </p>
      )}
    </>
  )
}

export default CalculationResult
