export const HEALTH_PATH = '/api/v1/health'

/** A health check not answered within this time counts as Offline. */
export const HEALTH_TIMEOUT_MS = 3000

/**
 * Whether the API answers its health check with 200 within the timeout.
 * Never throws: a failed, aborted or hung request is false, so a service that
 * hangs reads Offline instead of staying Ready.
 */
export async function checkHealth(timeoutMs = HEALTH_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(false)
    }, timeoutMs)
  })
  const answered = fetch(HEALTH_PATH, { cache: 'no-store', signal: controller.signal }).then(
    (response) => response.ok,
    () => false,
  )
  try {
    return await Promise.race([answered, timedOut])
  } finally {
    clearTimeout(timer)
  }
}
