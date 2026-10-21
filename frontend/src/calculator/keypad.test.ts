import { describe, expect, it } from 'vitest'
import {
  type KeypadAction,
  type KeypadState,
  MAX_DIGITS,
  actionForKey,
  activeOperator,
  canEquals,
  describe as describeCalculation,
  expressionOf,
  historyEntryFor,
  initialKeypadState,
  keyIdFor,
  keypadReducer,
} from './keypad'

// Steps are space-separated tokens: digits and ".", the key symbols
// (± ⌫ AC + − × ÷ ^ % √ =), ok:<result> for an API answer, err for an API
// error, and use:<value> for a history entry.
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
}

function toAction(token: string): KeypadAction {
  if (/^[0-9]$/.test(token)) return { type: 'digit', digit: token }
  if (token.startsWith('ok:')) return { type: 'resolved', result: Number(token.slice(3)) }
  if (token === 'err')
    return { type: 'failed', error: { message: 'Cannot divide by zero.', requestId: 'r-1' } }
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
      announcement: '30',
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
  ['± on a result negates it', '2 + 3 = ok:5 ±', { entry: '-5' }],

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
    },
  ],
  [
    'the chain finishes with the second operator',
    '2 + 3 × ok:5 4 =',
    {
      pending: { operation: 'multiply', a: 5, b: 4, then: 'equals' },
    },
  ],
  ['2 + 3 × 4 = gives 20', '2 + 3 × ok:5 4 = ok:20', { entry: '20', expression: '5 × 4 =' }],

  // Square root
  [
    '√ sends only a',
    '1 6 √',
    { pending: { operation: 'sqrt', a: 16, then: 'sqrt' }, expression: '√16 =' },
  ],
  [
    'the root is shown with its expression',
    '1 6 √ ok:4',
    { entry: '4', expression: '√16 =', canEquals: false },
  ],
  ['√ of b becomes b', '9 + 1 6 √ ok:4', { entry: '4', expression: '9 + 4', canEquals: true }],
  [
    '√ right after an operator uses the shown value as b',
    '9 + √ ok:3',
    { expression: '9 + 3', canEquals: true },
  ],

  // While waiting for the API
  [
    'keys are ignored while a calculation is pending',
    '2 + 3 = 7 + AC',
    {
      entry: '3',
      pending: { operation: 'add', a: 2, b: 3, then: 'equals' },
      canEquals: false,
    },
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
    },
  ],
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
  ['equals after an error does nothing', '1 ÷ 0 = err =', { error: true }],
  [
    'a failed chain shows the step that failed',
    '1 ÷ 0 + err',
    { error: true, expression: '1 ÷ 0 =' },
  ],

  // History reuse
  ['a history value becomes the entry', 'use:30', { entry: '30', expression: '' }],
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
    if (expected.announcement !== undefined) expect(state.announcement).toBe(expected.announcement)
  })

  it('keeps the error message and request ID', () => {
    expect(run('1 ÷ 0 = err').error).toEqual({
      message: 'Cannot divide by zero.',
      requestId: 'r-1',
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

describe('describe', () => {
  it('writes binary and unary calculations', () => {
    expect(describeCalculation({ operation: 'percent', a: 15, b: 200 })).toBe('15 % of 200')
    expect(describeCalculation({ operation: 'sqrt', a: 2 })).toBe('√2')
    expect(describeCalculation({ operation: 'add', a: 1 })).toBe('1 +')
  })
})

describe('historyEntryFor', () => {
  it('records equals and a standalone square root, not chain steps', () => {
    expect(
      historyEntryFor({ operation: 'percent', a: 15, b: 200, then: 'equals' }, 30, true),
    ).toEqual({
      expression: '15 % of 200 =',
      result: '30',
    })
    expect(historyEntryFor({ operation: 'sqrt', a: 16, then: 'sqrt' }, 4, false)).toEqual({
      expression: '√16 =',
      result: '4',
    })
    expect(historyEntryFor({ operation: 'sqrt', a: 16, then: 'sqrt' }, 4, true)).toBeNull()
    expect(
      historyEntryFor({ operation: 'add', a: 2, b: 3, then: { chain: 'multiply' } }, 5, true),
    ).toBeNull()
  })
})

describe('actionForKey', () => {
  it.each([
    ['0', { type: 'digit', digit: '0' }],
    ['9', { type: 'digit', digit: '9' }],
    ['.', { type: 'decimal' }],
    [',', { type: 'decimal' }],
    ['+', { type: 'operator', operator: 'add' }],
    ['-', { type: 'operator', operator: 'subtract' }],
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
