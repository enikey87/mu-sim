import type { Storage } from '../engine/state'

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    // песочница платформы бросает SecurityError уже на чтении localStorage
    return null
  }
}

/** getItem/setItem, которые не роняют старт, если хранилище запрещено. */
export function safeStorage(raw?: Storage | null): Storage | null {
  const source = raw === undefined ? browserStorage() : raw
  if (!source) return null
  return {
    getItem(k) {
      try { return source.getItem(k) } catch { return null }
    },
    setItem(k, v) {
      try { source.setItem(k, v) } catch { /* запись запрещена — партия идёт без сейва */ }
    },
    removeItem(k) {
      try { source.removeItem(k) } catch { /* то же */ }
    },
  }
}
