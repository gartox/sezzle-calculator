import { type KeyboardEvent, useEffect, useId, useRef } from 'react'
import type { HistoryEntry } from '../../../calculator/history'
import HistoryItem from '../../molecules/HistoryItem/HistoryItem'
import styles from './HistoryPanel.module.css'

interface HistoryPanelProps {
  id?: string
  entries: HistoryEntry[]
  /** Called with the raw result of the chosen entry. */
  onSelect: (result: string) => void
  /**
   * The phone sheet: a modal dialog that takes focus when it opens and offers
   * Close. Beside the calculator on wide screens it is an ordinary group.
   */
  modal?: boolean
  onClose?: () => void
}

/** The last results, newest first. Choosing one reuses its result. */
function HistoryPanel({ id, entries, onSelect, modal = false, onClose }: HistoryPanelProps) {
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (modal) heading.current?.focus()
  }, [modal])

  // As a dialog, Tab and Shift+Tab cycle through its buttons and never leave it.
  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!modal || event.key !== 'Tab') return
    const buttons = [...event.currentTarget.querySelectorAll('button')]
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    const active = document.activeElement
    if (!first) {
      event.preventDefault()
    } else if (event.shiftKey && (active === first || active === heading.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      id={id}
      className={styles.panel}
      role={modal ? 'dialog' : 'group'}
      aria-modal={modal || undefined}
      aria-labelledby={headingId}
      onKeyDown={trapFocus}
    >
      <div className={styles.head}>
        <h2 id={headingId} ref={heading} className={styles.title} tabIndex={modal ? -1 : undefined}>
          History
        </h2>
        {modal && onClose && (
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
          {entries.map((entry) => (
            <li key={entry.id}>
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
