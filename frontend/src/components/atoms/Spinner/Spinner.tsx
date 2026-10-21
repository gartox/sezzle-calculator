import styles from './Spinner.module.css'

interface SpinnerProps {
  /** Diameter in pixels. */
  size?: number
}

/** A rotating ring. Decorative: pair it with aria-busy on the busy control. */
function Spinner({ size = 18 }: SpinnerProps) {
  return (
    <span className={styles.spinner} style={{ width: size, height: size }} aria-hidden="true" />
  )
}

export default Spinner
