import { OPERATIONS, type Operation } from '../api/client'

interface OperationSelectProps {
  id: string
  value: Operation
  onChange: (operation: Operation) => void
}

/** The labeled list of operations, in the order the API client defines. */
function OperationSelect({ id, value, onChange }: OperationSelectProps) {
  return (
    <div className="field">
      <label htmlFor={id}>Operation</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as Operation)}>
        {OPERATIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default OperationSelect
