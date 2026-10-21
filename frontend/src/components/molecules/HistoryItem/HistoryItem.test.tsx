import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import HistoryItem from './HistoryItem'

describe('HistoryItem', () => {
  it('is named by its content and hands back the raw result', async () => {
    const onSelect = vi.fn()
    render(<HistoryItem expression="123,456 × 1,000 =" result="123456000" onSelect={onSelect} />)

    const item = screen.getByRole('button', { name: 'Use 123,456 × 1,000 = 123,456,000' })
    await userEvent.click(item)

    expect(onSelect).toHaveBeenCalledWith('123456000')
  })
})
