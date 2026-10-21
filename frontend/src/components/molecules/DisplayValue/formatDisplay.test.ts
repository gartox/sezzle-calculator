import { describe, expect, it } from 'vitest'
import { formatDisplayValue, isNumeric } from './formatDisplay'

describe('formatDisplayValue', () => {
  it.each([
    ['0', '0'],
    ['7', '7'],
    ['999', '999'],
    ['1000', '1,000'],
    ['1234567', '1,234,567'],
    ['-1234567.89', '-1,234,567.89'],
    ['1234.', '1,234.'],
    ['0.', '0.'],
    ['0.50', '0.50'],
    ['-0', '-0'],
    ['123456789012345', '123,456,789,012,345'],
    ['1234567890123456', '1.234567890123456e+15'],
    ['123456789012000000', '1.23456789012e+17'],
    ['1.23456789012e+29', '1.23456789012e+29'],
    ['5e-324', '5e-324'],
    ['1E3', '1e+3'],
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
