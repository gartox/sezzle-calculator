import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NumberField from './NumberField'

describe('NumberField', () => {
  it('links the label to the input and reports typed values', async () => {
    const onChange = vi.fn()
    render(<NumberField id="x" label="Number a" value="" onChange={onChange} />)

    const input = screen.getByLabelText('Number a')
    await userEvent.type(input, '7')

    expect(onChange).toHaveBeenCalledWith('7')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('marks the input invalid and points it at the error message', () => {
    render(
      <NumberField id="x" label="Number a" value="" onChange={() => {}} error="Enter a number." />,
    )

    const input = screen.getByLabelText('Number a')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a number.')
  })
})
