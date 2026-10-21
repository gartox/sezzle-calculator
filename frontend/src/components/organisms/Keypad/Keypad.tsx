import type { ReactNode } from 'react'
import type { BinaryOperator, KeypadAction } from '../../../calculator/keypad'
import Icon from '../../atoms/Icon/Icon'
import Key, { type KeyVariant } from '../../atoms/Key/Key'
import styles from './Keypad.module.css'

interface KeyDef {
  id: string
  label: ReactNode
  name: string
  variant: KeyVariant
  action: KeypadAction
  operator?: BinaryOperator
  className?: string
}

const digit = (d: string): KeyDef => ({
  id: `digit-${d}`,
  label: d,
  name: d,
  variant: 'digit',
  action: { type: 'digit', digit: d },
})

const operator = (
  op: BinaryOperator,
  label: string,
  name: string,
  variant: KeyVariant = 'operator',
): KeyDef => ({
  id: `operator-${op}`,
  label,
  name,
  variant,
  action: { type: 'operator', operator: op },
  operator: op,
})

const FUNCTION_KEYS: KeyDef[] = [
  {
    id: 'sqrt',
    label: '√x',
    name: 'square root of x',
    variant: 'function',
    action: { type: 'sqrt' },
  },
  {
    // Visible text reads "xy", so the name starts with it (WCAG 2.5.3).
    ...operator('power', '', 'xy, power', 'function'),
    label: (
      <>
        x<sup>y</sup>
      </>
    ),
    className: styles.power,
  },
]

// Four equal columns, equals bottom right with backspace beside it.
const GRID_KEYS: KeyDef[] = [
  {
    id: 'clear',
    label: 'AC',
    name: 'AC, all clear',
    variant: 'utility',
    action: { type: 'clear' },
  },
  {
    id: 'toggleSign',
    label: '±',
    name: 'toggle sign',
    variant: 'utility',
    action: { type: 'toggleSign' },
  },
  operator('percent', '%', 'percent of', 'utility'),
  operator('divide', '÷', 'divide'),
  digit('7'),
  digit('8'),
  digit('9'),
  operator('multiply', '×', 'multiply'),
  digit('4'),
  digit('5'),
  digit('6'),
  operator('subtract', '−', 'subtract'),
  digit('1'),
  digit('2'),
  digit('3'),
  operator('add', '+', 'add'),
  digit('0'),
  {
    id: 'decimal',
    label: '.',
    name: 'decimal point',
    variant: 'digit',
    action: { type: 'decimal' },
  },
  {
    id: 'backspace',
    label: <Icon name="backspace" />,
    name: 'backspace',
    variant: 'utility',
    action: { type: 'backspace' },
  },
]

export type EqualsState = 'ready' | 'inactive' | 'busy'

interface KeypadProps {
  onPress: (action: KeypadAction) => void
  /** The operator waiting for its right operand, marked pressed. */
  activeOperator?: BinaryOperator | null
  equals?: EqualsState
  /** The key just typed on the keyboard, flashed as pressed. */
  pressedKey?: string | null
  onToggleHistory?: () => void
  historyOpen?: boolean
  /** The id of the history panel the toggle controls. */
  historyId?: string
}

/** The function row and the 4-column keypad. Every key is a named button. */
function Keypad({
  onPress,
  activeOperator = null,
  equals = 'inactive',
  pressedKey = null,
  onToggleHistory,
  historyOpen = false,
  historyId,
}: KeypadProps) {
  const render = (key: KeyDef) => (
    <Key
      key={key.id}
      label={key.label}
      name={key.name}
      variant={key.variant}
      className={key.className}
      active={key.operator ? activeOperator === key.operator : undefined}
      pressed={pressedKey === key.id}
      onPress={() => onPress(key.action)}
      data-key={key.id}
    />
  )
  return (
    <div className={styles.keypad} role="group" aria-label="Keypad">
      <div className={styles.functions}>
        {FUNCTION_KEYS.map(render)}
        <Key
          label={
            <>
              <Icon name="history" size={18} /> History
            </>
          }
          name="History"
          variant="function"
          className={styles.historyToggle}
          aria-expanded={historyOpen}
          aria-controls={historyId}
          onPress={onToggleHistory}
        />
      </div>
      <div className={styles.grid}>
        {GRID_KEYS.map(render)}
        <Key
          label="="
          name="equals"
          variant="equals"
          inactive={equals === 'inactive'}
          busy={equals === 'busy'}
          pressed={pressedKey === 'equals'}
          onPress={() => onPress({ type: 'equals' })}
          data-key="equals"
        />
      </div>
    </div>
  )
}

export default Keypad
