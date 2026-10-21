import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// The page is replaced by one that fails to render, to pin the error
// boundary's place in App.
vi.mock('./components/pages/CalculatorPage/CalculatorPage', () => ({
  default: () => {
    throw new Error('render failed')
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('shows the reload message when the page fails to render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<App />)
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('alert'))
    expect(screen.getByRole('alert')).toHaveTextContent('the calculator stopped')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})
