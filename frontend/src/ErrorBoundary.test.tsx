import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Broken(): never {
  throw new Error('render failed')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders its children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>calculator</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('calculator')).toBeInTheDocument()
  })

  it('shows a message and a reload button instead of a blank page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    render(
      <ErrorBoundary reload={reload}>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('the calculator stopped')
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalled()
  })

  it('reloads the page by default', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
