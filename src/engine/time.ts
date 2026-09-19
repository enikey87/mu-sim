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
