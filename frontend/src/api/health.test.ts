import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEALTH_PATH, HEALTH_TIMEOUT_MS, checkHealth } from './health'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('checkHealth', () => {
  it('is true on 200 and asks for a fresh answer', async () => {
    const fetchMock = vi.fn(async () => new Response('{"status":"ok"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(checkHealth()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(HEALTH_PATH, {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    })
  })

  it('is false on any other status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    )
    await expect(checkHealth()).resolves.toBe(false)
  })

  it('is false when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )
    await expect(checkHealth()).resolves.toBe(false)
  })

  it('is false after the timeout when the request never settles, and aborts it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_path: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>(() => {})
      }),
    )
    const result = checkHealth()
    await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS - 1)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe(false)
    expect(signal?.aborted).toBe(true)
  })
})
