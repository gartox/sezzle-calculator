export const HEALTH_PATH = '/api/v1/health'

/** Whether the API answers its health check with 200. Never throws. */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_PATH, { cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}
