import type { ComponentPropsWithoutRef } from 'react'
import styles from './VisuallyHidden.module.css'

/** Text for assistive technology only, such as a live announcement. */
function VisuallyHidden({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return <span className={[styles.hidden, className].filter(Boolean).join(' ')} {...props} />
}

export default VisuallyHidden
