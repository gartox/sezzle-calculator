import { useId } from 'react'
import type { HistoryEntry } from '../../../calculator/history'
import HistoryItem from '../../molecules/HistoryItem/HistoryItem'
import styles from './HistoryPanel.module.css'

interface HistoryPanelProps {
  id?: string
  entries: HistoryEntry[]
  /** Called with the raw result of the chosen entry. */
  onSelect: (result: string) => void
  /** Shows a Close button, for the phone sheet. */
  onClose?: () => void
}

/** The last results, newest first. Choosing one reuses its result. */
function HistoryPanel({ id, entries, onSelect, onClose }: HistoryPanelProps) {
  const headingId = useId()
  return (
    <div id={id} className={styles.panel} role="group" aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          History
        </h2>
        {onClose && (
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close history"
          >
            Close
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className={styles.empty}>No calculations yet.</p>
      ) : (
        <ol className={styles.list}>
          {entries.map((entry, index) => (
            <li key={`${index}-${entry.expression}`}>
              <HistoryItem
                expression={entry.expression}
                result={entry.result}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default HistoryPanel
