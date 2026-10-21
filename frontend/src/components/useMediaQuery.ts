import { useCallback, useSyncExternalStore } from 'react'

function supported(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/** Whether a media query matches now, updated when it changes. False where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  // The app renders in the browser only, so there is no server snapshot.
  return useSyncExternalStore(subscribe, () => supported() && window.matchMedia(query).matches)
}
