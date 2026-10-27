// Аналитика живых игроков: приёмники целей, docs/design/analytics.md.
// Вызов из игры один — track(имя, параметры); приёмников три — Метрика, PostHog и Umami, каждый своим тегом
// и своим пустым ключом. В тестах клиенты подставные, живой сети прогон не трогает.
import type { EndingId, PaydayId } from '../content/finales'
import { analyticsGate, COUNTER_ID, POSTHOG_KEY, UMAMI_KEY, type Gate } from './gate'

export { COUNTER_ID, GAME_HOST, POSTHOG_KEY, UMAMI_KEY } from './gate'

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

/**
 * Приёмник цели — узкий объект: включился ли, тег по первому жесту, одна цель.
 * Метрика и PostHog — две реализации; список живёт здесь, игра про приёмники не знает.
 */
type Receiver = {
  on: boolean
  /** Первый жест: init приёмника, его один просмотр страницы, его тег. */
  gesture: () => void
  track: (goal: Goal, params: Params) => void
}

/** Приёмник, который молчит: ни сети, ни вызовов. */
const silent: Receiver = { on: false, gesture: () => {}, track: () => {} }

/** Ошибка одного приёмника (нет скрипта, клиент бросил) не отменяет вызов другого. */
const safe = (f: () => void): void => { try { f() } catch { /* приёмник упал — остальные живут */ } }

/** Тег приёмника — как звук: по первому жесту, одним скриптом в head. `onload` — когда скрипт встал. */
const loadScript = (src: string, anonymous = false, attrs?: Record<string, string>, onload?: () => void): void => {
  const script = document.createElement('script')
  script.async = true
  if (anonymous) script.crossOrigin = 'anonymous'
  for (const [k, v] of Object.entries(attrs ?? {})) script.setAttribute(k, v)
  script.src = src
  if (onload) script.addEventListener('load', onload)
  document.head.appendChild(script)
}

// ---------- Метрика ----------

type Ym = ((id: number, method: string, ...rest: readonly unknown[]) => void) & { a?: unknown[][] }

type Metrics = {
  ym?: Ym
  /** Клиентский идентификатор Метрики живёт в cookies — этот флаг его бы погасил. */
  disableYaCounter?: unknown
}

const global = (): Metrics => globalThis as Metrics

/** Тег Метрики грузится с mc.yandex.ru: своей npm-зависимости нет. */
const TAG_YA = 'https://mc.yandex.ru/metrika/tag.js'

/** Вебвизор, карта кликов и ссылки выключены; точный показатель отказов включён. */
const INIT_YA = {
  clickmap: false,
  trackLinks: false,
  webvisor: false,
  accurateTrackBounce: true,
}

const metrika = (id: number): Receiver => ({
  on: true,
  gesture: () => safe(() => {
    const m = global()
    // очередь вызовов до прихода тега: `ym` к этому моменту ещё не функция Метрики.
    // Очередь обязана лежать в `ym.a` — её читает официальный tag.js (сниппет Яндекса
    // кладёт туда `arguments`). До 27.10 очередь писалась в `ym.q`: tag.js грузился,
    // своей очереди не видел и счётчик не инициализировал — Метрика молчала при живом теге.
    const ym = (m.ym ??= ((...args: unknown[]) => { (ym.a ??= []).push(args) }) as Ym)
    ym(id, 'init', INIT_YA)
    ym(id, 'hit', location.href)
    loadScript(TAG_YA)
  }),
  track: (goal, params) => safe(() => { global().ym?.(id, 'reachGoal', goal, params) }),
})

// ---------- PostHog ----------

/** Аргументы вызова клиента PostHog: [метод, …]. До прихода array.js это очередь. */
type PhCall = [string, ...unknown[]]

/** Клиент PostHog без npm-пакета: массив-очередь вызовов, `_i` — оттуда array.js запускает init. */
type PostHog = PhCall[] & {
  _i: unknown[][]
  __SV?: number
  init: (key: string, config: PhConfig) => void
  capture: (event: string, props?: Record<string, unknown>) => void
}

type PhConfig = {
  api_host: string
  defaults: string
  autocapture: false
  capture_pageview: false
  disable_session_recording: true
}

type PhGlobals = { posthog?: PostHog }
const phGlobal = (): PhGlobals => globalThis as PhGlobals

/** PostHog Cloud в ЕС: приём и активы — разные хосты, как в официальном сниппете. */
const HOST_PH = 'https://eu.i.posthog.com'
const TAG_PH = `${HOST_PH.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`

/** Сбор включён быть не должен: автоcбор кликов и ввода, свой просмотр страницы и запись сессии — всё выключено.
 *  Просмотр страницы шлём сами, один, первым жестом — как у Метрики. */
const INIT_PH: PhConfig = {
  api_host: HOST_PH,
  defaults: '2026-05-30',
  autocapture: false,
  capture_pageview: false,
  disable_session_recording: true,
}

/** Заглушка клиента до прихода array.js — те же методы, что в официальном сниппете PostHog. */
const stubPosthog = (): PostHog => {
  const q = [] as unknown as PostHog
  q._i = []
  q.__SV = 1
  q.init = (key, config) => { q._i.push([key, config, 'posthog']) }
  q.capture = (event, props) => { q.push(['capture', event, props]) }
  return q
}

const posthog = (key: string): Receiver => ({
  on: true,
  gesture: () => safe(() => {
    const ph = phGlobal().posthog ??= stubPosthog()
    ph.init(key, INIT_PH)
    ph.capture('$pageview')
    loadScript(TAG_PH, true)
  }),
  track: (goal, params) => safe(() => { phGlobal().posthog?.capture(goal, params) }),
})

// ---------- Umami ----------

/** Вызов клиента Umami: своё событие с параметрами или без события — просмотр страницы. */
type UmamiCall = { event?: string; props?: Record<string, unknown> }

/** Клиент Umami — тот объект, который ставит script.js: `track()` без аргументов есть просмотр страницы. */
type Umami = { track: (event?: string, props?: Record<string, unknown>) => void }

type UmamiGlobals = { umami?: Umami }
const umamiGlobal = (): UmamiGlobals => globalThis as UmamiGlobals

/** Umami Cloud: свои события с параметрами, без карты кликов и без записи сессии. */
const TAG_UMAMI = 'https://cloud.umami.is/script.js'

/**
 * Живой script.js Umami ставит клиент, только если глобала нет (`t.umami||(t.umami={…})`), и очередь
 * вызовов не разбирает вовсе (выкачан и разобран при аудите #656). Заглушка в `window.umami` навсегда
 * перебивает настоящий клиент — и все цели молча теряются (#676). Поэтому здесь глобал до прихода тега
 * не занимаем: вызовы копим у себя, а просмотр страницы и буфер добиваем, когда клиент встал.
 */
const umami = (key: string): Receiver => {
  let queue: UmamiCall[] = []

  /** Клиент встал — отдать всё, что накопилось, по порядку. Пока его нет, вызовы ждут в буфере. */
  const flush = () => {
    const client = umamiGlobal().umami
    if (!client) return
    const pending = queue
    queue = []
    for (const call of pending) safe(() => {
      if (call.event === undefined) client.track() // без события — просмотр страницы
      else client.track(call.event, call.props)
    })
  }
  const send = (call: UmamiCall) => { queue.push(call); flush() }

  return {
    on: true,
    gesture: () => safe(() => {
      send({}) // свой просмотр страницы: автосбор выключен, шлём сами; до тега он лежит в буфере
      loadScript(TAG_UMAMI, false, { 'data-auto-track': 'false', 'data-website-id': key }, () => safe(flush))
    }),
    track: (goal, params) => safe(() => send({ event: goal, props: params as Record<string, unknown> })),
  }
}

// ---------- модуль ----------

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

let receivers: Receiver[] = [silent]
let pageviewSent = false
/** С какого момента вкладка видима в этом показе; пока скрыта — время не идёт. */
let shownAt: number | null = null

/** Включён ли модуль — от этого строка игроку на интро и в досье: хватает одного приёмника. */
export const isOn = (): boolean => receivers.some((r) => r.on)

/**
 * Включает приёмники. Звать может только вход страницы (src/main.tsx) и только когда
 * заданы все три условия: ключ приёмника, хост игры и адрес без `debug`/`fast`/`noidle`.
 * `id` — номер Метрики, `posthogKey` — ключ PostHog, `umamiKey` — ключ Umami: подстановки
 * для теста с приёмником; игра передаёт константы `COUNTER_ID`, `POSTHOG_KEY` и `UMAMI_KEY`.
 */
export function enable(opts: Gate): boolean {
  const on = analyticsGate(opts)
  const ya = on ? Number(opts.id ?? COUNTER_ID) : 0
  const ph = on ? (opts.posthogKey ?? POSTHOG_KEY) : ''
  const um = on ? (opts.umamiKey ?? UMAMI_KEY) : ''
  receivers = [ya ? metrika(ya) : silent, ph ? posthog(ph) : silent, um ? umami(um) : silent]
  pageviewSent = false
  shownAt = null
  return isOn()
}

/** Цель — во все включённые приёмники, одним вызовом из игры. Молчит, пока модуль не включён. */
export function track(goal: Goal, params: Params): void {
  if (!isOn()) return
  for (const r of receivers) if (r.on) r.track(goal, params)
}

/**
 * `boot`: первый жест загрузки, один раз. `since` — календарных дней с первого
 * засчитанного визита в этом браузере; день записывается только при включённом
 * модуле и «Начать заново» его не стирает — удержание считается на человека.
 */
export function boot(save: 'yes' | 'no', now = Date.now()): void {
  if (!isOn()) return
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
  if (!isOn() || shownAt !== null || document.hidden) return
  shownAt = now
}

/**
 * `left`: вкладка скрылась или страница закрывается — одна цель на отрезок, без
 * второго срабатывания. Пока вкладка скрыта, секунды не идут.
 */
export function left(depth: { phase: Phase; day: number; turns: number }, now = Date.now()): void {
  if (!isOn() || shownAt === null) return
  const sec = Math.max(0, Math.round((now - shownAt) / 1000))
  shownAt = null
  const s = store()
  const total = readNum(s, KEY_TOTAL_SEC) + sec
  writeNum(s, KEY_TOTAL_SEC, total)
  track('left', { ...depth, sec, total })
}

/**
 * Теги приёмников первым жестом — как звук: до касания сеть не трогаем.
 * Один просмотр страницы у каждого приёмника за загрузку; повторные состояния интерфейса — нет.
 */
export function firstGesture(): void {
  if (!isOn() || pageviewSent) return
  pageviewSent = true
  for (const r of receivers) if (r.on) r.gesture()
}
