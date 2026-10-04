// Счётчики «дней с события»: без события значения нет (не 0), иначе «не позже n» истинно всегда (#496).
// since.* → ach.* по соглашению; прочие — registerDaysSince при определении ключа.

const eventByCounter = new Map<string, string>()

/** Зарегистрировать счётчик; вернуть его ключ (удобно при объявлении константы). */
export const registerDaysSince = (counterKey: string, eventKey: string): string => {
  eventByCounter.set(counterKey, eventKey)
  return counterKey
}

/** Ключ события для счётчика, или null если это не счётчик дней. */
export const daySinceEvent = (counterKey: string): string | null => {
  if (counterKey.startsWith('since.')) return 'ach.' + counterKey.slice('since.'.length)
  return eventByCounter.get(counterKey) ?? null
}

export const isDaySinceCounter = (key: string): boolean => daySinceEvent(key) != null

/** Дней с момента события; без события — undefined (не 0). */
export const daysSince = (day: number, eventAt: unknown): number | undefined =>
  eventAt == null || eventAt === false || eventAt === '' ? undefined : day - Number(eventAt)
