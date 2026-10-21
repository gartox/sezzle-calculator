import type { HistoryEntry, HistoryStorage } from '../calculator/history'
import { HISTORY_KEY } from '../calculator/history'

/** An in-memory HistoryStorage, optionally seeded with entries. */
export function memoryStorage(
  entries: HistoryEntry[] = [],
): HistoryStorage & { read(): HistoryEntry[] } {
  const data = new Map<string, string>([[HISTORY_KEY, JSON.stringify(entries)]])
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    read: () => JSON.parse(data.get(HISTORY_KEY) ?? '[]') as HistoryEntry[],
  }
}
