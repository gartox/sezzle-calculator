// The calculator keypad as a pure reducer: no React, no network. The page
// dispatches key presses; when the state holds a `pending` calculation the
// page sends it to the API and dispatches `resolved` or `failed`.
//
// Evaluation is left to right, like a basic handheld calculator: pressing an
// operator when an expression is already complete calculates it first, so
// 2 + 3 × 4 = is (2 + 3) × 4 = 20, and the intermediate 5 is shown.
//
// Keys pressed while a calculation is pending are queued and applied, in
// order, once the answer arrives, so fast typing on a slow network loses
// nothing. AC is the exception: it clears at once and cancels the request.

import type { Operation } from '../api/client'

export type BinaryOperator = Exclude<Operation, 'sqrt'>

/** The longest entry, counted in significant digits, so every typed value stays exact. */
export const MAX_DIGITS = 15

/** Keys waiting for an answer; a held-down key cannot grow the queue without bound. */
export const MAX_QUEUE = 32

export interface CalculationError {
  message: string
  requestId?: string
  code?: string
}

/** Failures worth sending again unchanged: the request, not the arithmetic, failed. */
const RETRYABLE_CODES = new Set(['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'UNEXPECTED_RESPONSE'])

export function isRetryable(error: CalculationError): boolean {
  return error.code === undefined || RETRYABLE_CODES.has(error.code)
}

/** One operand as the user sees it: a number as typed, √x, or x % in a chain. */
export type Term =
  { kind: 'number'; raw: string } | { kind: 'sqrt'; raw: string } | { kind: 'percent'; raw: string }

/** An expression is a list of terms and operators, kept raw so the display can format it. */
export type Token = Term | { kind: 'operator'; operator: BinaryOperator }

/**
 * What happens with a result: show it (equals), show it as a standalone square
 * root, use it as the right operand (√x or x % after an operator), or chain
 * into the next operator.
 */
export type Continuation = 'equals' | 'sqrt' | 'operand' | { chain: BinaryOperator }

export interface PendingCalculation {
  operation: Operation
  a: number
  b?: number
  then: Continuation
}

/** A text for the polite live region. `seq` changes on every announcement, even a repeated one. */
export interface Announcement {
  tokens: Token[] | null
  value: string
  seq: number
}

/** A completed calculation for the history: the whole chain and its result. */
export interface HistoryRecord {
  tokens: Token[]
  result: string
}

export interface KeypadState {
  /** The current value as text: what is being typed, or the last result. */
  entry: string
  /** The next digit starts a new entry instead of extending this one. */
  fresh: boolean
  /** The left operand as text, once an operator has been chosen. */
  a: string | null
  operator: BinaryOperator | null
  /** A right operand has been entered since the operator. */
  hasB: boolean
  /** How the right operand was made when it is √x or x %, for the history. */
  bTerm: Term | null
  /** The expression that produced `a`: [2, +, 3] once 2 + 3 × has been calculated. */
  tape: Token[]
  /** A calculation sent to the API and not answered yet. */
  pending: PendingCalculation | null
  /** Keys pressed while `pending` was set, applied in order after the answer. */
  queue: KeypadAction[]
  /** The calculation the display shows with "=": the last result or the failed one. */
  last: Token[] | null
  error: CalculationError | null
  /** The calculation that failed, when sending it again may work; equals resends it. */
  retry: PendingCalculation | null
  announcement: Announcement | null
  /** The last completed calculation, for the history. */
  record: HistoryRecord | null
}

export type KeypadAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'operator'; operator: BinaryOperator }
  /** The keyboard's "-": a sign after ×, ÷, ^ or %, otherwise subtract. */
  | { type: 'minus' }
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
  bTerm: null,
  tape: [],
  pending: null,
  queue: [],
  last: null,
  error: null,
  retry: null,
  announcement: null,
  record: null,
}

export const OPERATOR_SYMBOLS: Record<BinaryOperator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percent: '% of',
}

const OPERATOR_WORDS: Record<BinaryOperator, string> = {
  add: 'plus',
  subtract: 'minus',
  multiply: 'times',
  divide: 'divided by',
  power: 'to the power of',
  percent: 'percent of',
}

const number = (raw: string): Term => ({ kind: 'number', raw })
const operatorToken = (operator: BinaryOperator): Token => ({ kind: 'operator', operator })

export function keypadReducer(state: KeypadState, action: KeypadAction): KeypadState {
  switch (action.type) {
    case 'resolved':
      return replayQueue(resolve(state, action.result))
    case 'failed':
      return fail(state, action.error)
    case 'clear':
      return initialKeypadState // also cancels a pending calculation
  }
  if (state.pending) {
    if (state.queue.length >= MAX_QUEUE) {
      return state
    }
    return { ...state, queue: [...state.queue, action] }
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
    case 'operator':
      return chooseOperator(recover(state), action.operator)
    case 'minus':
      return minus(recover(state))
    case 'sqrt':
      return squareRoot(recover(state))
    case 'equals':
      return equals(state)
    case 'useValue':
      return reuseValue(recover(state), action.value)
  }
}

/** Applies the keys that waited for an answer; a key that starts a new calculation queues the rest again. */
function replayQueue(state: KeypadState): KeypadState {
  if (state.queue.length === 0) {
    return state
  }
  return state.queue.reduce(keypadReducer, { ...state, queue: [] })
}

/** After an error, any key except a retrying equals starts over from a clean state. */
function recover(state: KeypadState): KeypadState {
  return state.error ? initialKeypadState : state
}

/** Significant digits typed: the zero in front of "0.5" does not count. */
function countDigits(entry: string): number {
  return entry.replace(/^-?0(?=\.)/, '').replace(/[^0-9]/g, '').length
}

/** Starting an entry after an operator makes it the right operand. */
function startEntry(state: KeypadState, entry: string): KeypadState {
  return {
    ...state,
    entry,
    fresh: false,
    hasB: state.operator !== null,
    bTerm: null,
    last: null,
  }
}

function announce(state: KeypadState, tokens: Token[] | null): KeypadState {
  const seq = (state.announcement?.seq ?? 0) + 1
  return { ...state, announcement: { tokens, value: state.entry, seq } }
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
  // The value no longer matches the line above it or how b was made.
  return announce({ ...state, entry, bTerm: null, last: null }, null)
}

function backspace(state: KeypadState): KeypadState {
  if (state.fresh) {
    return state // a result or a carried value is not edited digit by digit
  }
  const entry = state.entry.slice(0, -1)
  return { ...state, entry: entry === '' || entry === '-' ? '0' : entry }
}

/** The whole expression of a complete step, from the first operand. Only called with an operator and b. */
function fullTokens(state: KeypadState): Token[] {
  return [...state.tape, operatorToken(state.operator!), state.bTerm ?? number(state.entry)]
}

/**
 * The step on screen: a, the operator, and b once entered (as √x or x % while
 * it is computed). Only called while an operator is set, and a is always set
 * with it.
 */
function stepTokens(state: KeypadState, withTerm: boolean): Token[] {
  const tokens: Token[] = [number(state.a!), operatorToken(state.operator!)]
  if (state.hasB) {
    tokens.push(withTerm && state.bTerm ? state.bTerm : number(state.entry))
  }
  return tokens
}

function chooseOperator(state: KeypadState, operator: BinaryOperator): KeypadState {
  if (state.operator !== null && state.a !== null) {
    if (!state.hasB) {
      return { ...state, operator } // change of mind before the right operand
    }
    if (operator === 'percent' && state.operator !== 'percent') {
      return percentOfOperand(state)
    }
    return {
      ...state,
      pending: {
        operation: state.operator,
        a: Number(state.a),
        b: Number(state.entry),
        then: { chain: operator },
      },
    }
  }
  return {
    ...state,
    a: state.entry,
    operator,
    fresh: true,
    hasB: false,
    bTerm: null,
    tape: [number(state.entry)],
    last: null,
  }
}

/**
 * % after "a + b" or "a − b" turns b into b percent of a, and after ×, ÷ or ^
 * into b / 100, as on a handheld calculator: 200 + 10 % is 200 + 20. The API
 * does the arithmetic with its percent operation.
 */
function percentOfOperand(state: KeypadState): KeypadState {
  const of = state.operator === 'add' || state.operator === 'subtract' ? Number(state.a) : 1
  return {
    ...state,
    bTerm: { kind: 'percent', raw: state.entry },
    pending: { operation: 'percent', a: Number(state.entry), b: of, then: 'operand' },
  }
}

function minus(state: KeypadState): KeypadState {
  const signable = state.operator !== 'add' && state.operator !== 'subtract'
  if (state.operator !== null && !state.hasB && state.fresh && signable) {
    return startEntry(state, '-0') // 5 × -3, as typed
  }
  return chooseOperator(state, 'subtract')
}

function squareRoot(state: KeypadState): KeypadState {
  const pending: PendingCalculation = { operation: 'sqrt', a: Number(state.entry), then: 'sqrt' }
  if (state.operator === null) {
    return { ...state, pending }
  }
  // After an operator the root becomes the right operand; with no b yet it is
  // the root of the shown value.
  return {
    ...state,
    hasB: true,
    bTerm: { kind: 'sqrt', raw: state.entry },
    pending: { ...pending, then: 'operand' },
  }
}

function equals(state: KeypadState): KeypadState {
  if (state.error && state.retry) {
    return { ...state, error: null, retry: null, last: null, pending: state.retry }
  }
  if (!canEquals(state) || state.operator === null || state.a === null) {
    return state
  }
  return {
    ...state,
    pending: {
      operation: state.operator,
      a: Number(state.a),
      b: Number(state.entry),
      then: 'equals',
    },
  }
}

function reuseValue(state: KeypadState, value: string): KeypadState {
  return announce({ ...startEntry(state, value), fresh: true }, null)
}

function resolve(state: KeypadState, result: number): KeypadState {
  const pending = state.pending
  if (!pending) {
    return state // a stale answer
  }
  const entry = String(result)
  const settled: KeypadState = { ...state, pending: null, entry, fresh: true }
  const { then } = pending
  if (then === 'equals') {
    const tokens = fullTokens(state)
    return announce(
      {
        ...settled,
        a: null,
        operator: null,
        hasB: false,
        bTerm: null,
        tape: [],
        last: stepTokens(state, false),
        record: { tokens, result: entry },
      },
      tokens,
    )
  }
  if (then === 'sqrt') {
    const tokens: Token[] = [{ kind: 'sqrt', raw: state.entry }]
    return announce({ ...settled, last: tokens, record: { tokens, result: entry } }, tokens)
  }
  if (then === 'operand') {
    return announce({ ...settled, last: null }, [state.bTerm!])
  }
  const step = stepTokens(state, true)
  return announce(
    {
      ...settled,
      a: entry,
      operator: then.chain,
      hasB: false,
      bTerm: null,
      tape: [...fullTokens(state)],
      last: null,
    },
    step,
  )
}

function fail(state: KeypadState, error: CalculationError): KeypadState {
  const pending = state.pending
  if (!pending) {
    return state // a stale error
  }
  const last: Token[] =
    pending.then === 'sqrt'
      ? [{ kind: 'sqrt', raw: state.entry }]
      : stepTokens(state, pending.then === 'operand')
  if (isRetryable(error)) {
    // Keep the expression so equals can send it again; keys typed meanwhile
    // were meant for that expression, so they are dropped.
    return { ...state, pending: null, queue: [], error, retry: pending, last }
  }
  // The calculation is over. Keys typed meanwhile start the next one, as on
  // a handheld: 1 ÷ 0 = 5 typed fast ends with 5.
  return state.queue.reduce(keypadReducer, { ...initialKeypadState, error, last })
}

// Selectors.

/** Equals has something to calculate: an operator with both operands. */
export function canEquals(state: KeypadState): boolean {
  return !state.pending && !state.error && state.operator !== null && state.a !== null && state.hasB
}

/** Equals would send a failed calculation again. */
export function canRetry(state: KeypadState): boolean {
  return state.error !== null && state.retry !== null
}

/** The operator waiting for its right operand, shown pressed on the keypad. */
export function activeOperator(state: KeypadState): BinaryOperator | null {
  return !state.pending && !state.error && !state.hasB ? state.operator : null
}

/** Tokens written with symbols: "2 + √16", "200 + 10 %". */
export function writeTokens(tokens: Token[], format: (raw: string) => string = String): string {
  return tokens
    .map((token) => {
      switch (token.kind) {
        case 'number':
          return format(token.raw)
        case 'sqrt':
          return `√${format(token.raw)}`
        case 'percent':
          return `${format(token.raw)} %`
        case 'operator':
          return OPERATOR_SYMBOLS[token.operator]
      }
    })
    .join(' ')
}

/** Tokens in words, for screen readers: "2 plus square root of 16". */
export function speakTokens(tokens: Token[], speak: (raw: string) => string = String): string {
  return tokens
    .map((token) => {
      switch (token.kind) {
        case 'number':
          return speak(token.raw)
        case 'sqrt':
          return `square root of ${speak(token.raw)}`
        case 'percent':
          return `${speak(token.raw)} percent`
        case 'operator':
          return OPERATOR_WORDS[token.operator]
      }
    })
    .join(' ')
}

/** The line above the value: what has been entered so far. */
export function expressionOf(state: KeypadState, format: (raw: string) => string = String): string {
  const write = (tokens: Token[]) => writeTokens(tokens, format)
  if (state.pending) {
    const { then } = state.pending
    if (then === 'sqrt') {
      return `${write([{ kind: 'sqrt', raw: state.entry }])} =`
    }
    const step = write(stepTokens(state, then === 'operand'))
    return then === 'equals' ? `${step} =` : step
  }
  if (state.error) {
    return `${write(state.last!)} =` // a failure always keeps the calculation that failed
  }
  if (state.operator !== null) {
    return write(stepTokens(state, false))
  }
  return state.last ? `${write(state.last)} =` : ''
}

/** The text of an announcement: "2 plus 3 equals 5", or just the value. */
export function announcementText(
  announcement: Announcement,
  speak: (raw: string) => string = String,
): string {
  const value = speak(announcement.value)
  return announcement.tokens ? `${speakTokens(announcement.tokens, speak)} equals ${value}` : value
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
      return { type: 'minus' }
    case '*':
    case 'x':
    case 'X':
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
    case 'minus':
      return 'operator-subtract'
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
