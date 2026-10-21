import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import Spinner from '../Spinner/Spinner'
import styles from './Key.module.css'

export type KeyVariant = 'digit' | 'operator' | 'function' | 'utility' | 'equals'

export interface KeyProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'onClick' | 'name'
> {
  /** What the key shows: a digit, a symbol or an icon. */
  label: ReactNode
  /**
   * The accessible name, such as "multiply" or "7". When the label is text
   * rather than a symbol, the name must contain it (WCAG 2.5.3, label in
   * name) so voice control users can say what they see: "AC, all clear".
   */
  name: string
  variant?: KeyVariant
  /**
   * For operators: whether this operator is the one waiting for its second
   * operand. Sets aria-pressed, so leave it undefined on keys that do not toggle.
   */
  active?: boolean
  /** Shows the pressed look, used when the key was typed on the keyboard. */
  pressed?: boolean
  /** Shows a spinner and ignores presses while a result is on its way. */
  busy?: boolean
  /** Looks quieter and ignores presses, for example equals with nothing to calculate. */
  inactive?: boolean
  /** Spans two columns of the keypad grid. */
  wide?: boolean
  onPress?: () => void
}

/** One calculator key. Every variant is a real button with an accessible name. */
function Key({
  label,
  name,
  variant = 'digit',
  active,
  pressed = false,
  busy = false,
  inactive = false,
  wide = false,
  onPress,
  className,
  ...buttonProps
}: KeyProps) {
  const classes = [styles.key, styles[variant], wide && styles.wide, className]
    .filter(Boolean)
    .join(' ')

  function handleClick() {
    if (busy || inactive) {
      return
    }
    onPress?.()
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={name}
      aria-pressed={active}
      aria-busy={busy || undefined}
      aria-disabled={inactive || undefined}
      data-pressed={pressed || undefined}
      data-variant={variant}
      onClick={handleClick}
      {...buttonProps}
    >
      {busy ? <Spinner /> : <span className={styles.label}>{label}</span>}
    </button>
  )
}

export default Key
