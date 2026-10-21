import { useCallback, useEffect, useRef, useState } from 'react'

export type HealthStatus = 'checking' | 'ready' | 'offline'

/**
 * The API status from its health check: checked once on load, again after a
 * network error, and again when a calculation succeeds while it reads
 * Offline. No polling. Only the latest check may set the status, so a slow
 * earlier answer cannot overwrite a newer one.
 */
export function useHealth(check: () => Promise<boolean>) {
  const [status, setStatus] = useState<HealthStatus>('checking')
  const latestCheck = useRef(0)
  const current = useRef(status)
  useEffect(() => {
    current.current = status
  }, [status])

  const recheck = useCallback(() => {
    latestCheck.current += 1
    const id = latestCheck.current
    void check().then((ok) => {
      if (id === latestCheck.current) setStatus(ok ? 'ready' : 'offline')
    })
  }, [check])

  /** A calculation got an answer, so the API is reachable: confirm it if we said otherwise. */
  const reportSuccess = useCallback(() => {
    if (current.current === 'offline') recheck()
  }, [recheck])

  useEffect(() => {
    recheck()
  }, [recheck])

  return { status, recheck, reportSuccess }
}
