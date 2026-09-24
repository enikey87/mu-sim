// Игровой календарь и режим дня по реальным часам.
export const HANDOVER = new Date(2026, 2, 18) // дата сдачи объекта

export const dateOf = (day: number): Date => new Date(HANDOVER.getTime() + day * 864e5)
// Intl-форматирование дорогое, а facts() зовёт его на каждую выборку реплики: день → строка не меняется
const byDay = (opts: Intl.DateTimeFormatOptions) => {
  const cache = new Map<number, string>()
  return (day: number): string => {
    let s = cache.get(day)
    if (s === undefined) cache.set(day, (s = dateOf(day).toLocaleDateString('ru-RU', opts)))
    return s
  }
}
export const fmtDate = byDay({ day: 'numeric', month: 'long', year: 'numeric' })
export const fmtDayMonth = byDay({ day: 'numeric', month: 'long' })
export const fmtShortDate = byDay({ day: 'numeric', month: 'short' })
export const fmtTime = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Который час по часам переписки словами: «три часа ночи», «час ночи», «полночь». */
export function nightHour(clock: number): string {
  const h = Math.floor(clock / 60) % 24
  if (h === 0) return 'полночь'
  const words = ['', 'час', 'два часа', 'три часа', 'четыре часа', 'пять', 'шесть', 'семь']
  return `${words[h] ?? String(h)} ${h < 5 ? 'ночи' : 'утра'}`
}

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

/**
 * Срок по календарю — последний день, когда обещание ещё не просрочено: weekday — ближайший такой день недели
 * (next — через неделю, plus — ещё дней после него: «в пятницу, край — в понедельник»), monthEnd — конец месяца
 * через N, newYear — 1 января, quarter — конец квартала, week — ближайшее воскресенье.
 */
export type Due =
  | { weekday: number; next?: true; plus?: number }
  | { monthEnd: number }
  | { newYear: true }
  | { quarter: true }
  | { week: true }
export function dueIn(due: Due, day: number): number {
  const now = dateOf(day)
  const until = (to: Date) => Math.max(1, Math.round((to.getTime() - now.getTime()) / 864e5))
  if ('weekday' in due) return ((due.weekday - now.getDay() + 7) % 7 || 7) + (due.next ? 7 : 0) + (due.plus ?? 0)
  if ('monthEnd' in due) return until(new Date(now.getFullYear(), now.getMonth() + due.monthEnd + 1, 0))
  if ('newYear' in due) return until(new Date(now.getFullYear() + 1, 0, 1))
  if ('quarter' in due) return until(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0))
  return (7 - now.getDay()) % 7 || 7
}
