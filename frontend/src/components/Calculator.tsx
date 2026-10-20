import { useId, useState, type FormEvent } from 'react'
import { UNARY_OPERATIONS, type Operation } from '../api/client'
import CalculationResult from './CalculationResult'
import NumberField from './NumberField'
import OperationSelect from './OperationSelect'
import { useCalculation } from './useCalculation'
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
  const { result, error, isLoading, run, reset } = useCalculation()

  const id = useId()
  const isUnary = UNARY_OPERATIONS.has(operation)

  function handleOperationChange(next: Operation) {
    setOperation(next)
    if (UNARY_OPERATIONS.has(next)) {
      setFieldErrors((current) => ({ a: current.a }))
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: FieldErrors = { a: validateNumber(a), b: isUnary ? undefined : validateNumber(b) }
    setFieldErrors(errors)
    if (errors.a || errors.b) {
      reset()
      return
    }
    void run(operation, Number(a), isUnary ? undefined : Number(b))
  }

  return (
    <form className="calculator" onSubmit={handleSubmit} noValidate>
      <OperationSelect id={`${id}-operation`} value={operation} onChange={handleOperationChange} />

      <NumberField
        id={`${id}-a`}
        label="Number a"
        value={a}
        onChange={setA}
        error={fieldErrors.a}
      />
      {!isUnary && (
        <NumberField
          id={`${id}-b`}
          label="Number b"
          value={b}
          onChange={setB}
          error={fieldErrors.b}
        />
      )}

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Calculating…' : 'Calculate'}
      </button>

      <CalculationResult result={result} error={error} />
    </form>
  )
}

export default Calculator
