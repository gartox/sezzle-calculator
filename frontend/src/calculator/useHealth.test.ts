import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHealth } from './useHealth'

function deferred() {
  let resolve: (ok: boolean) => void = () => {}
  const promise = new Promise<boolean>((done) => (resolve = done))
  return { promise, resolve }
}

describe('useHealth', () => {
  it('checks once on load', async () => {
    const check = vi.fn(async () => true)
    const { result } = renderHook(() => useHealth(check))
    expect(result.current.status).toBe('checking')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('keeps the newest answer when an older check answers last', async () => {
    const first = deferred()
    const second = deferred()
    const check = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useHealth(check))
    act(() => result.current.recheck())

    await act(async () => second.resolve(true))
    expect(result.current.status).toBe('ready')
    await act(async () => first.resolve(false))
    expect(result.current.status).toBe('ready')
  })

  it('re-checks after a success only while it reads Offline', async () => {
    const check = vi.fn(async () => false)
    const { result } = renderHook(() => useHealth(check))
    await waitFor(() => expect(result.current.status).toBe('offline'))

    check.mockResolvedValue(true)
    act(() => result.current.reportSuccess())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(check).toHaveBeenCalledTimes(2)

    act(() => result.current.reportSuccess())
    expect(check).toHaveBeenCalledTimes(2)
  })
})
