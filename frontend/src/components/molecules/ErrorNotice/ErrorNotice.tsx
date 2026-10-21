import VisuallyHidden from '../../atoms/VisuallyHidden/VisuallyHidden'
import { useCopyFeedback, writeToClipboard } from '../../useCopyFeedback'
import styles from './ErrorNotice.module.css'

/** How many characters of the request ID the notice shows. */
const SHORT_REF = 8

interface ErrorNoticeProps {
  /** The plain explanation from the API, such as "Cannot divide by zero." */
  message: string
  /** The request ID from the error envelope, quoted when reporting a problem. */
  requestId?: string
  /** A next step shown under the message, such as "Press = to try again." */
  hint?: string
  /** Writes text to the clipboard. Defaults to the browser clipboard. */
  writeClipboard?: (text: string) => Promise<void>
}

/**
 * Replaces the value when a calculation fails. It is an alert, so screen
 * readers announce it at once. The Ref shows the first characters of the
 * request ID; activating it copies the whole ID for support. Its accessible
 * name starts with the visible text, so voice control matches it, and then
 * carries the whole ID.
 */
function ErrorNotice({
  message,
  requestId,
  hint,
  writeClipboard = writeToClipboard,
}: ErrorNoticeProps) {
  const { feedback, message: copyMessage, copy } = useCopyFeedback(writeClipboard)
  return (
    <div className={styles.notice} role="alert">
      <span>{message}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
      {requestId && (
        <span className={styles.refRow}>
          <button
            type="button"
            className={styles.ref}
            onClick={() => copy(requestId)}
            aria-label={`Ref ${requestId.slice(0, SHORT_REF)}, full ID ${requestId}, copy`}
          >
            Ref <span className={styles.code}>{requestId.slice(0, SHORT_REF)}</span>
          </button>
          <span className={styles.feedback} data-visible={feedback !== null} aria-hidden="true">
            {copyMessage || '\u00a0'}
          </span>
          <VisuallyHidden aria-live="polite">{copyMessage}</VisuallyHidden>
        </span>
      )}
    </div>
  )
}

export default ErrorNotice
