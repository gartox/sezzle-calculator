// The calculator keypad as a pure reducer: no React, no network. The page
// dispatches key presses; when the state holds a `pending` calculation the
// page sends it to the API and dispatches `resolved` or `failed`.
//
// Evaluation is left to right, like a basic handheld calculator: pressing an
// operator when an expression is already complete calculates it first, so
// 2 + 3 × 4 = is (2 + 3) × 4 = 20, and the intermediate 5 is shown.

import type { Operation } from '../api/client'

export type BinaryOperator = Exclude<Operation, 'sqrt'>

/** The longest entry, counted in digits, so every typed value stays exact. */
export const MAX_DIGITS = 15

export interface CalculationError {
  message: string
  requestId?: string
  code?: string
}

export interface Calculation {
  operation: Operation
  a: number
  b?: number
}

/** What happens with a result: show it, chain into the next operator, or use it as sqrt's result. */
export type Continuation = 'equals' | 'sqrt' | { chain: BinaryOperator }

export interface PendingCalculation extends Calculation {
  then: Continuation
}

export interface KeypadState {
  /** The current value as text: what is being typed, or the last result. */
  entry: string
  /** The next digit starts a new entry instead of extending this one. */
  fresh: boolean
  /** The left operand, once an operator has been chosen. */
  a: number | null
  operator: BinaryOperator | null
  /** A right operand has been entered since the operator. */
  hasB: boolean
  /** A calculation sent to the API and not answered yet. */
  pending: PendingCalculation | null
  /** The calculation the display shows with "=": the last result or the failed one. */
  last: Calculation | null
  error: CalculationError | null
  /** Text for the polite live region when a result arrives. */
  announcement: string
}

export type KeypadAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'operator'; operator: BinaryOperator }
  | { type: 'sqrt' }
  | { type: 'equals' }
  | { type: 'useValue'; value: string }
  | { type: 'resolved'; result: number }
  | { type: 'failed'; error: CalculationError }

export const initialKeypadState: KeypadState = {
  entry: '0',
  fresh: false,
  a: null,
  operator: null,
  hasB: false,
  pending: null,
  last: null,
  error: null,
  announcement: '',
}

export const OPERATOR_SYMBOLS: Record<BinaryOperator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percent: '% of',
}

export function keypadReducer(state: KeypadState, action: KeypadAction): KeypadState {
  if (action.type === 'resolved') {
    return resolve(state, action.result)
  }
  if (action.type === 'failed') {
    return fail(state, action.error)
  }
  if (state.pending) {
    return state // keys wait for the answer
  }
  switch (action.type) {
    case 'digit':
      return typeDigit(recover(state), action.digit)
    case 'decimal':
      return typeDecimal(recover(state))
    case 'toggleSign':
      return toggleSign(recover(state))
    case 'backspace':
      return backspace(recover(state))
    case 'clear':
      return initialKeypadState
    case 'operator':
      return chooseOperator(recover(state), action.operator)
    case 'sqrt':
      return squareRoot(recover(state))
    case 'equals':
      return equals(state)
    case 'useValue':
      return reuseValue(recover(state), action.value)
  }
}

/** After an error, any key starts over from a clean state. */
function recover(state: KeypadState): KeypadState {
  return state.error ? initialKeypadState : state
}

function countDigits(entry: string): number {
  return entry.replace(/[^0-9]/g, '').length
}

/** Starting an entry after an operator makes it the right operand. */
function startEntry(state: KeypadState, entry: string): KeypadState {
  return { ...state, entry, fresh: false, hasB: state.operator !== null, last: null }
}

function typeDigit(state: KeypadState, digit: string): KeypadState {
  if (state.fresh) {
    return startEntry(state, digit)
  }
  if (countDigits(state.entry) >= MAX_DIGITS) {
    return state
  }
  const entry =
    state.entry === '0' ? digit : state.entry === '-0' ? `-${digit}` : state.entry + digit
  return startEntry(state, entry)
}

function typeDecimal(state: KeypadState): KeypadState {
  if (state.fresh) {
    return startEntry(state, '0.')
  }
  if (state.entry.includes('.')) {
    return state
  }
  return startEntry(state, `${state.entry}.`)
}

function toggleSign(state: KeypadState): KeypadState {
  if (state.fresh && state.operator !== null && !state.hasB) {
    return startEntry(state, '-0') // a negative right operand, as on a handheld
  }
  const entry = state.entry.startsWith('-') ? state.entry.slice(1) : `-${state.entry}`
  return { ...state, entry }
}

function backspace(state: KeypadState): KeypadState {
  if (state.fresh) {
    return state // a result or a carried value is not edited digit by digit
  }
  const entry = state.entry.slice(0, -1)
  return { ...state, entry: entry === '' || entry === '-' ? '0' : entry }
}

function chooseOperator(state: KeypadState, operator: BinaryOperator): KeypadState {
  if (state.operator !== null && state.a !== null) {
    if (!state.hasB) {
      return { ...state, operator } // change of mind before the right operand
    }
    return {
      ...state,
      pending: {
        operation: state.operator,
        a: state.a,
        b: Number(state.entry),
        then: { chain: operator },
      },
    }
  }
  return {
    ...state,
    a: Number(state.entry),
    operator,
    fresh: true,
    hasB: false,
    last: null,
  }
}

function squareRoot(state: KeypadState): KeypadState {
  return { ...state, pending: { operation: 'sqrt', a: Number(state.entry), then: 'sqrt' } }
}

function equals(state: KeypadState): KeypadState {
  if (!canEquals(state) || state.operator === null || state.a === null) {
    return state
  }
  return {
    ...state,
    pending: { operation: state.operator, a: state.a, b: Number(state.entry), then: 'equals' },
  }
}

function reuseValue(state: KeypadState, value: string): KeypadState {
  return { ...startEntry(state, value), fresh: true }
}

function resolve(state: KeypadState, result: number): KeypadState {
  const pending = state.pending
  if (!pending) {
    return state // a stale answer
  }
  const entry = String(result)
  const settled: KeypadState = { ...state, pending: null, entry, fresh: true, announcement: entry }
  const { then } = pending
  if (then === 'equals') {
    const { operation, a, b } = pending
    return { ...settled, a: null, operator: null, hasB: false, last: { operation, a, b } }
  }
  if (then === 'sqrt') {
    // With an operator waiting, the square root becomes its right operand.
    if (state.operator !== null) {
      return { ...settled, hasB: true, last: null }
    }
    return { ...settled, last: { operation: 'sqrt', a: pending.a } }
  }
  return { ...settled, a: result, operator: then.chain, hasB: false, last: null }
}

function fail(state: KeypadState, error: CalculationError): KeypadState {
  const pending = state.pending
  if (!pending) {
    return state
  }
  const { operation, a, b } = pending
  return { ...initialKeypadState, error, last: { operation, a, b } }
}

// Selectors.

/** Equals has something to calculate: an operator with both operands. */
export function canEquals(state: KeypadState): boolean {
  return !state.pending && !state.error && state.operator !== null && state.a !== null && state.hasB
}

/** The operator waiting for its right operand, shown pressed on the keypad. */
export function activeOperator(state: KeypadState): BinaryOperator | null {
  return !state.pending && !state.hasB ? state.operator : null
}

/** One calculation in words of symbols: "15 % of 200", "√16". */
export function describe(
  calculation: Calculation,
  format: (raw: string) => string = String,
): string {
  const a = format(String(calculation.a))
  if (calculation.operation === 'sqrt') {
    return `√${a}`
  }
  const b = calculation.b === undefined ? '' : ` ${format(String(calculation.b))}`
  return `${a} ${OPERATOR_SYMBOLS[calculation.operation]}${b}`
}

/** The line above the value: what has been entered so far. */
export function expressionOf(state: KeypadState, format: (raw: string) => string = String): string {
  if (state.pending) {
    const done = state.pending.then === 'equals' || state.pending.then === 'sqrt'
    return `${describe(state.pending, format)}${done ? ' =' : ''}`
  }
  if (state.operator !== null && state.a !== null) {
    const typed = state.hasB ? ` ${format(state.entry)}` : ''
    return `${format(String(state.a))} ${OPERATOR_SYMBOLS[state.operator]}${typed}`
  }
  return state.last ? `${describe(state.last, format)} =` : ''
}

/** The history entry a result completes, if it completes one. */
export function historyEntryFor(
  pending: PendingCalculation,
  result: number,
  hadOperator: boolean,
): { expression: string; result: string } | null {
  if (pending.then === 'equals' || (pending.then === 'sqrt' && !hadOperator)) {
    return { expression: `${describe(pending)} =`, result: String(result) }
  }
  return null
}

/** The keypad action for a physical key, or null when the key is not ours. */
export function actionForKey(key: string): KeypadAction | null {
  if (/^[0-9]$/.test(key)) {
    return { type: 'digit', digit: key }
  }
  switch (key) {
    case '.':
    case ',':
      return { type: 'decimal' }
    case '+':
      return { type: 'operator', operator: 'add' }
    case '-':
      return { type: 'operator', operator: 'subtract' }
    case '*':
    case 'x':
      return { type: 'operator', operator: 'multiply' }
    case '/':
      return { type: 'operator', operator: 'divide' }
    case '^':
      return { type: 'operator', operator: 'power' }
    case '%':
      return { type: 'operator', operator: 'percent' }
    case 'Enter':
    case '=':
      return { type: 'equals' }
    case 'Backspace':
      return { type: 'backspace' }
    case 'Escape':
      return { type: 'clear' }
    case 'r':
    case 'R':
      return { type: 'sqrt' }
    case 'n':
    case 'N':
      return { type: 'toggleSign' }
    default:
      return null
  }
}

/** The on-screen key an action belongs to, for the pressed flash. */
export function keyIdFor(action: KeypadAction): string | null {
  switch (action.type) {
    case 'digit':
      return `digit-${action.digit}`
    case 'operator':
      return `operator-${action.operator}`
    case 'decimal':
    case 'toggleSign':
    case 'backspace':
    case 'clear':
    case 'sqrt':
    case 'equals':
      return action.type
    default:
      return null
  }
}
