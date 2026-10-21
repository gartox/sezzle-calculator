import styles from './ExpressionLine.module.css'

interface ExpressionLineProps {
  /** What has been entered so far, with real symbols: "2 + 3 ×", "15 % of 200 =". */
  expression: string
}

/**
 * The small line above the value. It keeps its height when empty so the
 * display does not jump, and truncates the start of very long expressions.
 */
function ExpressionLine({ expression }: ExpressionLineProps) {
  return (
    <p className={styles.line} data-empty={expression === '' || undefined}>
      {expression || ' '}
    </p>
  )
}

export default ExpressionLine
