import { useCallback, useEffect, useState } from 'react'
import type { StatusTone } from '../components/atoms/StatusDot/StatusDot'

/**
 * The API status from its health check: checked once on load and again
 * whenever `recheck` is called (after a network error). No polling.
 */
export function useHealth(check: () => Promise<boolean>) {
  const [status, setStatus] = useState<StatusTone>('checking')
  const recheck = useCallback(() => {
    void check().then((ok) => setStatus(ok ? 'ready' : 'offline'))
  }, [check])

  useEffect(() => {
    recheck()
  }, [recheck])

  return { status, recheck }
}
