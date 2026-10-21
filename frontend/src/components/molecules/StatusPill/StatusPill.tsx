import StatusDot, { type StatusTone } from '../../atoms/StatusDot/StatusDot'
import VisuallyHidden from '../../atoms/VisuallyHidden/VisuallyHidden'
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
 * meaning and the dot reinforces it, so color is never the only signal. The
 * pill itself is not a live region, so loading the page announces nothing;
 * only a change to Offline is announced, through a polite region that is
 * always present so the change is heard.
 */
function StatusPill({ status }: StatusPillProps) {
  return (
    <>
      <span className={styles.pill} data-status={status}>
        <StatusDot tone={status} />
        {STATUS_LABELS[status]}
      </span>
      <VisuallyHidden aria-live="polite">
        {status === 'offline' ? 'The calculator service is offline.' : ''}
      </VisuallyHidden>
    </>
  )
}

export default StatusPill
