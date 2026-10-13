// #653: второй приёмник целей — PostHog. Оба клиента подставные, живой сети прогон не трогает.
import { describe, it, expect, beforeEach } from 'vitest'
import { enable, firstGesture, isOn, track, GAME_HOST, POSTHOG_KEY, COUNTER_ID } from './metrics'
import type { Goal } from './metrics'

type YmCall = [number, string, ...unknown[]]
type PhCall = [string, ...unknown[]]

/** Подставной клиент PostHog: очередь вызовов [метод, …], init пишет в `_i` — как настоящий. */
const phClient = (calls: PhCall[]) => {
  const q = [] as unknown as { _i: unknown[][]; __SV?: number; init: unknown; capture: unknown }
  q._i = []
  q.__SV = 1
  q.init = (key: string, config: unknown) => { calls.push(['init', key, config]) }
  q.capture = (...args: unknown[]) => { calls.push(['capture', ...(args as [string, Record<string, unknown>?])]) }
  return q
}

const yaScripts = () => [...document.querySelectorAll('script[src*="mc.yandex.ru"]')]
const phScripts = () => [...document.querySelectorAll('script[src*="posthog"]')]
const search = (extra: string) => `?${extra}`

/** Подставные клиенты обоих приёмников: `ym: false` / `ph: false` — клиента нет. */
const setup = (opts: { ym?: boolean; ph?: boolean } = {}) => {
  const ym: YmCall[] = []
  const ph: PhCall[] = []
  if (opts.ym !== false) (globalThis as { ym?: unknown }).ym = (...args: unknown[]) => { ym.push(args as YmCall) }
  else delete (globalThis as { ym?: unknown }).ym
  if (opts.ph !== false) (globalThis as { posthog?: unknown }).posthog = phClient(ph)
  else delete (globalThis as { posthog?: unknown }).posthog
  return { ym, ph }
}

beforeEach(() => {
  setup({ ym: false, ph: false })
  yaScripts().forEach((s) => s.remove())
  phScripts().forEach((s) => s.remove())
  // модульное состояние приёмников — с нуля на каждый тест
  enable({ host: '', search: '' })
})

describe('два приёмника за одним track (#653)', () => {
  it('оба ключа заданы — одна цель приходит в оба с тем же id', () => {
    const { ym, ph } = setup()
    expect(enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: 'ph_key' })).toBe(true)
    expect(isOn()).toBe(true)
    track('ending', { id: 'family' })
    expect(ym).toEqual([[4242, 'reachGoal', 'ending', { id: 'family' }]])
    expect(ph).toEqual([['capture', 'ending', { id: 'family' }]])
  })

  it('ключ Метрики пуст — цель уходит только во второй приёмник', () => {
    const { ym, ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '', posthogKey: 'ph_key' })
    track('ending', { id: 'payday_coins' })
    expect(ym).toHaveLength(0)
    expect(ph).toEqual([['capture', 'ending', { id: 'payday_coins' }]])
  })

  it('ключ PostHog пустой — цель уходит только в Метрику', () => {
    const { ym, ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: '' })
    track('ending', { id: 'family' })
    expect(ym).toEqual([[4242, 'reachGoal', 'ending', { id: 'family' }]])
    expect(ph).toHaveLength(0)
  })

  it('оба ключа пусты — тишина, тегов нет, модуль выключен', () => {
    const { ym, ph } = setup()
    expect(COUNTER_ID).toBe('')
    expect(POSTHOG_KEY).toBe('')
    expect(enable({ host: GAME_HOST, search: '', id: '', posthogKey: '' })).toBe(false)
    expect(isOn()).toBe(false)
    firstGesture()
    track('ending', { id: 'family' })
    expect(ym).toHaveLength(0)
    expect(ph).toHaveLength(0)
    expect(yaScripts()).toHaveLength(0)
    expect(phScripts()).toHaveLength(0)
  })

  it('включён хотя бы один приёмник — модуль включён (от этого строка игроку)', () => {
    setup()
    enable({ host: GAME_HOST, search: '', id: '', posthogKey: 'ph_key' })
    expect(isOn()).toBe(true)
    enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: '' })
    expect(isOn()).toBe(true)
    enable({ host: GAME_HOST, search: search('debug'), id: '4242', posthogKey: 'ph_key' })
    expect(isOn()).toBe(false)
  })
})

describe('PostHog: свой тег, свой один просмотр (#653)', () => {
  it('первый жест — init с выключенным автосбором, записью сессии и автопросмотром', () => {
    const { ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '', posthogKey: 'ph_key' })
    firstGesture()
    const init = ph.find((c) => c[0] === 'init')
    expect(init?.[1]).toBe('ph_key')
    expect(init?.[2]).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
    })
    expect(ph.filter((c) => c[0] === 'capture' && c[1] === '$pageview')).toHaveLength(1)
    expect(phScripts().map((s) => (s as HTMLScriptElement).src))
      .toEqual([expect.stringContaining('eu-assets.i.posthog.com/static/array.js')])
  })

  it('до жеста ни init, ни просмотра, ни тега', () => {
    const { ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '', posthogKey: 'ph_key' })
    expect(ph).toHaveLength(0)
    expect(phScripts()).toHaveLength(0)
  })

  it('повторный жест и состояния интерфейса просмотр не дублируют', () => {
    const { ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '', posthogKey: 'ph_key' })
    firstGesture()
    firstGesture()
    track('ending', { id: 'family' })
    track('copied', { id: 'family' })
    expect(ph.filter((c) => c[0] === 'init')).toHaveLength(1)
    expect(ph.filter((c) => c[0] === 'capture' && c[1] === '$pageview')).toHaveLength(1)
    expect(phScripts()).toHaveLength(1)
  })

  it('у обоих приёмников свои теги: array.js и tag.js грузятся раздельно', () => {
    setup()
    enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: 'ph_key' })
    firstGesture()
    expect(yaScripts()).toHaveLength(1)
    expect(phScripts()).toHaveLength(1)
  })

  it('имена целей и параметры те же, что у Метрики: текст, долг и сид не попадают', () => {
    const { ym, ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: 'ph_key' })
    const goals: Array<[Goal, Record<string, unknown>]> = [
      ['boot', { save: 'no', since: 3 }],
      ['milestone', { n: 25, day: 12 }],
      ['left', { phase: 'payday', day: 340, turns: 90, sec: 42, total: 300 }],
    ]
    for (const [goal, params] of goals) track(goal, params as never)
    for (const [goal, params] of goals) {
      expect(ym).toContainEqual([4242, 'reachGoal', goal, params])
      expect(ph).toContainEqual(['capture', goal, params])
    }
    const blob = JSON.stringify(ph)
    expect(blob).not.toMatch(/Мууу|отмазк|долг|\d{6}/)
  })
})

describe('падение одного приёмника не глушит второй (#653)', () => {
  it('упавшая Метрика не отменяет цель в PostHog', () => {
    const { ph } = setup()
    ;(globalThis as { ym?: unknown }).ym = () => { throw new Error('нет скрипта Метрики') }
    enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: 'ph_key' })
    firstGesture()
    track('ending', { id: 'family' })
    expect(ph).toContainEqual(['capture', 'ending', { id: 'family' }])
    expect(ph.filter((c) => c[0] === 'init')).toHaveLength(1)
    expect(phScripts()).toHaveLength(1)
  })

  it('упавший PostHog не отменяет цель в Метрику', () => {
    const { ym } = setup()
    ;(globalThis as { posthog?: unknown }).posthog = {
      _i: [],
      init: () => { throw new Error('нет скрипта PostHog') },
      capture: () => { throw new Error('нет скрипта PostHog') },
    }
    enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: 'ph_key' })
    firstGesture()
    track('ending', { id: 'family' })
    expect(ym).toContainEqual([4242, 'reachGoal', 'ending', { id: 'family' }])
    expect(yaScripts()).toHaveLength(1)
  })
})
