import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ErrorNotice from './ErrorNotice'

describe('ErrorNotice', () => {
  it('announces the message as an alert with the Ref', () => {
    render(<ErrorNotice message="Cannot divide by zero." requestId="req-7" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Cannot divide by zero.')
    expect(alert).toHaveTextContent('Ref req-7')
  })

  it('omits the Ref when there is no request ID', () => {
    render(<ErrorNotice message="Could not reach the calculator service." />)
    expect(screen.getByRole('alert')).not.toHaveTextContent('Ref')
  })
})
