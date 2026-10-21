// The last results, kept for the session only. Storage can be missing or
// throw (private windows, blocked storage, quota), so every access is wrapped
// and the calculator works without it.

export interface HistoryEntry {
  expression: string
  result: string
}

export const HISTORY_LIMIT = 10
export const HISTORY_KEY = 'calculator.history'

/** The part of the Storage interface the history needs. */
export interface HistoryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** sessionStorage, or null when the browser refuses access to it. */
export function defaultStorage(): HistoryStorage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function isEntry(value: unknown): value is HistoryEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as HistoryEntry).expression === 'string' &&
    typeof (value as HistoryEntry).result === 'string'
  )
}

/** The saved entries, newest first, or none when storage is unusable. */
export function loadHistory(storage: HistoryStorage | null): HistoryEntry[] {
  if (!storage) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

/** Saves the entries; a storage failure is ignored rather than surfaced. */
export function saveHistory(storage: HistoryStorage | null, entries: HistoryEntry[]): void {
  if (!storage) {
    return
  }
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // Quota exceeded or storage blocked: the history lives in memory only.
  }
}

/** Puts the newest entry first and keeps the last HISTORY_LIMIT. */
export function addEntry(entries: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...entries].slice(0, HISTORY_LIMIT)
}
