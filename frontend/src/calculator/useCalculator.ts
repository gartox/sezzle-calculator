import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ApiError, type Operation } from '../api/client'
import type { HistoryEntry } from './history'
import {
  type CalculationError,
  type KeypadAction,
  historyEntryFor,
  initialKeypadState,
  keypadReducer,
} from './keypad'

/** The busy state appears only for answers slower than this, to avoid flicker. */
export const BUSY_DELAY_MS = 300

export type CalculateFn = (operation: Operation, a: number, b?: number) => Promise<number>

interface Options {
  calculate: CalculateFn
  /** Called with each completed calculation, for the history. */
  onResult?: (entry: HistoryEntry) => void
  /** Called when the API could not be reached, to re-check its health. */
  onNetworkError?: () => void
  /** Formats operands in history expressions. */
  format?: (raw: string) => string
}

function toCalculationError(error: unknown): CalculationError {
  if (error instanceof ApiError) {
    return { message: error.message, requestId: error.requestId, code: error.code }
  }
  return { message: 'Something went wrong. Please try again.' }
}

/**
 * Runs the keypad reducer and the API calls it asks for. Answers that arrive
 * after the component is gone are ignored.
 */
export function useCalculator({ calculate, onResult, onNetworkError, format }: Options) {
  const [state, dispatch] = useReducer(keypadReducer, initialKeypadState)
  const [busy, setBusy] = useState(false)
  const latest = useRef({ calculate, onResult, onNetworkError, format })
  useEffect(() => {
    latest.current = { calculate, onResult, onNetworkError, format }
  })

  const { pending } = state
  const hadOperator = state.operator !== null

  useEffect(() => {
    if (!pending) {
      return
    }
    let active = true
    const busyTimer = setTimeout(() => setBusy(true), BUSY_DELAY_MS)
    const {
      calculate: send,
      onResult: report,
      onNetworkError: offline,
      format: fmt,
    } = latest.current
    send(pending.operation, pending.a, pending.b)
      .then((result) => {
        if (!active) return
        dispatch({ type: 'resolved', result })
        const entry = historyEntryFor(pending, result, hadOperator, fmt)
        if (entry) report?.(entry)
      })
      .catch((error: unknown) => {
        if (!active) return
        const calculationError = toCalculationError(error)
        dispatch({ type: 'failed', error: calculationError })
        if (calculationError.code === 'NETWORK_ERROR') offline?.()
      })
      .finally(() => {
        clearTimeout(busyTimer)
        if (active) setBusy(false)
      })
    return () => {
      active = false
      clearTimeout(busyTimer)
    }
    // A new pending calculation is the only trigger; hadOperator is read as
    // it was when that calculation was created.
  }, [pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const press = useCallback((action: KeypadAction) => dispatch(action), [])

  return { state, busy, press }
}
