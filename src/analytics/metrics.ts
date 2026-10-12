// Аналитика живых игроков: Яндекс Метрика, docs/design/analytics.md.
// Приёмник — глобальная `ym`; в тестах она подставная. Номер счётчика пуст, пока не впишет автор.
import type { EndingId, PaydayId } from '../content/finales'

/** Номер счётчика Метрики. Пусто — счётчик молчит; вписывает автор (docs/design/analytics.md). */
export const COUNTER_ID = ''

/** Хост, на котором счётчик включается: localhost, превью и e2e молчат. */
export const GAME_HOST = 'enikey87.github.io'

/** Имена целей закрыты типом: произвольной строки в `track` не передать. */
export type Goal = 'boot' | 'milestone' | 'ending' | 'copied' | 'endgame' | 'left'

export type Phase = 'intro' | 'chat' | 'payday' | 'endgame'

/** Параметр цели — тоже закрытый тип. Текст сообщения, долг и сид сюда не попадают. */
export type GoalParams = {
  boot: { save: 'yes' | 'no'; since: number }
  milestone: { n: number; day: number }
  ending: { id: EndingId }
  copied: { id: EndingId }
  endgame: { outcome: PaydayId }
  left: { phase: Phase; day: number; turns: number; sec: number; total: number }
}

type Params = { [G in Goal]: GoalParams[G] }[Goal]

type Ym = ((id: number, method: string, ...rest: readonly unknown[]) => void) & { q?: unknown[][] }

type Metrics = {
  ym?: Ym
  /** Клиентский идентификатор Метрики живёт в cookies — этот флаг его бы погасил. */
  disableYaCounter?: unknown
}

/** Тег Метрики грузится с mc.yandex.ru: своей npm-зависимости нет. */
const TAG_SRC = 'https://mc.yandex.ru/metrika/tag.js'

/** Вебвизор, карта кликов и ссылки выключены; точный показатель отказов включён. */
const INIT_OPTIONS = {
  clickmap: false,
  trackLinks: false,
  webvisor: false,
  accurateTrackBounce: true,
}

const global = (): Metrics => globalThis as Metrics

/** Хранилище браузера: день первого засчитанного визита и сумма секунд по нему. */
const KEY_FIRST_DAY = 'alik.firstDay'
const KEY_TOTAL_SEC = 'alik.visibleSec'

type Store = Pick<Storage, 'getItem' | 'setItem'>

const store = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // приватный режим браузера
  }
}

const readNum = (s: Store | null, key: string): number => {
  const n = Number(s?.getItem(key))
  return Number.isFinite(n) && n > 0 ? n : 0
}
const writeNum = (s: Store | null, key: string, n: number): void => {
  try { s?.setItem(key, String(Math.round(n))) } catch { /* приватный режим */ }
}

/** Полночь по местному времени: разница между такими — календарные дни, а не 24 часа. */
const startOfDay = (t: number): number => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

let counter = 0
let pageviewSent = false
/** С какого момента вкладка видима в этом показе; пока скрыта — время не идёт. */
let shownAt: number | null = null

/** Включён ли счётчик — от этого строка игроку на интро и в досье. */
export const isOn = (): boolean => counter !== 0

/**
 * Включает счётчик. Звать может только вход страницы (src/main.tsx) и только когда
 * заданы все три условия: номер, хост игры и адрес без `debug`/`fast`.
 * `id` — подстановка для теста с приёмником; игра передаёт константу `COUNTER_ID`.
 */
export function enable(opts: { host: string; search: string; id?: string }): boolean {
  const id = opts.id ?? COUNTER_ID
  const url = new URLSearchParams(opts.search)
  counter = id && opts.host === GAME_HOST && !url.has('debug') && !url.has('fast') ? Number(id) : 0
  pageviewSent = false
  shownAt = null
  return isOn()
}

/** Цель в счётчик. Молчит, пока счётчик не включён. */
export function track(goal: Goal, params: Params): void {
  if (!counter) return
  global().ym?.(counter, 'reachGoal', goal, params)
}

/**
 * `boot`: первый жест загрузки, один раз. `since` — календарных дней с первого
 * засчитанного визита в этом браузере; день записывается только при включённом
 * счётчике и «Начать заново» его не стирает — удержание считается на человека.
 */
export function boot(save: 'yes' | 'no', now = Date.now()): void {
  if (!counter) return
  const s = store()
  let first = Number(s?.getItem(KEY_FIRST_DAY))
  if (!Number.isFinite(first) || first <= 0) {
    first = startOfDay(now)
    try { s?.setItem(KEY_FIRST_DAY, String(first)) } catch { /* приватный режим */ }
  }
  const since = Math.max(0, Math.round((startOfDay(now) - first) / 86_400_000))
  track('boot', { save, since })
}

/** Вкладка снова показана: с этого момента идут секунды видимости. */
export function shown(now = Date.now()): void {
  if (!counter || shownAt !== null || document.hidden) return
  shownAt = now
}

/**
 * `left`: вкладка скрылась или страница закрывается — одна цель на отрезок, без
 * второго срабатывания. Пока вкладка скрыта, секунды не идут.
 */
export function left(depth: { phase: Phase; day: number; turns: number }, now = Date.now()): void {
  if (!counter || shownAt === null) return
  const sec = Math.max(0, Math.round((now - shownAt) / 1000))
  shownAt = null
  const s = store()
  const total = readNum(s, KEY_TOTAL_SEC) + sec
  writeNum(s, KEY_TOTAL_SEC, total)
  track('left', { ...depth, sec, total })
}

/**
 * Тег Метрики первым жестом — как звук: до касания сеть не трогаем.
 * Один просмотр страницы за загрузку; повторные состояния интерфейса — нет.
 */
export function firstGesture(): void {
  if (!counter || pageviewSent) return
  pageviewSent = true
  const m = global()
  // очередь вызовов до прихода тега: `ym` к этому моменту ещё не функция Метрики
  const ym = (m.ym ??= ((...args: unknown[]) => { ym.q ??= []; ym.q.push(args) }) as Ym)
  ym(counter, 'init', INIT_OPTIONS)
  ym(counter, 'hit', location.href)
  const script = document.createElement('script')
  script.async = true
  script.src = TAG_SRC
  document.head.appendChild(script)
}