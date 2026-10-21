import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Display from './Display'

describe('Display', () => {
  it('shows the expression and the formatted value, and announces results', () => {
    render(<Display expression="15 % of 200 =" value="30" announcement="30" />)
    const display = screen.getByRole('group', { name: 'Display' })
    expect(display).toHaveTextContent('15 % of 200 =')
    expect(screen.getByRole('button', { name: '30, copy' })).toBeInTheDocument()
    // The last polite region is the result announcement; the value has its own for copying.
    const regions = display.querySelectorAll('[aria-live="polite"]')
    expect(regions[regions.length - 1]).toHaveTextContent('30')
    expect(display).not.toHaveAttribute('aria-busy')
  })

  it('replaces the value with the error and keeps the expression', () => {
    render(
      <Display
        expression="1 ÷ 0 ="
        value="0"
        error={{ message: 'Cannot divide by zero.', requestId: 'abcdef1234' }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot divide by zero.')
    expect(screen.getByRole('group', { name: 'Display' })).toHaveTextContent('1 ÷ 0 =')
    expect(screen.queryByRole('button', { name: '0, copy' })).not.toBeInTheDocument()
  })

  it('reports a slow calculation with aria-busy', () => {
    render(<Display expression="2 ^ 10 =" value="10" busy />)
    expect(screen.getByRole('group', { name: 'Display' })).toHaveAttribute('aria-busy', 'true')
  })
})
