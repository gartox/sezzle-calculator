import { useId, useState, type FormEvent } from 'react'
import { ApiError, OPERATIONS, UNARY_OPERATIONS, calculate, type Operation } from '../api/client'
import { validateNumber } from './validateNumber'

interface FieldErrors {
  a?: string
  b?: string
}

function Calculator() {
  const [operation, setOperation] = useState<Operation>('add')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [result, setResult] = useState<number | null>(null)
  const [apiError, setApiError] = useState<{ message: string; requestId?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const id = useId()
  const isUnary = UNARY_OPERATIONS.has(operation)

  function handleOperationChange(next: Operation) {
    setOperation(next)
    if (UNARY_OPERATIONS.has(next)) {
      setFieldErrors((current) => ({ a: current.a }))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    setApiError(null)

    const errors: FieldErrors = { a: validateNumber(a) }
    if (!isUnary) {
      errors.b = validateNumber(b)
    }
    setFieldErrors(errors)
    if (errors.a || errors.b) {
      return
    }

    setIsLoading(true)
    try {
      const value = await calculate(operation, Number(a), isUnary ? undefined : Number(b))
      setResult(value)
    } catch (error) {
      setApiError(
        error instanceof ApiError
          ? { message: error.message, requestId: error.requestId }
          : { message: 'Something went wrong. Please try again.' },
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form className="calculator" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-operation`}>Operation</label>
        <select
          id={`${id}-operation`}
          value={operation}
          onChange={(event) => handleOperationChange(event.target.value as Operation)}
        >
          {OPERATIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={`${id}-a`}>Number a</label>
        <input
          id={`${id}-a`}
          type="number"
          inputMode="decimal"
          step="any"
          value={a}
          onChange={(event) => setA(event.target.value)}
          aria-invalid={fieldErrors.a ? true : undefined}
          aria-describedby={fieldErrors.a ? `${id}-a-error` : undefined}
        />
        {fieldErrors.a && (
          <p className="field-error" id={`${id}-a-error`}>
            {fieldErrors.a}
          </p>
        )}
      </div>

      {!isUnary && (
        <div className="field">
          <label htmlFor={`${id}-b`}>Number b</label>
          <input
            id={`${id}-b`}
            type="number"
            inputMode="decimal"
            step="any"
            value={b}
            onChange={(event) => setB(event.target.value)}
            aria-invalid={fieldErrors.b ? true : undefined}
            aria-describedby={fieldErrors.b ? `${id}-b-error` : undefined}
          />
          {fieldErrors.b && (
            <p className="field-error" id={`${id}-b-error`}>
              {fieldErrors.b}
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Calculating…' : 'Calculate'}
      </button>

      <output className="result" aria-live="polite">
        {result !== null && (
          <>
            <span className="result-label">Result</span>
            <span className="result-value">{String(result)}</span>
          </>
        )}
      </output>

      {apiError && (
        <p className="api-error" role="alert">
          {apiError.message}
          {apiError.requestId && (
            <small className="request-id">Request ID: {apiError.requestId}</small>
          )}
        </p>
      )}
    </form>
  )
}

export default Calculator
