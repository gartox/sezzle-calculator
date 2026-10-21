import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Keypad from './Keypad'

const NAMES = [
  'square root of x',
  'xy, power',
  'History',
  'AC, all clear',
  'toggle sign',
  'percent of',
  'divide',
  '7',
  '8',
  '9',
  'multiply',
  '4',
  '5',
  '6',
  'subtract',
  '1',
  '2',
  '3',
  'add',
  '0',
  'decimal point',
  'backspace',
  'equals',
]

describe('Keypad', () => {
  it('has every key as a named button in order', () => {
    render(<Keypad onPress={() => {}} />)
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(NAMES)
  })

  it('reports the action of each key', async () => {
    const onPress = vi.fn()
    render(<Keypad onPress={onPress} equals="ready" />)
    for (const name of [
      '7',
      'decimal point',
      'toggle sign',
      'backspace',
      'AC, all clear',
      'percent of',
      'xy, power',
      'equals',
    ]) {
      await userEvent.click(screen.getByRole('button', { name }))
    }
    expect(onPress.mock.calls.map(([action]) => action)).toEqual([
      { type: 'digit', digit: '7' },
      { type: 'decimal' },
      { type: 'toggleSign' },
      { type: 'backspace' },
      { type: 'clear' },
      { type: 'operator', operator: 'percent' },
      { type: 'operator', operator: 'power' },
      { type: 'equals' },
    ])
  })

  it('marks the active operator, flashes a typed key and shows the equals state', () => {
    const { rerender } = render(
      <Keypad onPress={() => {}} activeOperator="multiply" pressedKey="digit-7" />,
    )
    expect(screen.getByRole('button', { name: 'multiply' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'divide' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '7' })).toHaveAttribute('data-pressed', 'true')
    expect(screen.getByRole('button', { name: 'equals' })).toHaveAttribute('aria-disabled', 'true')

    rerender(<Keypad onPress={() => {}} equals="busy" pressedKey="equals" />)
    const equals = screen.getByRole('button', { name: 'equals' })
    expect(equals).toHaveAttribute('aria-busy', 'true')
    expect(equals).toHaveAttribute('data-pressed', 'true')
  })

  it('toggles the history panel it controls', async () => {
    const onToggleHistory = vi.fn()
    render(
      <Keypad onPress={() => {}} onToggleHistory={onToggleHistory} historyOpen historyId="h" />,
    )
    const toggle = screen.getByRole('button', { name: 'History' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', 'h')
    await userEvent.click(toggle)
    expect(onToggleHistory).toHaveBeenCalled()
  })
})
