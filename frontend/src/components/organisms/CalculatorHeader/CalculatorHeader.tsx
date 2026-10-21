import type { StatusTone } from '../../atoms/StatusDot/StatusDot'
import StatusPill from '../../molecules/StatusPill/StatusPill'
import styles from './CalculatorHeader.module.css'

interface CalculatorHeaderProps {
  /** The API status from its health check. */
  status: StatusTone
}

/**
 * The product name and whether the API is reachable. A plain div, not a
 * <header>: outside main a header is a banner landmark, and the page has one.
 */
function CalculatorHeader({ status }: CalculatorHeaderProps) {
  return (
    <div className={styles.header}>
      <h1 className={styles.title}>Calculator</h1>
      <StatusPill status={status} />
    </div>
  )
}

export default CalculatorHeader
