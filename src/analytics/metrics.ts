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

let counter = 0
let pageviewSent = false

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
  return isOn()
}

/** Цель в счётчик. Молчит, пока счётчик не включён. */
export function track(goal: Goal, params: Params): void {
  if (!counter) return
  global().ym?.(counter, 'reachGoal', goal, params)
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