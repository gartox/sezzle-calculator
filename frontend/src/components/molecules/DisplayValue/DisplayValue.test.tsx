import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DisplayValue from './DisplayValue'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('DisplayValue', () => {
  it('shows the grouped value and sizes it by its width in digits', () => {
    render(<DisplayValue value="1234567.5" />)
    const value = screen.getByRole('button', { name: '1,234,567.5, copy' })
    expect(value).toHaveTextContent('1,234,567.5')
    expect(value.style.getPropertyValue('--chars')).toBe('9.5')
  })

  it('copies the raw value, confirms it and announces it politely', async () => {
    const writeClipboard = vi.fn(async () => {})
    render(<DisplayValue value="1234.5" writeClipboard={writeClipboard} />)

    await userEvent.click(screen.getByRole('button', { name: '1,234.5, copy' }))

    expect(writeClipboard).toHaveBeenCalledWith('1234.5')
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).toHaveTextContent('Copied')
  })

  it('hides the confirmation after the feedback time', async () => {
    // Only the component's timer is faked and advanced by hand, so real time
    // on a busy machine cannot expire the confirmation before the assertion.
    // The click is dispatched directly: user-event's own delays would wait on
    // the faked clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<DisplayValue value="7" writeClipboard={async () => {}} feedbackMs={500} />)
    const live = () => document.querySelector('[aria-live="polite"]')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '7, copy' }))
    })
    expect(live()).toHaveTextContent('Copied')

    await act(async () => {
      vi.advanceTimersByTime(499)
    })
    expect(live()).toHaveTextContent('Copied')

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(live()).toHaveTextContent('')
  })

  it('says so when the clipboard refuses', async () => {
    render(<DisplayValue value="30" writeClipboard={() => Promise.reject(new Error('denied'))} />)
    await userEvent.click(screen.getByRole('button', { name: '30, copy' }))
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Copy failed')
  })

  it('uses the browser clipboard by default and fails cleanly without one', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { unmount } = render(<DisplayValue value="5" />)
    await userEvent.click(screen.getByRole('button', { name: '5, copy' }))
    expect(writeText).toHaveBeenCalledWith('5')
    unmount()

    vi.stubGlobal('navigator', {})
    render(<DisplayValue value="6" />)
    await userEvent.click(screen.getByRole('button', { name: '6, copy' }))
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Copy failed')
  })

  it('shows text such as Error without offering to copy it', () => {
    render(<DisplayValue value="Error" />)
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
