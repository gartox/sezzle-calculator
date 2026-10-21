import { describe, expect, it } from 'vitest'
import {
  type KeypadAction,
  type KeypadState,
  MAX_DIGITS,
  MAX_QUEUE,
  actionForKey,
  activeOperator,
  announcementText,
  canEquals,
  canRetry,
  expressionOf,
  initialKeypadState,
  isRetryable,
  keyIdFor,
  keypadReducer,
  speakTokens,
  writeTokens,
} from './keypad'

// Steps are space-separated tokens: digits and ".", the key symbols
// (± ⌫ AC + − × ÷ ^ % √ =), "-" for the keyboard's minus key, ok:<result> for
// an API answer, err for an arithmetic error from the API, net for a failed
// request, and use:<value> for a history entry.
const TOKENS: Record<string, KeypadAction> = {
  '.': { type: 'decimal' },
  '±': { type: 'toggleSign' },
  '⌫': { type: 'backspace' },
  AC: { type: 'clear' },
  '+': { type: 'operator', operator: 'add' },
  '−': { type: 'operator', operator: 'subtract' },
  '×': { type: 'operator', operator: 'multiply' },
  '÷': { type: 'operator', operator: 'divide' },
  '^': { type: 'operator', operator: 'power' },
  '%': { type: 'operator', operator: 'percent' },
  '√': { type: 'sqrt' },
  '=': { type: 'equals' },
  '-': { type: 'minus' },
}

function toAction(token: string): KeypadAction {
  if (/^[0-9]$/.test(token)) return { type: 'digit', digit: token }
  if (token.startsWith('ok:')) return { type: 'resolved', result: Number(token.slice(3)) }
  if (token === 'err')
    return {
      type: 'failed',
      error: { message: 'Cannot divide by zero.', requestId: 'r-1', code: 'DIVISION_BY_ZERO' },
    }
  if (token === 'net')
    return { type: 'failed', error: { message: 'Could not reach it.', code: 'NETWORK_ERROR' } }
  if (token.startsWith('use:')) return { type: 'useValue', value: token.slice(4) }
  const action = TOKENS[token]
  if (!action) throw new Error(`unknown token ${token}`)
  return action
}

function run(steps: string): KeypadState {
  return steps
    .split(' ')
    .filter(Boolean)
    .reduce((state, token) => keypadReducer(state, toAction(token)), initialKeypadState)
}

interface Expectation {
  entry?: string
  expression?: string
  pending?: KeypadState['pending']
  error?: boolean
  canEquals?: boolean
  active?: string | null
  announcement?: string
  /** The history entry the last completed calculation produced. */
  history?: string | null
  retry?: boolean
  queued?: number
}

const CASES: Array<[name: string, steps: string, expected: Expectation]> = [
  // Entry
  ['starts at zero', '', { entry: '0', expression: '', canEquals: false, pending: null }],
  ['digits build the entry', '1 2 3', { entry: '123' }],
  ['no leading zeros', '0 0 7', { entry: '7' }],
  ['zero stays a single zero', '0 0', { entry: '0' }],
  ['a dot on zero gives 0.', '.', { entry: '0.' }],
  ['digits after the dot', '. 5', { entry: '0.5' }],
  ['zeros after the dot are kept', '1 . 0 0', { entry: '1.00' }],
  ['a second dot is ignored', '1 . 2 . 3', { entry: '1.23' }],
  ['the entry stops at 15 digits', '1 '.repeat(MAX_DIGITS + 3), { entry: '1'.repeat(MAX_DIGITS) }],
  [
    'the dot does not count toward the cap',
    `${'9 '.repeat(14)}. 9 9`,
    { entry: `${'9'.repeat(14)}.9` },
  ],
  [
    'the zero before the dot does not count toward the cap',
    `0 . ${'1 '.repeat(MAX_DIGITS + 2)}`,
    { entry: `0.${'1'.repeat(MAX_DIGITS)}` },
  ],
  ['± on zero gives -0', '±', { entry: '-0' }],
  ['a digit after -0 replaces the zero', '± 5', { entry: '-5' }],
  ['± on a number', '1 2 ±', { entry: '-12' }],
  ['± on a negative number', '1 2 ± ±', { entry: '12' }],
  ['⌫ deletes the last character', '1 2 3 ⌫', { entry: '12' }],
  ['⌫ to empty shows 0', '5 ⌫', { entry: '0' }],
  ['⌫ on a negative single digit shows 0', '5 ± ⌫', { entry: '0' }],
  ['⌫ on zero stays zero', '⌫', { entry: '0' }],
  ['AC clears everything', '1 2 + 3 AC', { entry: '0', expression: '', canEquals: false }],

  // Operators
  [
    'an operator stores a',
    '1 5 %',
    { entry: '15', expression: '15 % of', active: 'percent', canEquals: false },
  ],
  ['multiply shows its symbol', '2 ×', { expression: '2 ×', active: 'multiply' }],
  ['power shows ^', '2 ^', { expression: '2 ^', active: 'power' }],
  [
    'a second operator before b replaces the first',
    '2 + ×',
    { expression: '2 ×', active: 'multiply', pending: null },
  ],
  [
    'typing b shows it in the expression',
    '1 5 % 2 0 0',
    { entry: '200', expression: '15 % of 200', canEquals: true, active: null },
  ],
  [
    '± right after an operator starts a negative b',
    '5 + ± 3',
    { entry: '-3', expression: '5 + -3', canEquals: true },
  ],
  ['a typed operand keeps its typed form', '0 . 0 0 0 0 0 0 1 +', { expression: '0.0000001 +' }],
  ['the keyboard minus subtracts', '5 -', { expression: '5 −', active: 'subtract' }],
  [
    'the keyboard minus after × starts a negative b',
    '5 × - 3',
    { entry: '-3', expression: '5 × -3', canEquals: true },
  ],
  ['the keyboard minus after + replaces it', '5 + -', { expression: '5 −', active: 'subtract' }],
  [
    'the keyboard minus after a complete expression chains',
    '5 × 2 -',
    { pending: { operation: 'multiply', a: 5, b: 2, then: { chain: 'subtract' } } },
  ],
  ['a dot right after an operator starts b at 0.', '5 + .', { entry: '0.', canEquals: true }],

  // Equals
  [
    'equals sends a, the operator and b',
    '1 5 % 2 0 0 =',
    {
      pending: { operation: 'percent', a: 15, b: 200, then: 'equals' },
      expression: '15 % of 200 =',
    },
  ],
  [
    'the result replaces the entry and keeps the expression',
    '1 5 % 2 0 0 = ok:30',
    {
      entry: '30',
      expression: '15 % of 200 =',
      pending: null,
      canEquals: false,
      announcement: '15 percent of 200 equals 30',
      history: '15 % of 200 = 30',
    },
  ],
  [
    'equals without b does nothing',
    '2 + =',
    { pending: null, expression: '2 +', canEquals: false },
  ],
  ['equals without an operator does nothing', '5 =', { pending: null, expression: '' }],
  ['a digit after a result starts a new entry', '2 + 3 = ok:5 7', { entry: '7', expression: '' }],
  [
    'an operator after a result uses it as a',
    '2 + 3 = ok:5 +',
    { expression: '5 +', active: 'add' },
  ],
  ['⌫ does not edit a result', '2 + 3 = ok:5 ⌫', { entry: '5' }],
  [
    '± on a result negates it and clears the line that no longer matches',
    '1 5 % 2 0 0 = ok:30 ±',
    { entry: '-30', expression: '', announcement: '-30' },
  ],

  // Chaining, left to right
  [
    'an operator after a complete expression calculates it first',
    '2 + 3 ×',
    {
      pending: { operation: 'add', a: 2, b: 3, then: { chain: 'multiply' } },
      expression: '2 + 3',
    },
  ],
  [
    'the intermediate result becomes a and is shown',
    '2 + 3 × ok:5',
    {
      entry: '5',
      expression: '5 ×',
      active: 'multiply',
      pending: null,
      announcement: '2 plus 3 equals 5',
      history: null,
    },
  ],
  [
    'the chain finishes with the second operator',
    '2 + 3 × ok:5 4 =',
    {
      pending: { operation: 'multiply', a: 5, b: 4, then: 'equals' },
    },
  ],
  [
    '2 + 3 × 4 = gives 20 and the history keeps the whole chain',
    '2 + 3 × ok:5 4 = ok:20',
    { entry: '20', expression: '5 × 4 =', history: '2 + 3 × 4 = 20' },
  ],

  // Percent inside a chain, as on a handheld: b percent of a after + and −
  [
    '% after a + b asks for b percent of a',
    '2 0 0 + 1 0 %',
    {
      pending: { operation: 'percent', a: 10, b: 200, then: 'operand' },
      expression: '200 + 10 %',
    },
  ],
  [
    'the percent becomes b',
    '2 0 0 + 1 0 % ok:20',
    { entry: '20', expression: '200 + 20', canEquals: true, announcement: '10 percent equals 20' },
  ],
  [
    'equals then adds it',
    '2 0 0 + 1 0 % ok:20 = ok:220',
    { entry: '220', expression: '200 + 20 =', history: '200 + 10 % = 220' },
  ],
  [
    '% after a − b also takes b percent of a',
    '2 0 0 − 1 0 %',
    { pending: { operation: 'percent', a: 10, b: 200, then: 'operand' } },
  ],
  [
    '% after a × b makes b a hundredth',
    '2 0 0 × 1 0 %',
    { pending: { operation: 'percent', a: 10, b: 1, then: 'operand' } },
  ],
  [
    '% after a complete percent chains like any operator',
    '1 5 % 2 0 0 %',
    { pending: { operation: 'percent', a: 15, b: 200, then: { chain: 'percent' } } },
  ],

  // Square root
  [
    '√ sends only a',
    '1 6 √',
    { pending: { operation: 'sqrt', a: 16, then: 'sqrt' }, expression: '√16 =' },
  ],
  [
    'the root is shown with its expression and recorded',
    '1 6 √ ok:4',
    { entry: '4', expression: '√16 =', canEquals: false, history: '√16 = 4' },
  ],
  [
    '√ after an operator computes b',
    '9 + 1 6 √',
    { pending: { operation: 'sqrt', a: 16, then: 'operand' }, expression: '9 + √16' },
  ],
  [
    '√ of b becomes b',
    '9 + 1 6 √ ok:4',
    { entry: '4', expression: '9 + 4', canEquals: true, history: null },
  ],
  [
    'the history shows the root it used',
    '9 + 1 6 √ ok:4 = ok:13',
    { expression: '9 + 4 =', history: '9 + √16 = 13' },
  ],
  [
    '√ right after an operator uses the shown value as b',
    '9 + √ ok:3',
    { expression: '9 + 3', canEquals: true },
  ],

  // While waiting for the API
  [
    'keys pressed while a calculation is pending wait in order',
    '2 + 3 = 7 +',
    {
      entry: '3',
      pending: { operation: 'add', a: 2, b: 3, then: 'equals' },
      canEquals: false,
      queued: 2,
    },
  ],
  [
    'the waiting keys are applied after the answer',
    '2 + 3 = 7 + ok:5',
    { entry: '7', expression: '7 +', active: 'add', queued: 0, history: '2 + 3 = 5' },
  ],
  [
    'a chain typed during the answer finishes',
    '2 + 3 × 4 = ok:5',
    { pending: { operation: 'multiply', a: 5, b: 4, then: 'equals' }, queued: 0 },
  ],
  [
    'a waiting key that starts a calculation queues the rest again',
    '2 + 3 × 4 + 1 ok:5',
    { pending: { operation: 'multiply', a: 5, b: 4, then: { chain: 'add' } }, queued: 1 },
  ],
  ['the queue is capped', `2 + 3 = ${'7 '.repeat(MAX_QUEUE + 5)}`, { queued: MAX_QUEUE }],
  [
    'AC cancels the pending calculation and the waiting keys',
    '2 + 3 = 7 AC',
    { pending: null, entry: '0', expression: '', queued: 0 },
  ],
  ['a stale answer is ignored', 'ok:5', { entry: '0' }],
  ['a stale error is ignored', 'err', { error: false }],

  // Errors
  [
    'an error keeps the failed expression',
    '1 ÷ 0 = err',
    {
      error: true,
      expression: '1 ÷ 0 =',
      canEquals: false,
      pending: null,
      retry: false,
      active: null,
    },
  ],
  ['an arithmetic error drops the waiting keys', '1 ÷ 0 = 7 err', { error: true, queued: 0 }],
  [
    'a digit after an error starts fresh',
    '1 ÷ 0 = err 7',
    { error: false, entry: '7', expression: '' },
  ],
  ['AC after an error clears it', '1 ÷ 0 = err AC', { error: false, entry: '0', expression: '' }],
  [
    'an operator after an error starts from zero',
    '1 ÷ 0 = err +',
    { error: false, expression: '0 +' },
  ],
  ['equals after an arithmetic error does nothing', '1 ÷ 0 = err =', { error: true }],
  [
    'a failed request keeps the expression for a retry',
    '1 + 2 = 7 net',
    { error: true, expression: '1 + 2 =', retry: true, queued: 0, active: null },
  ],
  [
    'equals sends a failed request again',
    '1 + 2 = net =',
    { error: false, pending: { operation: 'add', a: 1, b: 2, then: 'equals' } },
  ],
  ['the retry can succeed', '1 + 2 = net = ok:3', { entry: '3', history: '1 + 2 = 3' }],
  [
    'a failed chain step is retried as a chain step',
    '1 + 2 × net = ok:3',
    { entry: '3', expression: '3 ×', active: 'multiply' },
  ],
  [
    'another key after a failed request starts over',
    '1 + 2 = net 7',
    { error: false, entry: '7', expression: '', retry: false },
  ],
  [
    'a failed square root of b shows the root',
    '9 + 1 6 √ net',
    { error: true, expression: '9 + √16 =', retry: true },
  ],
  ['a failed standalone root shows the root', '1 6 √ net', { error: true, expression: '√16 =' }],
  [
    'a failed chain shows the step that failed',
    '1 ÷ 0 + err',
    { error: true, expression: '1 ÷ 0 =' },
  ],

  // History reuse
  [
    'a history value becomes the entry and is announced',
    'use:30',
    { entry: '30', expression: '', announcement: '30' },
  ],
  [
    'a history value after an operator becomes b',
    '2 + use:30',
    { entry: '30', canEquals: true, expression: '2 + 30' },
  ],
  ['a digit after a history value starts a new entry', 'use:30 7', { entry: '7' }],
  ['a history value recovers from an error', '1 ÷ 0 = err use:30', { error: false, entry: '30' }],
]

describe('keypadReducer', () => {
  it.each(CASES)('%s', (_name, steps, expected) => {
    const state = run(steps)
    if (expected.entry !== undefined) expect(state.entry).toBe(expected.entry)
    if (expected.expression !== undefined) expect(expressionOf(state)).toBe(expected.expression)
    if (expected.pending !== undefined) expect(state.pending).toEqual(expected.pending)
    if (expected.error !== undefined) expect(state.error !== null).toBe(expected.error)
    if (expected.canEquals !== undefined) expect(canEquals(state)).toBe(expected.canEquals)
    if (expected.active !== undefined) expect(activeOperator(state)).toBe(expected.active)
    if (expected.announcement !== undefined) {
      expect(state.announcement && announcementText(state.announcement)).toBe(expected.announcement)
    }
    if (expected.history !== undefined) {
      const record = state.record && `${writeTokens(state.record.tokens)} = ${state.record.result}`
      expect(record).toBe(expected.history)
    }
    if (expected.retry !== undefined) expect(canRetry(state)).toBe(expected.retry)
    if (expected.queued !== undefined) expect(state.queue).toHaveLength(expected.queued)
  })

  it('numbers every announcement, so a repeated result is announced again', () => {
    const first = run('2 + 3 = ok:5')
    const again = ['3', '+', '2', '=', 'ok:5'].reduce(
      (state, token) => keypadReducer(state, toAction(token)),
      first,
    )
    expect(announcementText(again.announcement!)).toBe('3 plus 2 equals 5')
    expect(again.announcement!.seq).toBeGreaterThan(first.announcement!.seq)
  })

  it('keeps the error message and request ID', () => {
    expect(run('1 ÷ 0 = err').error).toEqual({
      message: 'Cannot divide by zero.',
      requestId: 'r-1',
      code: 'DIVISION_BY_ZERO',
    })
  })
})

describe('expressionOf', () => {
  it('formats operands with the formatter it is given', () => {
    const state = run('1 2 3 4 + 5 6 7 8')
    expect(expressionOf(state, (raw) => `<${raw}>`)).toBe('<1234> + <5678>')
  })

  it('formats the completed calculation', () => {
    expect(expressionOf(run('1 6 √ ok:4'), (raw) => `[${raw}]`)).toBe('√[16] =')
  })
})

describe('writeTokens and speakTokens', () => {
  const tokens = [
    { kind: 'number', raw: '-2' },
    { kind: 'operator', operator: 'add' },
    { kind: 'sqrt', raw: '16' },
    { kind: 'operator', operator: 'percent' },
    { kind: 'percent', raw: '10' },
  ] as const

  it('writes symbols with the formatter it is given', () => {
    expect(writeTokens([...tokens], (raw) => `<${raw}>`)).toBe('<-2> + √<16> % of <10> %')
  })

  it('says words for screen readers', () => {
    expect(speakTokens([...tokens], (raw) => raw.replace('-', 'minus '))).toBe(
      'minus 2 plus square root of 16 percent of 10 percent',
    )
  })
})

describe('isRetryable', () => {
  it.each([
    ['NETWORK_ERROR', true],
    ['TIMEOUT', true],
    ['RATE_LIMITED', true],
    ['UNEXPECTED_RESPONSE', true],
    [undefined, true],
    ['DIVISION_BY_ZERO', false],
    ['NEGATIVE_SQRT', false],
    ['RESULT_OVERFLOW', false],
  ])('%s: %s', (code, retryable) => {
    expect(isRetryable({ message: 'x', code })).toBe(retryable)
  })
})

describe('actionForKey', () => {
  it.each([
    ['0', { type: 'digit', digit: '0' }],
    ['9', { type: 'digit', digit: '9' }],
    ['.', { type: 'decimal' }],
    [',', { type: 'decimal' }],
    ['+', { type: 'operator', operator: 'add' }],
    ['-', { type: 'minus' }],
    ['*', { type: 'operator', operator: 'multiply' }],
    ['x', { type: 'operator', operator: 'multiply' }],
    ['/', { type: 'operator', operator: 'divide' }],
    ['^', { type: 'operator', operator: 'power' }],
    ['%', { type: 'operator', operator: 'percent' }],
    ['Enter', { type: 'equals' }],
    ['=', { type: 'equals' }],
    ['Backspace', { type: 'backspace' }],
    ['Escape', { type: 'clear' }],
    ['r', { type: 'sqrt' }],
    ['R', { type: 'sqrt' }],
    ['n', { type: 'toggleSign' }],
    ['N', { type: 'toggleSign' }],
    ['a', null],
    ['Tab', null],
    ['10', null],
  ])('%s', (key, action) => {
    expect(actionForKey(key)).toEqual(action)
  })
})

describe('keyIdFor', () => {
  it.each<[KeypadAction, string | null]>([
    [{ type: 'digit', digit: '7' }, 'digit-7'],
    [{ type: 'operator', operator: 'divide' }, 'operator-divide'],
    [{ type: 'minus' }, 'operator-subtract'],
    [{ type: 'decimal' }, 'decimal'],
    [{ type: 'toggleSign' }, 'toggleSign'],
    [{ type: 'backspace' }, 'backspace'],
    [{ type: 'clear' }, 'clear'],
    [{ type: 'sqrt' }, 'sqrt'],
    [{ type: 'equals' }, 'equals'],
    [{ type: 'useValue', value: '1' }, null],
    [{ type: 'resolved', result: 1 }, null],
    [{ type: 'failed', error: { message: 'x' } }, null],
  ])('%o names key %s', (action, id) => {
    expect(keyIdFor(action)).toBe(id)
  })
})
