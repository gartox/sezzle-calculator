import { useLayoutEffect, useRef, useState } from 'react'
import { contrastRatio } from './contrast'
import styles from './Foundations.module.css'

/** Reads the resolved value of CSS custom properties at this element. */
function useResolvedTokens(names: readonly string[]) {
  const ref = useRef<HTMLDivElement>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const key = names.join('|')
  useLayoutEffect(() => {
    if (!ref.current) {
      return
    }
    const style = getComputedStyle(ref.current)
    setValues(Object.fromEntries(key.split('|').map((n) => [n, style.getPropertyValue(n).trim()])))
  }, [key])
  return { ref, values }
}

const COLOR_TOKENS = [
  ['--color-surface-page', 'Page background'],
  ['--color-surface-card', 'Card'],
  ['--color-surface-display', 'Display'],
  ['--color-text', 'Text'],
  ['--color-text-muted', 'Muted text'],
  ['--color-key-digit', 'Digit key'],
  ['--color-key-function', 'Function key'],
  ['--color-key-utility', 'Utility key'],
  ['--color-accent', 'Accent: operators and equals'],
  ['--color-accent-soft', 'Active operator'],
  ['--color-key-inactive', 'Inactive key'],
  ['--color-success', 'Ready'],
  ['--color-danger', 'Error and offline'],
  ['--color-focus', 'Focus ring'],
] as const

const CONTRAST_PAIRS = [
  ['--color-text', '--color-surface-page', 'Text on the page'],
  ['--color-text', '--color-surface-card', 'Text on the card'],
  ['--color-text', '--color-surface-display', 'Value on the display'],
  ['--color-text-muted', '--color-surface-display', 'Expression line'],
  ['--color-text-muted', '--color-surface-card', 'Muted text on the card'],
  ['--color-key-text', '--color-key-digit', 'Digit key label'],
  ['--color-key-text', '--color-key-function', 'Function key label'],
  ['--color-key-text', '--color-key-utility', 'Utility key label'],
  ['--color-on-accent', '--color-accent', 'Operator and equals label'],
  ['--color-on-accent-soft', '--color-accent-soft', 'Active operator label'],
  ['--color-on-key-inactive', '--color-key-inactive', 'Inactive equals label'],
  ['--color-danger', '--color-surface-display', 'Error message'],
  ['--color-success', '--color-surface-card', 'Ready label'],
] as const

const SPACING = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-7',
]
const TYPE_SCALE = [
  ['--font-size-xs', 'Ref and hints'],
  ['--font-size-sm', 'Expression line'],
  ['--font-size-md', 'Body'],
  ['--font-size-lg', 'Keys'],
  ['--font-size-xl', 'Headings'],
  ['--font-size-display-sm', 'Value, longest'],
  ['--font-size-display-md', 'Value, long'],
  ['--font-size-display-lg', 'Value, medium'],
  ['--font-size-display-xl', 'Value, short'],
] as const
const RADII = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-pill']
const MOTION = [
  '--motion-duration-fast',
  '--motion-duration-normal',
  '--motion-easing',
  '--motion-press-scale',
]

export function ColorTokens() {
  const { ref, values } = useResolvedTokens(COLOR_TOKENS.map(([n]) => n))
  return (
    <section ref={ref} className={styles.section}>
      <h2 className={styles.heading}>Color</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Swatch</th>
            <th scope="col">Token</th>
            <th scope="col">Value</th>
            <th scope="col">Used for</th>
          </tr>
        </thead>
        <tbody>
          {COLOR_TOKENS.map(([name, use]) => (
            <tr key={name}>
              <td>
                <span
                  className={styles.swatch}
                  style={{ background: `var(${name})` }}
                  aria-hidden
                />
              </td>
              <td className={styles.code}>{name}</td>
              <td className={styles.code}>{values[name]}</td>
              <td>{use}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function ContrastPairs() {
  const names = [...new Set(CONTRAST_PAIRS.flatMap(([fg, bg]) => [fg, bg]))]
  const { ref, values } = useResolvedTokens(names)
  return (
    <section ref={ref} className={styles.section}>
      <h2 className={styles.heading}>Contrast</h2>
      <p className={styles.note}>
        Ratios are computed in the browser from the resolved tokens of this theme. WCAG AA needs
        4.5:1 for text.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Sample</th>
            <th scope="col">Pair</th>
            <th scope="col">Ratio</th>
          </tr>
        </thead>
        <tbody>
          {CONTRAST_PAIRS.map(([fg, bg, use]) => {
            const ratio = contrastRatio(values[fg] ?? '', values[bg] ?? '')
            return (
              <tr key={`${fg}-${bg}`}>
                <td>
                  <span
                    className={styles.sample}
                    style={{ color: `var(${fg})`, background: `var(${bg})` }}
                  >
                    {use}
                  </span>
                </td>
                <td className={styles.code}>
                  {fg} on {bg}
                </td>
                <td className={styles.ratio}>
                  {ratio === null
                    ? '…'
                    : `${ratio.toFixed(2)}:1 ${ratio >= 4.5 ? 'AA' : 'below AA'}`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

export function SpacingScale() {
  const { ref, values } = useResolvedTokens(SPACING)
  return (
    <section ref={ref} className={styles.section}>
      <h2 className={styles.heading}>Spacing</h2>
      <table className={styles.table}>
        <tbody>
          {SPACING.map((name) => (
            <tr key={name}>
              <td className={styles.code}>{name}</td>
              <td className={styles.code}>{values[name]}</td>
              <td style={{ width: '60%' }}>
                <div className={styles.bar} style={{ width: `var(${name})` }} aria-hidden />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function TypeScale() {
  const { ref, values } = useResolvedTokens(TYPE_SCALE.map(([n]) => n))
  return (
    <section ref={ref} className={styles.section}>
      <h2 className={styles.heading}>Typography</h2>
      <p className={styles.note}>
        System font stack; numbers use tabular figures so digits line up.
      </p>
      <table className={styles.table}>
        <tbody>
          {TYPE_SCALE.map(([name, use]) => (
            <tr key={name}>
              <td className={styles.code}>
                {name} ({values[name]})
              </td>
              <td style={{ fontSize: `var(${name})`, fontVariantNumeric: 'tabular-nums' }}>
                1,234.56
              </td>
              <td>{use}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function RadiusScale() {
  const { ref, values } = useResolvedTokens(RADII)
  return (
    <section ref={ref} className={styles.section}>
      <h2 className={styles.heading}>Radius</h2>
      <table className={styles.table}>
        <tbody>
          {RADII.map((name) => (
            <tr key={name}>
              <td className={styles.code}>{name}</td>
              <td className={styles.code}>{values[name]}</td>
              <td>
                <div
                  className={styles.radiusBox}
                  style={{ borderRadius: `var(${name})` }}
                  aria-hidden
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function MotionTokens() {
  const { ref, values } = useResolvedTokens(MOTION)
  return (
    <section ref={ref} className={styles.section}>
      <h2 className={styles.heading}>Motion</h2>
      <p className={styles.note}>
        Durations drop to 0 ms and the press scale to 1 when the system asks for reduced motion.
      </p>
      <table className={styles.table}>
        <tbody>
          {MOTION.map((name) => (
            <tr key={name}>
              <td className={styles.code}>{name}</td>
              <td className={styles.code}>{values[name]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <button type="button" className={styles.motionDemo}>
          7
        </button>{' '}
        <span className={styles.note}>Press to see the key feedback.</span>
      </div>
    </section>
  )
}

export function Foundations() {
  return (
    <div className={styles.page}>
      <ColorTokens />
      <ContrastPairs />
      <SpacingScale />
      <TypeScale />
      <RadiusScale />
      <MotionTokens />
    </div>
  )
}
