import type { HistoryEntry, HistoryStorage } from '../calculator/history'
import { HISTORY_KEY } from '../calculator/history'

type SavedEntry = Pick<HistoryEntry, 'expression' | 'result'>

/**
 * An in-memory HistoryStorage, optionally seeded with entries. `read` returns
 * what was saved without the generated ids, so tests can compare it directly.
 */
export function memoryStorage(entries: SavedEntry[] = []): HistoryStorage & {
  read(): SavedEntry[]
} {
  const data = new Map<string, string>([[HISTORY_KEY, JSON.stringify(entries)]])
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    read: () =>
      (JSON.parse(data.get(HISTORY_KEY) ?? '[]') as HistoryEntry[]).map(
        ({ expression, result }) => ({ expression, result }),
      ),
  }
}
