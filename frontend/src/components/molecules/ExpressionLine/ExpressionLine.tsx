import styles from './ExpressionLine.module.css'

interface ExpressionLineProps {
  /** What has been entered so far, with real symbols: "2 + 3 ×", "15 % of 200 =". */
  expression: string
}

/**
 * The small line above the value. It keeps its height when empty so the
 * display does not jump. A line too long to fit is clipped at its start, with
 * an ellipsis there, so the part just typed always stays visible.
 */
function ExpressionLine({ expression }: ExpressionLineProps) {
  return (
    <p className={styles.line} data-empty={expression === '' || undefined}>
      <span className={styles.text}>{expression || ' '}</span>
    </p>
  )
}

export default ExpressionLine
