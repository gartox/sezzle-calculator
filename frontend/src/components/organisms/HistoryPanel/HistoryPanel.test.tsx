import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import HistoryPanel from './HistoryPanel'

describe('HistoryPanel', () => {
  it('lists entries newest first and reuses the chosen result', async () => {
    const onSelect = vi.fn()
    render(
      <HistoryPanel
        entries={[
          { id: 'a', expression: '15 % of 200 =', result: '30' },
          { id: 'b', expression: '2 + 3 × 4 =', result: '20' },
        ]}
        onSelect={onSelect}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('15 % of 200 =')
    await userEvent.click(screen.getByRole('button', { name: /use 2 \+ 3 × 4 = 20/i }))
    expect(onSelect).toHaveBeenCalledWith('20')
  })

  it('is a plain group beside the calculator, without Close', () => {
    render(<HistoryPanel entries={[]} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('No calculations yet.')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'History' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close history' })).not.toBeInTheDocument()
  })

  it('is a modal dialog as a sheet, takes focus and offers Close', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<HistoryPanel entries={[]} onSelect={() => {}} />)
    rerender(<HistoryPanel entries={[]} onSelect={() => {}} modal onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'History' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'History' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Close history' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup()
    render(
      <HistoryPanel
        entries={[{ id: 'a', expression: '1 + 1 =', result: '2' }]}
        onSelect={() => {}}
        modal
        onClose={() => {}}
      />,
    )
    const close = screen.getByRole('button', { name: 'Close history' })
    const entry = screen.getByRole('button', { name: /use 1 \+ 1 = 2/i })

    await user.tab()
    expect(close).toHaveFocus()
    await user.tab()
    expect(entry).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(entry).toHaveFocus()

    screen.getByRole('heading', { name: 'History' }).focus()
    await user.tab({ shift: true })
    expect(entry).toHaveFocus()
  })

  it('keeps focus on the heading when the dialog has nothing to focus', () => {
    render(<HistoryPanel entries={[]} onSelect={() => {}} modal />)
    const heading = screen.getByRole('heading', { name: 'History' })
    expect(fireEvent.keyDown(heading, { key: 'Tab' })).toBe(false)
    expect(heading).toHaveFocus()
  })

  it('leaves Tab alone beside the calculator', () => {
    render(<HistoryPanel entries={[]} onSelect={() => {}} />)
    expect(fireEvent.keyDown(screen.getByRole('group'), { key: 'Tab' })).toBe(true)
  })
})
