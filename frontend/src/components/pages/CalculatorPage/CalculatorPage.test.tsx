import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type Operation } from '../../../api/client'
import { HISTORY_KEY } from '../../../calculator/history'
import { compute, fakeCalculate } from '../../../test/fakeApi'
import { memoryStorage } from '../../../test/memoryStorage'
import CalculatorPage from './CalculatorPage'

afterEach(() => {
  vi.useRealTimers()
  window.sessionStorage.clear()
})

function setup(props: Partial<Parameters<typeof CalculatorPage>[0]> = {}) {
  const calculate = vi.fn(fakeCalculate())
  const checkHealth = vi.fn(async () => true)
  const storage = memoryStorage()
  const user = userEvent.setup()
  const view = render(
    <CalculatorPage calculate={calculate} checkHealth={checkHealth} storage={storage} {...props} />,
  )
  const key = (name: string) => screen.getByRole('button', { name })
  const press = async (...names: string[]) => {
    for (const name of names) await user.click(key(name))
  }
  const display = () => screen.getByRole('group', { name: 'Display' })
  return { calculate, checkHealth, storage, user, key, press, display, ...view }
}

describe('CalculatorPage', () => {
  it('shows the API status from the health check', async () => {
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('Checking')
    expect(await screen.findByText('Ready')).toBeInTheDocument()
  })

  it('shows Offline when the health check fails', async () => {
    setup({ checkHealth: async () => false })
    expect(await screen.findByText('Offline')).toBeInTheDocument()
  })

  it('calculates 15 % of 200 by clicking and records it in the history', async () => {
    const { press, display, calculate, storage, key } = setup()
    expect(key('equals')).toHaveAttribute('aria-disabled', 'true')

    await press('1', '5', 'percent of')
    expect(key('percent of')).toHaveAttribute('aria-pressed', 'true')
    await press('2', '0', '0')
    expect(display()).toHaveTextContent('15 % of 200')
    expect(key('equals')).not.toHaveAttribute('aria-disabled')
    await press('equals')

    expect(await screen.findByRole('button', { name: '30, copy' })).toBeInTheDocument()
    expect(calculate).toHaveBeenCalledWith('percent', 15, 200)
    expect(display()).toHaveTextContent('15 % of 200 =')
    const announcements = display().querySelectorAll('[aria-live="polite"]')
    expect(announcements[announcements.length - 1]).toHaveTextContent('30')
    expect(screen.getByRole('button', { name: /use 15 % of 200 = 30/i })).toBeInTheDocument()
    await waitFor(() =>
      expect(storage.read()).toEqual([{ expression: '15 % of 200 =', result: '30' }]),
    )
  })

  it('chains left to right with two API calls in order, showing the intermediate result', async () => {
    const { press, calculate, key } = setup()
    await press('2', 'add', '3', 'multiply')
    expect(await screen.findByRole('button', { name: '5, copy' })).toBeInTheDocument()
    expect(key('multiply')).toHaveAttribute('aria-pressed', 'true')
    await press('4', 'equals')
    expect(await screen.findByRole('button', { name: '20, copy' })).toBeInTheDocument()
    expect(calculate.mock.calls).toEqual([
      ['add', 2, 3],
      ['multiply', 5, 4],
    ])
  })

  it('sends only a for the square root', async () => {
    const { press, calculate, display } = setup()
    await press('1', '6', 'square root of x')
    expect(await screen.findByRole('button', { name: '4, copy' })).toBeInTheDocument()
    expect(calculate.mock.calls[0]).toEqual(['sqrt', 16, undefined])
    expect(display()).toHaveTextContent('√16 =')
  })

  it('works from the keyboard alone and flashes the typed keys', async () => {
    const { user, key, calculate } = setup()
    await user.keyboard('7')
    expect(key('7')).toHaveAttribute('data-pressed', 'true')
    await user.keyboard('*6{Enter}')
    expect(await screen.findByRole('button', { name: '42, copy' })).toBeInTheDocument()
    expect(calculate).toHaveBeenCalledWith('multiply', 7, 6)
    await waitFor(() => expect(key('7')).not.toHaveAttribute('data-pressed'))

    await user.keyboard('{Backspace}r')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '0, copy' })).toBeInTheDocument()
  })

  it('lets Enter on a focused key press that key, once', async () => {
    const { user, key, calculate } = setup()
    key('7').focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '7, copy' })).toBeInTheDocument()
    expect(calculate).not.toHaveBeenCalled()
  })

  it('ignores keys with modifiers, keys it does not use and typing in inputs', async () => {
    const { user } = setup()
    await user.keyboard('{Control>}1{/Control}a')
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: '5' })
    input.remove()
    expect(screen.getByRole('button', { name: '0, copy' })).toBeInTheDocument()
  })

  it('shows the backend error with its Ref, keeps the expression and recovers on the next key', async () => {
    const { press, display } = setup()
    await press('1', 'divide', '0', 'equals')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Cannot divide by zero.')
    expect(within(alert).getByRole('button', { name: /^Ref 3f9c2a7d/ })).toBeInTheDocument()
    expect(display()).toHaveTextContent('1 ÷ 0 =')

    await press('7')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7, copy' })).toBeInTheDocument()
  })

  it('shows a generic message for an unexpected failure', async () => {
    const { press } = setup({ calculate: async () => Promise.reject(new Error('boom')) })
    await press('1', 'add', '1', 'equals')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
  })

  it('re-checks the API health after a network error', async () => {
    const checkHealth = vi.fn(async () => true)
    const calculate = async () => {
      checkHealth.mockResolvedValue(false)
      throw new ApiError('NETWORK_ERROR', 'Could not reach the calculator service.', 0)
    }
    const { press } = setup({ calculate, checkHealth })
    await screen.findByText('Ready')
    await press('1', 'add', '1', 'equals')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the calculator service.',
    )
    expect(await screen.findByText('Offline')).toBeInTheDocument()
    expect(checkHealth).toHaveBeenCalledTimes(2)
  })

  it('shows the busy state only when an answer takes longer than 300 ms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let answer: (value: number) => void = () => {}
    const calculate = vi.fn(() => new Promise<number>((resolve) => (answer = resolve)))
    const { key, display } = setup({ calculate })
    for (const name of ['2', 'xy, power', '1', '0', 'equals']) {
      fireEvent.click(key(name))
    }
    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(key('equals')).not.toHaveAttribute('aria-busy')
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(key('equals')).toHaveAttribute('aria-busy', 'true')
    expect(display()).toHaveAttribute('aria-busy', 'true')

    // The busy state clears in a finally handler a few microtasks after the
    // answer, so wait for it with real timers.
    vi.useRealTimers()
    act(() => answer(1024))
    expect(await screen.findByRole('button', { name: '1,024, copy' })).toBeInTheDocument()
    await waitFor(() => expect(key('equals')).not.toHaveAttribute('aria-busy'))
  })

  it('reuses a history result and closes the phone sheet', async () => {
    const storage = memoryStorage([{ expression: '15 % of 200 =', result: '30' }])
    const { user, key, press } = setup({ storage })
    await press('History')
    expect(key('History')).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: /use 15 % of 200 = 30/i }))
    expect(screen.getByRole('button', { name: '30, copy' })).toBeInTheDocument()
    expect(key('History')).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the history sheet with Escape, Close or the backdrop, without clearing', async () => {
    const { user, key, press, container } = setup()
    await press('5', 'History')
    await user.keyboard('{Escape}')
    expect(key('History')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: '5, copy' })).toBeInTheDocument()

    await press('History', 'Close history')
    expect(key('History')).toHaveAttribute('aria-expanded', 'false')

    await press('History')
    fireEvent.click(container.querySelector('[aria-hidden="true"][class*="backdrop"]') as Element)
    expect(key('History')).toHaveAttribute('aria-expanded', 'false')
  })

  it('ignores answers that arrive after it is gone', async () => {
    let answer: (value: number) => void = () => {}
    let fail: (error: unknown) => void = () => {}
    const calls: Operation[] = []
    const calculate = (operation: Operation) =>
      new Promise<number>((resolve, reject) => {
        calls.push(operation)
        answer = resolve
        fail = reject
      })
    const first = setup({ calculate })
    await first.press('1', 'add', '1', 'equals')
    first.unmount()
    await act(async () => answer(2))

    const second = setup({ calculate })
    await second.press('1', 'divide', '0', 'equals')
    second.unmount()
    await act(async () => fail(new Error('late')))
    expect(calls).toEqual(['add', 'divide'])
  })

  it('handles a key sent to the window itself and stops the flash when it goes away', async () => {
    const { key, unmount } = setup()
    fireEvent.keyDown(window, { key: '5' })
    expect(key('5')).toHaveAttribute('data-pressed', 'true')
    expect(screen.getByRole('button', { name: '5, copy' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '6' })
    expect(key('6')).toHaveAttribute('data-pressed', 'true')
    expect(key('5')).not.toHaveAttribute('data-pressed')
    await waitFor(() => expect(key('6')).not.toHaveAttribute('data-pressed'))
    fireEvent.keyDown(window, { key: '7' })
    unmount()
  })

  it('keeps the history in sessionStorage by default', async () => {
    window.sessionStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ expression: '1 + 1 =', result: '2' }]),
    )
    render(<CalculatorPage calculate={fakeCalculate()} checkHealth={async () => true} />)
    expect(screen.getByRole('button', { name: /use 1 \+ 1 = 2/i })).toBeInTheDocument()
    expect(compute('add', 1, 1)).toBe(2)
  })
})
