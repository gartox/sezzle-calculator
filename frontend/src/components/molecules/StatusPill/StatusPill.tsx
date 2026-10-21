import StatusDot, { type StatusTone } from '../../atoms/StatusDot/StatusDot'
import styles from './StatusPill.module.css'

const STATUS_LABELS: Record<StatusTone, string> = {
  ready: 'Ready',
  offline: 'Offline',
  checking: 'Checking',
}

interface StatusPillProps {
  status: StatusTone
}

/**
 * Whether the API is reachable, from GET /api/v1/health. The word carries the
 * meaning and the dot reinforces it, so color is never the only signal. It is
 * a polite status region, so a change to Offline is announced.
 */
function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={styles.pill} role="status" data-status={status}>
      <StatusDot tone={status} />
      {STATUS_LABELS[status]}
    </span>
  )
}

export default StatusPill
