import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusPill from './StatusPill'

describe('StatusPill', () => {
  it.each([
    ['ready', 'Ready'],
    ['offline', 'Offline'],
    ['checking', 'Checking'],
  ] as const)('%s reads "%s" in a status region', (status, label) => {
    render(<StatusPill status={status} />)
    const pill = screen.getByRole('status')
    expect(pill).toHaveTextContent(label)
    expect(pill.querySelector('[aria-hidden="true"]')).toHaveAttribute('data-tone', status)
  })
})
