// Formatting for the calculator display. The text sent to the API is never
// formatted; grouping and exponent notation are for reading only.

const PLAIN_NUMBER = /^-?\d+(\.\d*)?$/

/** Integer digits beyond this switch the display to exponent notation. */
export const MAX_DISPLAY_DIGITS = 15

/** Whether raw is a number the user can copy, as typed or as returned. */
export function isNumeric(raw: string): boolean {
  return PLAIN_NUMBER.test(raw) || (/e/i.test(raw) && Number.isFinite(Number(raw)))
}

/**
 * Formats a raw value for the display: thousands separators in the integer
 * part, the fraction kept exactly as typed (so "1234." and "0.50" survive),
 * and exponent notation for values with more than 15 integer digits or that
 * already arrive in exponent form. Anything that is not a number, such as
 * "Error", is returned unchanged.
 */
export function formatDisplayValue(raw: string): string {
  if (!isNumeric(raw)) {
    return raw
  }
  if (/e/i.test(raw)) {
    return Number(raw).toExponential()
  }
  const negative = raw.startsWith('-')
  const [integer, fraction] = (negative ? raw.slice(1) : raw).split('.')
  if (integer.length > MAX_DISPLAY_DIGITS) {
    return Number(raw).toExponential()
  }
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`}`
}
