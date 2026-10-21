import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEALTH_PATH, checkHealth } from './health'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkHealth', () => {
  it('is true on 200 and asks for a fresh answer', async () => {
    const fetchMock = vi.fn(async () => new Response('{"status":"ok"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(checkHealth()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(HEALTH_PATH, { cache: 'no-store' })
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
})
