import type { CSSProperties } from 'react'
import Icon from '../../atoms/Icon/Icon'
import VisuallyHidden from '../../atoms/VisuallyHidden/VisuallyHidden'
import { useCopyFeedback, writeToClipboard } from '../../useCopyFeedback'
import styles from './DisplayValue.module.css'
import { displayWidth, formatDisplayValue, isNumeric, spokenValue } from './formatDisplay'

interface DisplayValueProps {
  /** The raw value, as typed or as returned by the API: "1234.5", "Error". */
  value: string
  /** Writes text to the clipboard. Defaults to the browser clipboard. */
  writeClipboard?: (text: string) => Promise<void>
  /** How long the confirmation stays visible, in milliseconds. */
  feedbackMs?: number
}

/**
 * The large current value. It is grouped for reading, shrinks to fit its
 * container, and, when it is a number, copies the raw value on click with a
 * short confirmation that is also announced politely. A small copy icon under
 * it shows that it can be copied. Its accessible name is the value as spoken:
 * "minus 5", or for exponent form the visible text followed by "1.5 times 10
 * to the power of 17".
 */
function DisplayValue({
  value,
  writeClipboard = writeToClipboard,
  feedbackMs = 1600,
}: DisplayValueProps) {
  const formatted = formatDisplayValue(value)
  const copyable = isNumeric(value)
  // Exponent form is read as superscript digits, so the spoken form follows
  // the visible text, which must start the name (WCAG 2.5.3, label in name).
  const spoken = spokenValue(value)
  const label = formatted.includes('×') ? `${formatted}, ${spoken}` : spoken
  const { feedback, message, copy } = useCopyFeedback(writeClipboard, feedbackMs)

  const style = { '--chars': displayWidth(formatted) } as CSSProperties

  return (
    <div className={styles.wrap}>
      {copyable ? (
        <button
          type="button"
          className={styles.value}
          style={style}
          onClick={() => copy(value)}
          aria-label={`${label}, copy`}
        >
          {formatted}
        </button>
      ) : (
        <span className={styles.value} style={style}>
          {formatted}
        </span>
      )}
      <span className={styles.feedback} data-visible={feedback !== null} aria-hidden="true">
        {message || (copyable ? <Icon name="copy" size={14} /> : ' ')}
      </span>
      <VisuallyHidden aria-live="polite">{message}</VisuallyHidden>
    </div>
  )
}

export default DisplayValue
