// Formatting for the calculator display. The text sent to the API is never
// formatted; grouping and exponent notation are for reading only.

const PLAIN_NUMBER = /^-?\d+(\.\d*)?$/

/** Integer digits beyond this switch the display to exponent notation. */
export const MAX_DISPLAY_DIGITS = 15

/** Whether raw is a number the user can copy, as typed or as returned. */
export function isNumeric(raw: string): boolean {
  return PLAIN_NUMBER.test(raw) || (/e/i.test(raw) && Number.isFinite(Number(raw)))
}

/** The typographic minus sign, U+2212, used for display only. */
export const MINUS = '\u2212'

const SUPERSCRIPT: Record<string, string> = {
  '0': '\u2070',
  '1': '\u00b9',
  '2': '\u00b2',
  '3': '\u00b3',
  '4': '\u2074',
  '5': '\u2075',
  '6': '\u2076',
  '7': '\u2077',
  '8': '\u2078',
  '9': '\u2079',
  '-': '\u207b',
}

function withMinus(text: string): string {
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text
}

/** 1.23456789012e+17 becomes 1.23456789012 × 10¹⁷. */
function scientific(value: number): string {
  const [mantissa, exponent] = value.toExponential().split('e')
  const power = String(Number(exponent))
  const superscript = [...power].map((char) => SUPERSCRIPT[char]).join('')
  return `${withMinus(mantissa)} × 10${superscript}`
}

/**
 * Formats a raw value for the display: the typographic minus sign, thousands
 * separators in the integer part, the fraction kept exactly as typed (so
 * "1234." and "0.50" survive), and scientific notation (mantissa × 10 with a
 * superscript exponent) for values with more than 15 integer digits or that
 * arrive in exponent form. Anything that is not a number, such as "Error", is
 * returned unchanged. Display only: the value sent to the API stays raw.
 */
export function formatDisplayValue(raw: string): string {
  if (!isNumeric(raw)) {
    return raw
  }
  if (/e/i.test(raw)) {
    return scientific(Number(raw))
  }
  const negative = raw.startsWith('-')
  const [integer, fraction] = (negative ? raw.slice(1) : raw).split('.')
  if (integer.length > MAX_DISPLAY_DIGITS) {
    return scientific(Number(raw))
  }
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? MINUS : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`}`
}

/**
 * The width of formatted text in digit widths, for shrink to fit. Tabular
 * digits, letters and signs count as one; the thousands separator and the
 * decimal point count as half.
 */
export function displayWidth(formatted: string): number {
  let width = 0
  for (const char of formatted) {
    width += char === ',' || char === '.' ? 0.5 : 1
  }
  return Math.max(Math.round(width * 100) / 100, 1)
}
