/** Validates one raw input value and returns a message, or undefined when valid. */
export function validateNumber(raw: string): string | undefined {
  if (raw.trim() === '') {
    return 'Enter a number.'
  }
  if (!Number.isFinite(Number(raw))) {
    return 'Enter a valid number.'
  }
  return undefined
}
