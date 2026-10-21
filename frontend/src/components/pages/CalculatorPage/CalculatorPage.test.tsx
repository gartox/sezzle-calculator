import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type Operation } from '../../../api/client'
import { HISTORY_KEY } from '../../../calculator/history'
import { REQUEST_TIMEOUT_MS } from '../../../calculator/useCalculator'
import { compute, fakeCalculate } from '../../../test/fakeApi'
import { memoryStorage } from '../../../test/memoryStorage'
import CalculatorPage from './CalculatorPage'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
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
  const announced = () => {
    const regions = display().querySelectorAll('[aria-live="polite"]')
    return regions[regions.length - 1].textContent?.trim()
  }
  return { calculate, checkHealth, storage, user, key, press, display, announced, ...view }
}

/** A calculate that never answers until told to, and records its abort signals. */
function hangingCalculate() {
  const signals: AbortSignal[] = []
  const calls: Array<[Operation, number, number | undefined]> = []
  const calculate = vi.fn(
    (operation: Operation, a: number, b?: number, signal?: AbortSignal) =>
      new Promise<number>(() => {
        calls.push([operation, a, b])
        if (signal) signals.push(signal)
      }),
  )
  return { calculate, signals, calls }
}

/** Stubs matchMedia so the wide layout query matches or not, and can change. */
function stubWideScreen(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return matches
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  )
  return (next: boolean) => {
    matches = next
    act(() => listeners.forEach((listener) => listener()))
  }
}

describe('CalculatorPage', () => {
  describe('status', () => {
    it('shows the API status from the health check, without a live region on load', async () => {
      setup()
      expect(screen.getByText('Checking')).toBeInTheDocument()
      expect(await screen.findByText('Ready')).toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('shows Offline when the health check fails', async () => {
      setup({ checkHealth: async () => false })
      expect(await screen.findByText('Offline')).toBeInTheDocument()
    })

    it('re-checks after a network error, and again once a calculation succeeds', async () => {
      const checkHealth = vi.fn(async () => true)
      let online = true
      const calculate = vi.fn(async (operation: Operation, a: number, b?: number) => {
        if (!online) {
          throw new ApiError('NETWORK_ERROR', 'Could not reach the calculator service.', 0)
        }
        return compute(operation, a, b)
      })
      const { press } = setup({ calculate, checkHealth })
      await screen.findByText('Ready')

      online = false
      checkHealth.mockResolvedValue(false)
      await press('1', 'add', '1', 'equals')
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not reach the calculator service.',
      )
      expect(await screen.findByText('Offline')).toBeInTheDocument()

      online = true
      checkHealth.mockResolvedValue(true)
      await press('equals')
      expect(await screen.findByRole('button', { name: '2, copy' })).toBeInTheDocument()
      expect(await screen.findByText('Ready')).toBeInTheDocument()
      expect(checkHealth).toHaveBeenCalledTimes(3)
    })
  })

  describe('calculations', () => {
    it('calculates 15 % of 200 by clicking, announces it and records it', async () => {
      const { press, display, calculate, storage, key, announced } = setup()
      expect(key('equals')).toHaveAttribute('aria-disabled', 'true')

      await press('1', '5', 'percent of')
      expect(key('percent of')).toHaveAttribute('aria-pressed', 'true')
      await press('2', '0', '0')
      expect(display()).toHaveTextContent('15 % of 200')
      expect(key('equals')).not.toHaveAttribute('aria-disabled')
      await press('equals')

      expect(await screen.findByRole('button', { name: '30, copy' })).toBeInTheDocument()
      expect(calculate).toHaveBeenCalledWith('percent', 15, 200, expect.any(AbortSignal))
      expect(display()).toHaveTextContent('15 % of 200 =')
      expect(announced()).toBe('15 percent of 200 equals 30')
      expect(
        await screen.findByRole('button', { name: /use 15 % of 200 = 30/i }),
      ).toBeInTheDocument()
      await waitFor(() =>
        expect(storage.read()).toEqual([{ expression: '15 % of 200 =', result: '30' }]),
      )
    })

    it('chains left to right and records the whole chain in the history', async () => {
      const { press, calculate, key } = setup()
      await press('2', 'add', '3', 'multiply')
      expect(await screen.findByRole('button', { name: '5, copy' })).toBeInTheDocument()
      expect(key('multiply')).toHaveAttribute('aria-pressed', 'true')
      await press('4', 'equals')
      expect(await screen.findByRole('button', { name: '20, copy' })).toBeInTheDocument()
      expect(calculate.mock.calls.map((call) => call.slice(0, 3))).toEqual([
        ['add', 2, 3],
        ['multiply', 5, 4],
      ])
      expect(
        await screen.findByRole('button', { name: /use 2 \+ 3 × 4 = 20/i }),
      ).toBeInTheDocument()
    })

    it('takes a percent inside a chain as a percent of the running total', async () => {
      const { press, calculate, display } = setup()
      await press('2', '0', '0', 'add', '1', '0', 'percent of')
      await waitFor(() => expect(display()).toHaveTextContent('200 + 20'))
      await press('equals')
      expect(await screen.findByRole('button', { name: '220, copy' })).toBeInTheDocument()
      expect(calculate.mock.calls.map((call) => call.slice(0, 3))).toEqual([
        ['percent', 10, 200],
        ['add', 200, 20],
      ])
      expect(
        await screen.findByRole('button', { name: /use 200 \+ 10 % = 220/i }),
      ).toBeInTheDocument()
    })

    it('sends only a for the square root', async () => {
      const { press, calculate, display } = setup()
      await press('1', '6', 'square root of x')
      expect(await screen.findByRole('button', { name: '4, copy' })).toBeInTheDocument()
      expect(calculate.mock.calls[0].slice(0, 3)).toEqual(['sqrt', 16, undefined])
      expect(display()).toHaveTextContent('√16 =')
    })

    it('applies keys pressed during a slow answer, in order', async () => {
      const calculate = vi.fn(fakeCalculate(50))
      const { key } = setup({ calculate })
      for (const name of ['2', 'add', '3', 'multiply', '4', 'equals']) {
        fireEvent.click(key(name))
      }
      expect(await screen.findByRole('button', { name: '20, copy' })).toBeInTheDocument()
      expect(calculate.mock.calls.map((call) => call.slice(0, 3))).toEqual([
        ['add', 2, 3],
        ['multiply', 5, 4],
      ])
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

      await act(async () => answer(1024))
      expect(screen.getByRole('button', { name: '1,024, copy' })).toBeInTheDocument()
      expect(key('equals')).not.toHaveAttribute('aria-busy')
    })
  })

  describe('requests that fail or hang', () => {
    it('shows the backend error with its Ref, keeps the expression and recovers on the next key', async () => {
      const { press, display, key } = setup()
      await press('1', 'divide', '0', 'equals')
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Cannot divide by zero.')
      expect(alert).not.toHaveTextContent('try again')
      expect(within(alert).getByRole('button', { name: /^Ref 3f9c2a7d/ })).toBeInTheDocument()
      expect(display()).toHaveTextContent('1 ÷ 0 =')
      expect(key('equals')).toHaveAttribute('aria-disabled', 'true')

      await press('7')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '7, copy' })).toBeInTheDocument()
    })

    it('offers a retry after an unexpected failure', async () => {
      let fail = true
      const calculate = vi.fn(async (operation: Operation, a: number, b?: number) => {
        if (fail) throw new Error('boom')
        return compute(operation, a, b)
      })
      const { press, key } = setup({ calculate })
      await press('1', 'add', '1', 'equals')
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Something went wrong.')
      expect(alert).toHaveTextContent('Press = to try again.')
      expect(key('equals')).not.toHaveAttribute('aria-disabled')

      fail = false
      await press('equals')
      expect(await screen.findByRole('button', { name: '2, copy' })).toBeInTheDocument()
    })

    it('AC cancels a request that never answers', async () => {
      const { calculate, signals } = hangingCalculate()
      const { press } = setup({ calculate })
      await press('1', 'add', '2', 'equals')
      expect(signals[0].aborted).toBe(false)

      await press('AC, all clear', '9')
      expect(signals[0].aborted).toBe(true)
      expect(screen.getByRole('button', { name: '9, copy' })).toBeInTheDocument()
    })

    it('times out a request that never answers, then equals sends it again', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const { calculate, signals, calls } = hangingCalculate()
      const checkHealth = vi.fn(async () => true)
      const { key } = setup({ calculate, checkHealth })
      for (const name of ['1', 'add', '2', 'equals']) fireEvent.click(key(name))

      await act(async () => {
        vi.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1)
      })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('The calculator did not answer.')
      expect(alert).toHaveTextContent('Press = to try again.')
      expect(signals[0].aborted).toBe(true)
      expect(checkHealth).toHaveBeenCalledTimes(2)

      fireEvent.click(key('equals'))
      expect(calls).toEqual([
        ['add', 1, 2],
        ['add', 1, 2],
      ])
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
  })

  describe('keyboard', () => {
    it('works from the keyboard alone and flashes the typed keys', async () => {
      const { user, key, calculate } = setup()
      await user.keyboard('7')
      expect(key('7')).toHaveAttribute('data-pressed', 'true')
      await user.keyboard('*6{Enter}')
      expect(await screen.findByRole('button', { name: '42, copy' })).toBeInTheDocument()
      expect(calculate.mock.calls[0].slice(0, 3)).toEqual(['multiply', 7, 6])
      await waitFor(() => expect(key('7')).not.toHaveAttribute('data-pressed'))

      await user.keyboard('{Escape}')
      expect(screen.getByRole('button', { name: '0, copy' })).toBeInTheDocument()
    })

    it('takes keys sent to the document right after loading, without a click', async () => {
      setup()
      expect(document.activeElement).toBe(document.body)
      fireEvent.keyDown(document.body, { key: '2' })
      fireEvent.keyDown(document.body, { key: '+' })
      fireEvent.keyDown(document.body, { key: '3' })
      fireEvent.keyDown(document.body, { key: 'Enter' })
      expect(await screen.findByRole('button', { name: '5, copy' })).toBeInTheDocument()
    })

    it('calculates on Enter after the keys were clicked with the mouse', async () => {
      const { user, press, calculate, display } = setup()
      await press('2', 'add', '3')
      await user.keyboard('{Enter}')
      expect(await screen.findByRole('button', { name: '5, copy' })).toBeInTheDocument()
      expect(display()).toHaveTextContent('2 + 3 =')
      expect(calculate).toHaveBeenCalledTimes(1)
    })

    it('calculates on Enter after a click and typed keys', async () => {
      const { user, press } = setup()
      await press('2')
      await user.keyboard('+3*4{Enter}')
      expect(await screen.findByRole('button', { name: '20, copy' })).toBeInTheDocument()
    })

    it('calculates on Enter after a key reached with Tab is then clicked', async () => {
      const { user, press, key } = setup()
      await press('1')
      await user.tab()
      expect(key('2')).toHaveFocus()
      await user.click(key('2'))
      await user.keyboard('+3{Enter}')
      expect(await screen.findByRole('button', { name: '15, copy' })).toBeInTheDocument()
    })

    it('lets Enter press a key that was reached with Tab, once', async () => {
      const { user, press, key, calculate } = setup()
      await press('1')
      await user.tab()
      expect(key('2')).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('button', { name: '12, copy' })).toBeInTheDocument()
      expect(calculate).not.toHaveBeenCalled()
    })
  })

  describe('history sheet on a phone', () => {
    it('is a modal dialog that takes focus and pauses the keypad', async () => {
      const storage = memoryStorage([{ expression: '15 % of 200 =', result: '30' }])
      const { user, key, press, container } = setup({ storage })
      await press('5', 'History')

      const dialog = screen.getByRole('dialog', { name: 'History' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(within(dialog).getByRole('heading', { name: 'History' })).toHaveFocus()
      expect(container.querySelector('[inert]')).toContainElement(
        container.querySelector('[data-key="digit-7"]'),
      )

      await user.keyboard('7')
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(key('History')).toHaveFocus()
      expect(screen.getByRole('button', { name: '5, copy' })).toBeInTheDocument()
    })

    it('returns focus to the toggle from Close, an entry and the backdrop', async () => {
      const storage = memoryStorage([{ expression: '15 % of 200 =', result: '30' }])
      const { user, key, press, container } = setup({ storage })

      await press('History', 'Close history')
      expect(key('History')).toHaveFocus()
      expect(key('History')).toHaveAttribute('aria-expanded', 'false')

      await press('History')
      await user.click(screen.getByRole('button', { name: /use 15 % of 200 = 30/i }))
      expect(key('History')).toHaveFocus()
      expect(screen.getByRole('button', { name: '30, copy' })).toBeInTheDocument()

      await press('History')
      fireEvent.click(container.querySelector('[aria-hidden="true"][class*="backdrop"]') as Element)
      expect(key('History')).toHaveFocus()
    })

    it('is an inline group on a wide screen, and a phone sheet closes when the screen widens', async () => {
      const widen = stubWideScreen(false)
      const { press, key } = setup()
      await press('History')
      expect(screen.getByRole('dialog', { name: 'History' })).toBeInTheDocument()

      widen(true)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'History' })).toBeInTheDocument()
      expect(key('History')).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('button', { name: 'Close history' })).not.toBeInTheDocument()

      widen(false)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('keeps the history in sessionStorage by default', async () => {
    window.sessionStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ expression: '1 + 1 =', result: '2' }]),
    )
    render(<CalculatorPage calculate={fakeCalculate()} checkHealth={async () => true} />)
    expect(screen.getByRole('button', { name: /use 1 \+ 1 = 2/i })).toBeInTheDocument()
  })
})
