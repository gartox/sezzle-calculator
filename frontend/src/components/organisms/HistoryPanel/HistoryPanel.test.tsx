import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import HistoryPanel from './HistoryPanel'

describe('HistoryPanel', () => {
  it('lists entries newest first and reuses the chosen result', async () => {
    const onSelect = vi.fn()
    render(
      <HistoryPanel
        entries={[
          { expression: '15 % of 200 =', result: '30' },
          { expression: '5 × 4 =', result: '20' },
        ]}
        onSelect={onSelect}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('15 % of 200 =')
    await userEvent.click(screen.getByRole('button', { name: /use 5 × 4 = 20/i }))
    expect(onSelect).toHaveBeenCalledWith('20')
  })

  it('says when there is nothing yet and offers Close only as a sheet', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<HistoryPanel entries={[]} onSelect={() => {}} />)
    expect(screen.getByText('No calculations yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close history' })).not.toBeInTheDocument()

    rerender(<HistoryPanel entries={[]} onSelect={() => {}} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close history' }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'History' })).toBeInTheDocument()
  })
})
