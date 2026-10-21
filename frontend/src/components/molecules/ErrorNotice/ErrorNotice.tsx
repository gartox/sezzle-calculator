import styles from './ErrorNotice.module.css'

interface ErrorNoticeProps {
  /** The plain explanation from the API, such as "Cannot divide by zero." */
  message: string
  /** The request ID from the error envelope, quoted when reporting a problem. */
  requestId?: string
}

/**
 * Replaces the value when a calculation fails. It is an alert, so screen
 * readers announce it at once; the Ref lets support find the exact request.
 */
function ErrorNotice({ message, requestId }: ErrorNoticeProps) {
  return (
    <div className={styles.notice} role="alert">
      <span>{message}</span>
      {requestId && (
        <span className={styles.ref}>
          Ref <span className={styles.code}>{requestId}</span>
        </span>
      )}
    </div>
  )
}

export default ErrorNotice
