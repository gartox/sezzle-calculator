import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { calculate as apiCalculate } from '../../../api/client'
import { checkHealth as apiCheckHealth } from '../../../api/health'
import {
  type HistoryEntry,
  type HistoryStorage,
  addEntry,
  createEntry,
  defaultStorage,
  loadHistory,
  saveHistory,
} from '../../../calculator/history'
import {
  type HistoryRecord,
  activeOperator,
  announcementText,
  canEquals,
  canRetry,
  expressionOf,
  writeTokens,
} from '../../../calculator/keypad'
import { type CalculateFn, useCalculator } from '../../../calculator/useCalculator'
import { useHealth } from '../../../calculator/useHealth'
import { useKeyboardKeypad } from '../../../calculator/useKeyboardKeypad'
import { formatDisplayValue, spokenValue } from '../../molecules/DisplayValue/formatDisplay'
import CalculatorHeader from '../../organisms/CalculatorHeader/CalculatorHeader'
import Display from '../../organisms/Display/Display'
import HistoryPanel from '../../organisms/HistoryPanel/HistoryPanel'
import Keypad, { type EqualsState } from '../../organisms/Keypad/Keypad'
import CalculatorTemplate from '../../templates/CalculatorTemplate/CalculatorTemplate'
import { useMediaQuery } from '../../useMediaQuery'

/** From this width the history sits beside the calculator instead of in a sheet. */
const WIDE_LAYOUT = '(min-width: 900px)'

export interface CalculatorPageProps {
  /** The API client; stories and tests pass a fake. */
  calculate?: CalculateFn
  /** The health check; stories and tests pass a fake. */
  checkHealth?: () => Promise<boolean>
  /** Where the history is kept; null keeps it in memory only. */
  storage?: HistoryStorage | null
  writeClipboard?: (text: string) => Promise<void>
}

/** The calculator: wires the keypad state, API calls, history, health and keyboard together. */
function CalculatorPage({
  calculate = apiCalculate,
  checkHealth = apiCheckHealth,
  storage,
  writeClipboard,
}: CalculatorPageProps) {
  const [store] = useState(() => (storage === undefined ? defaultStorage() : storage))
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory(store))
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyId = useId()
  const historyToggle = useRef<HTMLButtonElement>(null)
  const wide = useMediaQuery(WIDE_LAYOUT)
  // On a wide screen there is no sheet to keep open, so widening closes it
  // (adjusted during render rather than in an effect).
  const [wasWide, setWasWide] = useState(wide)
  if (wide !== wasWide) {
    setWasWide(wide)
    if (wide) setHistoryOpen(false)
  }
  const sheetOpen = historyOpen && !wide
  const health = useHealth(checkHealth)

  const addToHistory = useCallback((record: HistoryRecord) => {
    const expression = `${writeTokens(record.tokens, formatDisplayValue)} =`
    setHistory((entries) => addEntry(entries, createEntry(expression, record.result)))
  }, [])
  const { state, busy, press } = useCalculator({
    calculate,
    onResult: addToHistory,
    onSuccess: health.reportSuccess,
    onNetworkError: health.recheck,
  })
  const closeHistory = useCallback(() => setHistoryOpen(false), [])
  const { pressedKey } = useKeyboardKeypad({
    press,
    paused: sheetOpen,
    onPausedEscape: closeHistory,
  })

  useEffect(() => {
    saveHistory(store, history)
  }, [store, history])

  // However the sheet closes, focus goes back to the toggle that opened it.
  const sheetWasOpen = useRef(false)
  useEffect(() => {
    if (sheetWasOpen.current && !sheetOpen && !wide) historyToggle.current?.focus()
    sheetWasOpen.current = sheetOpen
  }, [sheetOpen, wide])

  const equals: EqualsState = busy
    ? 'busy'
    : canEquals(state) || canRetry(state) || state.pending
      ? 'ready'
      : 'inactive'
  const error = state.error && { ...state.error, retryable: canRetry(state) }

  return (
    <CalculatorTemplate
      header={<CalculatorHeader status={health.status} />}
      display={
        <Display
          expression={expressionOf(state, formatDisplayValue)}
          value={state.entry}
          error={error}
          busy={busy}
          announcement={state.announcement ? announcementText(state.announcement, spokenValue) : ''}
          announcementId={state.announcement?.seq}
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
          historyOpen={sheetOpen}
          historyId={historyId}
          historyToggleRef={historyToggle}
        />
      }
      history={
        <HistoryPanel
          id={historyId}
          entries={history}
          onSelect={(result) => {
            press({ type: 'useValue', value: result })
            closeHistory()
          }}
          modal={sheetOpen}
          onClose={closeHistory}
        />
      }
      historyOpen={sheetOpen}
      onCloseHistory={closeHistory}
    />
  )
}

export default CalculatorPage
