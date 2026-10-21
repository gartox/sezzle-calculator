import styles from './StatusDot.module.css'

export type StatusTone = 'ready' | 'offline' | 'checking'

interface StatusDotProps {
  tone: StatusTone
}

/** A small colored dot. Decorative: the text next to it carries the meaning. */
function StatusDot({ tone }: StatusDotProps) {
  return <span className={`${styles.dot} ${styles[tone]}`} aria-hidden="true" data-tone={tone} />
}

export default StatusDot
