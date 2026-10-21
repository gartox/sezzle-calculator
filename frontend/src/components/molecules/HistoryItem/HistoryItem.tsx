import VisuallyHidden from '../../atoms/VisuallyHidden/VisuallyHidden'
import { formatDisplayValue } from '../DisplayValue/formatDisplay'
import styles from './HistoryItem.module.css'

interface HistoryItemProps {
  /** The completed expression, such as "15 % of 200 =". */
  expression: string
  /** The raw result, such as "30". */
  result: string
  /** Called with the raw result to reuse it as the current value. */
  onSelect: (result: string) => void
}

/**
 * One past calculation. Choosing it puts its result back on the display. The
 * button is named by its visible text, prefixed with "Use", so the name always
 * contains what is on screen.
 */
function HistoryItem({ expression, result, onSelect }: HistoryItemProps) {
  return (
    <button type="button" className={styles.item} onClick={() => onSelect(result)}>
      <span className={styles.expression}>
        <VisuallyHidden>Use</VisuallyHidden> {expression}
      </span>{' '}
      <span className={styles.result}>{formatDisplayValue(result)}</span>
    </button>
  )
}

export default HistoryItem
