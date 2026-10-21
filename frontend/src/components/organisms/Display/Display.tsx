import VisuallyHidden from '../../atoms/VisuallyHidden/VisuallyHidden'
import DisplayValue from '../../molecules/DisplayValue/DisplayValue'
import ErrorNotice from '../../molecules/ErrorNotice/ErrorNotice'
import ExpressionLine from '../../molecules/ExpressionLine/ExpressionLine'
import styles from './Display.module.css'

export interface DisplayError {
  message: string
  requestId?: string
  /** Pressing equals sends the failed calculation again. */
  retryable?: boolean
}

/** Shown under an error that equals can retry. */
export const RETRY_HINT = 'Press = to try again.'

interface DisplayProps {
  /** What has been entered, already formatted: "15 % of 200". */
  expression: string
  /** The raw current value: "30", "-12.5". */
  value: string
  /** When set, replaces the value; the expression stays so the user sees what failed. */
  error?: DisplayError | null
  /** A calculation has taken longer than the busy delay. */
  busy?: boolean
  /** Text announced politely, such as "2 plus 3 equals 5". */
  announcement?: string
  /**
   * Changes with every announcement. A live region only speaks when its text
   * changes, so the text alternates a trailing no-break space to repeat itself.
   */
  announcementId?: number
  writeClipboard?: (text: string) => Promise<void>
}

/** The expression line, the value (or the error) and the result announcement. */
function Display({
  expression,
  value,
  error = null,
  busy = false,
  announcement = '',
  announcementId = 0,
  writeClipboard,
}: DisplayProps) {
  return (
    <div className={styles.display} role="group" aria-label="Display" aria-busy={busy || undefined}>
      <ExpressionLine expression={expression} />
      {error ? (
        <ErrorNotice
          message={error.message}
          requestId={error.requestId}
          hint={error.retryable ? RETRY_HINT : undefined}
          writeClipboard={writeClipboard}
        />
      ) : (
        <DisplayValue value={value} writeClipboard={writeClipboard} />
      )}
      <VisuallyHidden aria-live="polite">
        {announcement && `${announcement}${announcementId % 2 ? '\u00a0' : ''}`}
      </VisuallyHidden>
    </div>
  )
}

export default Display
