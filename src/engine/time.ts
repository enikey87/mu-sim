// Игровой календарь и режим дня по реальным часам.
export const HANDOVER = new Date(2026, 2, 18) // дата сдачи объекта

export const dateOf = (day: number): Date => new Date(HANDOVER.getTime() + day * 864e5)
export const fmtDate = (day: number): string =>
  dateOf(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
export const fmtDayMonth = (day: number): string =>
  dateOf(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
export const fmtShortDate = (day: number): string =>
  dateOf(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
export const fmtTime = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export type Period = 'night' | 'morning' | 'lunch' | 'friday' | 'evening' | 'day'

export function periodOf(hour: number, dow: number): Period {
  if (hour < 6) return 'night'
  if (hour < 10) return 'morning'
  if (hour >= 12 && hour < 15) return 'lunch'
  if (hour >= 18 && dow === 5) return 'friday'
  if (hour >= 18) return 'evening'
  return 'day'
}

// Уровни эскалации отмазок по дням ожидания
export const TIERS: ReadonlyArray<readonly [number, string]> = [
  [250, '📈 Отмазки Алика вышли на международный уровень'],
  [330, '🏛 Отмазки Алика вышли на исторический уровень'],
  [450, '🌌 Отмазки Алика вышли на космический уровень'],
]
export const tierOf = (day: number): number => TIERS.filter(([d]) => day >= d).length

const WEEKDAYS: Array<[RegExp, number]> = [
  [/в воскресенье/, 0], [/в понедельник/, 1], [/во вторник|вторник/, 2], [/в среду/, 3], [/в четверг/, 4], [/в пятницу/, 5], [/в субботу/, 6],
]
/**
 * Сколько дней до срока по календарю: «в среду» — до ближайшей среды, «до Нового года» — до 1 января,
 * «в конце квартала» — до конца квартала, «до конца недели» — до воскресенья. Иначе — как в колоде (d).
 */
export function calendarDays(text: string, day: number, d: number): number {
  const now = dateOf(day)
  const until = (to: Date) => Math.max(1, Math.round((to.getTime() - now.getTime()) / 864e5))
  let first: [number, number] | null = null
  for (const [re, dow] of WEEKDAYS) { const i = text.search(re); if (i >= 0 && (!first || i < first[0])) first = [i, dow] }
  if (first) return ((first[1] - now.getDay() + 7) % 7 || 7) + (/следующ/.test(text) ? 7 : 0)
  if (/до Нового года/.test(text)) return until(new Date(now.getFullYear() + 1, 0, 1))
  if (/в конце квартала/.test(text)) return until(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0))
  if (/до конца недели/.test(text)) return (7 - now.getDay()) % 7 || 7
  return d
}
