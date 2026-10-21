import styles from './Icon.module.css'

export type IconName = 'backspace' | 'history' | 'copy'

interface IconProps {
  name: IconName
  /** Width and height in pixels. */
  size?: number
}

const PATHS: Record<IconName, string> = {
  backspace: 'M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7Z M12 9l6 6 M18 9l-6 6',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 7v5l3 2',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
}

/**
 * An inline SVG that follows the text color. Always decorative: the control
 * that contains it supplies the accessible name.
 */
function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      className={styles.icon}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

export default Icon
