import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HISTORY_KEY,
  HISTORY_LIMIT,
  type HistoryStorage,
  addEntry,
  defaultStorage,
  loadHistory,
  saveHistory,
} from './history'

function memoryStorage(initial?: string): HistoryStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(HISTORY_KEY, initial)
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

const throwing: HistoryStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('history', () => {
  it('round-trips entries through storage', () => {
    const storage = memoryStorage()
    const entries = [{ expression: '15 % of 200 =', result: '30' }]
    saveHistory(storage, entries)
    expect(loadHistory(storage)).toEqual(entries)
  })

  it('keeps the newest first and at most ten', () => {
    let entries: ReturnType<typeof loadHistory> = []
    for (let i = 1; i <= HISTORY_LIMIT + 2; i++) {
      entries = addEntry(entries, { expression: `${i} + 0 =`, result: String(i) })
    }
    expect(entries).toHaveLength(HISTORY_LIMIT)
    expect(entries[0].result).toBe('12')
    expect(entries.at(-1)?.result).toBe('3')
  })

  it.each([
    ['nothing saved', undefined],
    ['invalid JSON', '{not json'],
    ['not an array', '{"expression":"1"}'],
  ])('loads an empty history from %s', (_name, saved) => {
    expect(loadHistory(memoryStorage(saved))).toEqual([])
  })

  it('drops malformed entries and caps a long saved list', () => {
    const saved = JSON.stringify([
      { expression: 'ok =', result: '1' },
      { expression: 1, result: '2' },
      null,
      ...Array.from({ length: 12 }, (_, i) => ({ expression: `${i} =`, result: String(i) })),
    ])
    const loaded = loadHistory(memoryStorage(saved))
    expect(loaded).toHaveLength(HISTORY_LIMIT)
    expect(loaded[0]).toEqual({ expression: 'ok =', result: '1' })
  })

  it('works without storage and when storage throws', () => {
    expect(loadHistory(null)).toEqual([])
    expect(loadHistory(throwing)).toEqual([])
    expect(() => saveHistory(null, [])).not.toThrow()
    expect(() => saveHistory(throwing, [{ expression: '1 =', result: '1' }])).not.toThrow()
  })

  it('uses sessionStorage by default and survives a browser that refuses it', () => {
    expect(defaultStorage()).toBe(window.sessionStorage)
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(defaultStorage()).toBeNull()
  })
})
