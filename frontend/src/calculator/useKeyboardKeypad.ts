import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type KeypadAction, actionForKey, keyIdFor } from './keypad'

/** How long a key typed on the keyboard shows its pressed state on screen. */
export const PRESS_FLASH_MS = 150

interface Options {
  press: (action: KeypadAction) => void
  /** While a modal (the phone history sheet) is open, keys go to it, not the keypad. */
  paused?: boolean
  /** Escape while paused, to close the modal. */
  onPausedEscape?: () => void
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  )
}

/**
 * The physical keyboard drives the keypad from the moment the page loads: a
 * document-level listener maps keys to keypad actions and flashes the matching
 * on-screen key. Typing in a text field and shortcuts with Ctrl, Meta or Alt
 * are left alone.
 *
 * Enter on a focused button is the one overlap. When focus reached the button
 * from the keyboard (Tab), Enter activates that button, as everywhere else on
 * the web. When it got there by a click, Enter means equals; the button keeps
 * focus but does not take the key. The arrival is recorded on focus rather
 * than read from :focus-visible, because browsers may start matching
 * :focus-visible on a clicked button as soon as any key is typed.
 */
export function useKeyboardKeypad({ press, paused = false, onPausedEscape }: Options) {
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const latest = useRef({ press, paused, onPausedEscape })
  useEffect(() => {
    latest.current = { press, paused, onPausedEscape }
  })

  // A layout effect runs in the commit itself, so with the first render
  // committed synchronously (main.tsx) no early key is missed.
  useLayoutEffect(() => {
    let lastInput: 'keyboard' | 'pointer' = 'keyboard'
    let keyboardFocused: EventTarget | null = null

    function onPointerDown() {
      lastInput = 'pointer'
    }
    function onFocusIn(event: FocusEvent) {
      keyboardFocused = lastInput === 'keyboard' ? event.target : null
    }
    function onKeyDown(event: KeyboardEvent) {
      lastInput = 'keyboard'
      const { press: dispatch, paused: modal, onPausedEscape: closeModal } = latest.current
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (modal) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeModal?.()
        }
        return
      }
      const target = event.target
      if (isEditable(target)) return
      const onButton = target instanceof HTMLElement && target.tagName === 'BUTTON'
      if (onButton && event.key === 'Enter' && target === keyboardFocused) return
      const action = actionForKey(event.key)
      if (!action) return
      event.preventDefault()
      dispatch(action)
      setPressedKey(keyIdFor(action))
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!pressedKey) return
    const timer = setTimeout(() => setPressedKey(null), PRESS_FLASH_MS)
    return () => clearTimeout(timer)
  }, [pressedKey])

  return { pressedKey }
}
