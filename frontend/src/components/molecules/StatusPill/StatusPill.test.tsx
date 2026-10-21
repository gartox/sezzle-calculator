import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusPill from './StatusPill'

describe('StatusPill', () => {
  it.each([
    ['ready', 'Ready'],
    ['offline', 'Offline'],
    ['checking', 'Checking'],
  ] as const)('%s reads "%s" with a matching dot', (status, label) => {
    render(<StatusPill status={status} />)
    const pill = screen.getByText(label)
    expect(pill.querySelector('[aria-hidden="true"]')).toHaveAttribute('data-tone', status)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('announces only the change to Offline', () => {
    const { container, rerender } = render(<StatusPill status="checking" />)
    const region = container.querySelector('[aria-live="polite"]')
    expect(region).toHaveTextContent('')
    rerender(<StatusPill status="ready" />)
    expect(region).toHaveTextContent('')
    rerender(<StatusPill status="offline" />)
    expect(region).toHaveTextContent('The calculator service is offline.')
  })
})
