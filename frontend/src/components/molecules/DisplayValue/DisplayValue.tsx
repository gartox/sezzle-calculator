import { useEffect, useState, type CSSProperties } from 'react'
import VisuallyHidden from '../../atoms/VisuallyHidden/VisuallyHidden'
import styles from './DisplayValue.module.css'
import { displayWidth, formatDisplayValue, isNumeric } from './formatDisplay'

type Feedback = 'copied' | 'failed' | null

const FEEDBACK_TEXT: Record<Exclude<Feedback, null>, string> = {
  copied: 'Copied',
  failed: 'Copy failed',
}

function writeToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard) {
    return Promise.reject(new Error('Clipboard unavailable'))
  }
  return navigator.clipboard.writeText(text)
}

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
 * short confirmation that is also announced politely.
 */
function DisplayValue({
  value,
  writeClipboard = writeToClipboard,
  feedbackMs = 1600,
}: DisplayValueProps) {
  const formatted = formatDisplayValue(value)
  const [feedback, setFeedback] = useState<Feedback>(null)

  useEffect(() => {
    if (!feedback) {
      return
    }
    const timer = setTimeout(() => setFeedback(null), feedbackMs)
    return () => clearTimeout(timer)
  }, [feedback, feedbackMs])

  async function copy() {
    try {
      await writeClipboard(value)
      setFeedback('copied')
    } catch {
      setFeedback('failed')
    }
  }

  const style = { '--chars': displayWidth(formatted) } as CSSProperties
  const message = feedback ? FEEDBACK_TEXT[feedback] : ''

  return (
    <div className={styles.wrap}>
      {isNumeric(value) ? (
        <button
          type="button"
          className={styles.value}
          style={style}
          onClick={copy}
          aria-label={`${formatted}, copy`}
        >
          {formatted}
        </button>
      ) : (
        <span className={styles.value} style={style}>
          {formatted}
        </span>
      )}
      <span className={styles.feedback} data-visible={feedback !== null} aria-hidden="true">
        {message || ' '}
      </span>
      <VisuallyHidden aria-live="polite">{message}</VisuallyHidden>
    </div>
  )
}

export default DisplayValue
