import { describe, expect, it } from 'vitest'
import { displayWidth, formatDisplayValue, isNumeric, spokenValue } from './formatDisplay'

describe('formatDisplayValue', () => {
  it.each([
    ['0', '0'],
    ['7', '7'],
    ['999', '999'],
    ['1000', '1,000'],
    ['1234567', '1,234,567'],
    ['-1234567.89', '\u22121,234,567.89'],
    ['1234.', '1,234.'],
    ['0.', '0.'],
    ['0.50', '0.50'],
    ['-0', '\u22120'],
    ['123456789012345', '123,456,789,012,345'],
    ['1234567890123456', '1.234567890123456 × 10\u00b9\u2075'],
    ['123456789012000000', '1.23456789012 × 10\u00b9\u2077'],
    ['1.23456789012e+29', '1.23456789012 × 10\u00b2\u2079'],
    ['5e-324', '5 × 10\u207b\u00b3\u00b2\u2074'],
    ['1E3', '1 × 10\u00b3'],
    ['-2.5e-7', '\u22122.5 × 10\u207b\u2077'],
    ['1e+100', '1 × 10\u00b9\u2070\u2070'],
    ['Error', 'Error'],
    ['', ''],
    ['1,000', '1,000'],
  ])('%s → %s', (raw, expected) => {
    expect(formatDisplayValue(raw)).toBe(expected)
  })
})

describe('isNumeric', () => {
  it.each([
    ['12', true],
    ['-0.5', true],
    ['3.', true],
    ['1.2e+29', true],
    ['Error', false],
    ['', false],
    ['1e999', false],
    ['1,000', false],
  ])('%s → %s', (raw, expected) => {
    expect(isNumeric(raw)).toBe(expected)
  })
})

describe('displayWidth', () => {
  it.each([
    ['', 1],
    ['7', 1],
    ['1,234', 4.5],
    ['1,234,567.89', 10.5],
    ['Error', 5],
  ])('%s → %s digit widths', (text, expected) => {
    expect(displayWidth(text)).toBeCloseTo(expected)
  })
})

describe('spokenValue', () => {
  it.each([
    ['30', '30'],
    ['-5', 'minus 5'],
    ['-1234.5', 'minus 1,234.5'],
    ['8.88888888889e+29', '8.88888888889 times 10 to the power of 29'],
    ['-1.5e-7', 'minus 1.5 times 10 to the power of minus 7'],
    ['5e-324', '5 times 10 to the power of minus 324'],
    ['Error', 'Error'],
  ])('%s is said as %s', (raw, spoken) => {
    expect(spokenValue(raw)).toBe(spoken)
  })
})
