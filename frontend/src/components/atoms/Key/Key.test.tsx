import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Key from './Key'

describe('Key', () => {
  it('is a button named by `name` that calls onPress on click and Enter', async () => {
    const onPress = vi.fn()
    render(<Key label="×" name="multiply" variant="operator" onPress={onPress} />)

    const key = screen.getByRole('button', { name: 'multiply' })
    expect(key).toHaveAttribute('type', 'button')
    await userEvent.click(key)
    key.focus()
    await userEvent.keyboard('{Enter}')

    expect(onPress).toHaveBeenCalledTimes(2)
    expect(key).toHaveAttribute('data-variant', 'operator')
  })

  it('sets aria-pressed only when it toggles', () => {
    const { rerender } = render(<Key label="7" name="7" />)
    expect(screen.getByRole('button', { name: '7' })).not.toHaveAttribute('aria-pressed')

    rerender(<Key label="×" name="multiply" variant="operator" active={false} />)
    expect(screen.getByRole('button', { name: 'multiply' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    rerender(<Key label="×" name="multiply" variant="operator" active />)
    expect(screen.getByRole('button', { name: 'multiply', pressed: true })).toBeInTheDocument()
  })

  it('shows a spinner, keeps its name and ignores presses while busy', async () => {
    const onPress = vi.fn()
    render(<Key label="=" name="equals" variant="equals" busy onPress={onPress} />)

    const key = screen.getByRole('button', { name: 'equals' })
    expect(key).toHaveAttribute('aria-busy', 'true')
    expect(key).not.toHaveTextContent('=')
    await userEvent.click(key)

    expect(onPress).not.toHaveBeenCalled()
  })

  it('ignores presses while inactive and says so with aria-disabled', async () => {
    const onPress = vi.fn()
    render(<Key label="=" name="equals" variant="equals" inactive onPress={onPress} />)

    const key = screen.getByRole('button', { name: 'equals' })
    expect(key).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(key)

    expect(onPress).not.toHaveBeenCalled()
  })

  it('marks the keyboard pressed state and passes button props through', () => {
    render(<Key label="8" name="8" pressed disabled className="extra" />)

    const key = screen.getByRole('button', { name: '8' })
    expect(key).toHaveAttribute('data-pressed', 'true')
    expect(key).toBeDisabled()
    expect(key).toHaveClass('extra')
  })

  it('works without onPress', async () => {
    render(<Key label="1" name="1" />)
    await userEvent.click(screen.getByRole('button', { name: '1' }))
  })
})
