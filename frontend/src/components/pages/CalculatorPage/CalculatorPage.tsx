import { useCallback, useEffect, useId, useState } from 'react'
import { calculate as apiCalculate } from '../../../api/client'
import { checkHealth as apiCheckHealth } from '../../../api/health'
import {
  type HistoryEntry,
  type HistoryStorage,
  addEntry,
  defaultStorage,
  loadHistory,
  saveHistory,
} from '../../../calculator/history'
import {
  actionForKey,
  activeOperator,
  canEquals,
  expressionOf,
  keyIdFor,
} from '../../../calculator/keypad'
import { type CalculateFn, useCalculator } from '../../../calculator/useCalculator'
import { useHealth } from '../../../calculator/useHealth'
import { formatDisplayValue } from '../../molecules/DisplayValue/formatDisplay'
import CalculatorHeader from '../../organisms/CalculatorHeader/CalculatorHeader'
import Display from '../../organisms/Display/Display'
import HistoryPanel from '../../organisms/HistoryPanel/HistoryPanel'
import Keypad, { type EqualsState } from '../../organisms/Keypad/Keypad'
import CalculatorTemplate from '../../templates/CalculatorTemplate/CalculatorTemplate'

/** How long a key typed on the keyboard shows its pressed state on screen. */
const PRESS_FLASH_MS = 150

export interface CalculatorPageProps {
  /** The API client; stories and tests pass a fake. */
  calculate?: CalculateFn
  /** The health check; stories and tests pass a fake. */
  checkHealth?: () => Promise<boolean>
  /** Where the history is kept; null keeps it in memory only. */
  storage?: HistoryStorage | null
  writeClipboard?: (text: string) => Promise<void>
}

/** True for a key event a focused control should handle itself. */
function belongsToControl(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
    return true
  // Enter and Space activate a focused button; do not press a second key.
  return (event.key === 'Enter' || event.key === ' ') && target.tagName === 'BUTTON'
}

/** The calculator: keypad state, API calls, history, health and keyboard. */
function CalculatorPage({
  calculate = apiCalculate,
  checkHealth = apiCheckHealth,
  storage,
  writeClipboard,
}: CalculatorPageProps) {
  const [store] = useState(() => (storage === undefined ? defaultStorage() : storage))
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory(store))
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const historyId = useId()
  const health = useHealth(checkHealth)
  const addToHistory = useCallback(
    (entry: HistoryEntry) => setHistory((h) => addEntry(h, entry)),
    [],
  )
  const { state, busy, press } = useCalculator({
    calculate,
    format: formatDisplayValue,
    onResult: addToHistory,
    onNetworkError: health.recheck,
  })

  useEffect(() => {
    saveHistory(store, history)
  }, [store, history])

  useEffect(() => {
    if (!pressedKey) return
    const timer = setTimeout(() => setPressedKey(null), PRESS_FLASH_MS)
    return () => clearTimeout(timer)
  }, [pressedKey])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (belongsToControl(event)) return
      if (event.key === 'Escape' && historyOpen) {
        setHistoryOpen(false)
        return
      }
      const action = actionForKey(event.key)
      if (!action) return
      event.preventDefault()
      press(action)
      setPressedKey(keyIdFor(action))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [historyOpen, press])

  const equals: EqualsState = busy
    ? 'busy'
    : canEquals(state) || state.pending
      ? 'ready'
      : 'inactive'

  return (
    <CalculatorTemplate
      header={<CalculatorHeader status={health.status} />}
      display={
        <Display
          expression={expressionOf(state, formatDisplayValue)}
          value={state.entry}
          error={state.error}
          busy={busy}
          announcement={state.announcement}
          writeClipboard={writeClipboard}
        />
      }
      keypad={
        <Keypad
          onPress={press}
          activeOperator={activeOperator(state)}
          equals={equals}
          pressedKey={pressedKey}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          historyOpen={historyOpen}
          historyId={historyId}
        />
      }
      history={
        <HistoryPanel
          id={historyId}
          entries={history}
          onSelect={(result) => {
            press({ type: 'useValue', value: result })
            setHistoryOpen(false)
          }}
          onClose={() => setHistoryOpen(false)}
        />
      }
      historyOpen={historyOpen}
      onCloseHistory={() => setHistoryOpen(false)}
    />
  )
}

export default CalculatorPage
