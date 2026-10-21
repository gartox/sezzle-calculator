import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ApiError, type Operation } from '../api/client'
import {
  type CalculationError,
  type HistoryRecord,
  type KeypadAction,
  initialKeypadState,
  keypadReducer,
} from './keypad'

/** The busy state appears only for answers slower than this, to avoid flicker. */
export const BUSY_DELAY_MS = 300

/** A calculation not answered within this time fails with a message instead of hanging. */
export const REQUEST_TIMEOUT_MS = 8000

export const TIMEOUT_ERROR: CalculationError = {
  message: 'The calculator did not answer.',
  code: 'TIMEOUT',
}

export type CalculateFn = (
  operation: Operation,
  a: number,
  b?: number,
  signal?: AbortSignal,
) => Promise<number>

interface Options {
  calculate: CalculateFn
  /** Called with each completed calculation, for the history. */
  onResult?: (record: HistoryRecord) => void
  /** Called when a calculation succeeds, to clear an Offline status. */
  onSuccess?: () => void
  /** Called when the API could not be reached, to re-check its health. */
  onNetworkError?: () => void
}

function toCalculationError(error: unknown): CalculationError {
  if (error instanceof ApiError) {
    return { message: error.message, requestId: error.requestId, code: error.code }
  }
  return { message: 'Something went wrong.' }
}

/**
 * Runs the keypad reducer and the API calls it asks for. A request is
 * cancelled when the keypad no longer waits for it (AC, or the component
 * going away) and fails after REQUEST_TIMEOUT_MS; late answers are ignored.
 */
export function useCalculator({ calculate, onResult, onSuccess, onNetworkError }: Options) {
  const [state, dispatch] = useReducer(keypadReducer, initialKeypadState)
  const [busy, setBusy] = useState(false)
  const latest = useRef({ calculate, onResult, onSuccess, onNetworkError })
  useEffect(() => {
    latest.current = { calculate, onResult, onSuccess, onNetworkError }
  })

  const { pending, record } = state

  useEffect(() => {
    if (!pending) {
      return
    }
    let active = true
    const controller = new AbortController()
    const { calculate: send, onSuccess: reachable, onNetworkError: offline } = latest.current
    const fail = (error: CalculationError) => {
      dispatch({ type: 'failed', error })
      if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') offline?.()
    }
    const busyTimer = setTimeout(() => setBusy(true), BUSY_DELAY_MS)
    const timeout = setTimeout(() => {
      active = false
      controller.abort()
      fail(TIMEOUT_ERROR)
    }, REQUEST_TIMEOUT_MS)

    send(pending.operation, pending.a, pending.b, controller.signal).then(
      (result) => {
        if (!active) return
        dispatch({ type: 'resolved', result })
        reachable?.()
      },
      (error: unknown) => {
        if (!active) return
        fail(toCalculationError(error))
      },
    )
    return () => {
      active = false
      clearTimeout(busyTimer)
      clearTimeout(timeout)
      controller.abort()
      setBusy(false)
    }
  }, [pending])

  useEffect(() => {
    if (record) latest.current.onResult?.(record)
  }, [record])

  const press = useCallback((action: KeypadAction) => dispatch(action), [])

  return { state, busy, press }
}
