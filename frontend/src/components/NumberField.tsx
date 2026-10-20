interface NumberFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}

/** A labeled number input with its inline validation message. */
function NumberField({ id, label, value, onChange, error }: NumberFieldProps) {
  const errorId = `${id}-error`
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}

export default NumberField
