import type { ReactNode } from 'react'
import styles from './CalculatorTemplate.module.css'

interface CalculatorTemplateProps {
  header: ReactNode
  display: ReactNode
  keypad: ReactNode
  history: ReactNode
  /** On phones the history is a sheet; this opens it. Wide screens always show it. */
  historyOpen?: boolean
  onCloseHistory?: () => void
}

/**
 * The responsive layout: one card on phones with the history as a sheet over
 * it, and the history beside the card from 900 px.
 */
function CalculatorTemplate({
  header,
  display,
  keypad,
  history,
  historyOpen = false,
  onCloseHistory,
}: CalculatorTemplateProps) {
  return (
    <div className={styles.layout} data-history-open={historyOpen}>
      <div className={styles.calculator}>
        {header}
        {display}
        {keypad}
      </div>
      <div className={styles.backdrop} onClick={onCloseHistory} aria-hidden="true" />
      <div className={styles.history}>{history}</div>
    </div>
  )
}

export default CalculatorTemplate
