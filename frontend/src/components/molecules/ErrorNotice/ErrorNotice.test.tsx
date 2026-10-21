import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ErrorNotice from './ErrorNotice'

const ID = '3f9c2a7d41e84b0c9a5d6e1f2b3c4d5e'

describe('ErrorNotice', () => {
  it('announces the message as an alert with a short Ref', () => {
    render(<ErrorNotice message="Cannot divide by zero." requestId={ID} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Cannot divide by zero.')
    expect(alert).toHaveTextContent('Ref 3f9c2a7d')
    expect(alert).not.toHaveTextContent(ID)
  })

  it('keeps the whole ID in the accessible name and copies it on click and Enter', async () => {
    const writeClipboard = vi.fn(async () => {})
    render(
      <ErrorNotice
        message="Cannot divide by zero."
        requestId={ID}
        writeClipboard={writeClipboard}
      />,
    )

    const ref = screen.getByRole('button', { name: `Ref 3f9c2a7d, full ID ${ID}, copy` })
    await userEvent.click(ref)
    ref.focus()
    await userEvent.keyboard('{Enter}')

    expect(writeClipboard).toHaveBeenCalledTimes(2)
    expect(writeClipboard).toHaveBeenCalledWith(ID)
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Copied')
  })

  it('omits the Ref when there is no request ID', () => {
    render(<ErrorNotice message="Could not reach the calculator service." />)
    expect(screen.getByRole('alert')).not.toHaveTextContent('Ref')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
