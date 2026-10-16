// #653: второй приёмник целей — PostHog. #656: третий — Umami. Клиенты подставные, живой сети прогон не трогает.
import { describe, it, expect, beforeEach } from 'vitest'
import { enable, firstGesture, isOn, track, GAME_HOST } from './metrics'
import type { Goal } from './metrics'

type YmCall = [number, string, ...unknown[]]
type PhCall = [string, ...unknown[]]
type UmCall = [string?, Record<string, unknown>?]

/** Подставной клиент PostHog: очередь вызовов [метод, …], init пишет в `_i` — как настоящий. */
const phClient = (calls: PhCall[]) => {
  const q = [] as unknown as { _i: unknown[][]; __SV?: number; init: unknown; capture: unknown }
  q._i = []
  q.__SV = 1
  q.init = (key: string, config: unknown) => { calls.push(['init', key, config]) }
  q.capture = (...args: unknown[]) => { calls.push(['capture', ...(args as [string, Record<string, unknown>?])]) }
  return q
}

/** Фейк настоящего script.js Umami: клиент ставится, только если глобала нет (`t.umami||(…)`),
 *  и очередь не разбирает — как живой скрипт (#676). Вызов тега даёт `load`. */
const umScriptArrived = (calls: UmCall[]) => {
  if (!(globalThis as { umami?: unknown }).umami) {
    (globalThis as { umami?: unknown }).umami = { track: (...args: unknown[]) => { calls.push(args as UmCall) } }
  }
  umScripts()[0]?.dispatchEvent(new Event('load'))
}

const yaScripts = () => [...document.querySelectorAll('script[src*="mc.yandex.ru"]')]
const phScripts = () => [...document.querySelectorAll('script[src*="posthog"]')]
const umScripts = () => [...document.querySelectorAll('script[src*="cloud.umami.is"]')]
const search = (extra: string) => `?${extra}`

/** Подставные клиенты Метрики и PostHog (`ym: false` / `ph: false` — клиента нет). Umami-клиента нет:
 *  к моменту теста настоящий script.js ещё не пришёл, и модуль не должен занимать за него глобал. */
const setup = (opts: { ym?: boolean; ph?: boolean } = {}) => {
  const ym: YmCall[] = []
  const ph: PhCall[] = []
  if (opts.ym !== false) (globalThis as { ym?: unknown }).ym = (...args: unknown[]) => { ym.push(args as YmCall) }
  else delete (globalThis as { ym?: unknown }).ym
  if (opts.ph !== false) (globalThis as { posthog?: unknown }).posthog = phClient(ph)
  else delete (globalThis as { posthog?: unknown }).posthog
  delete (globalThis as { umami?: unknown }).umami
  return { ym, ph }
}

beforeEach(() => {
  setup({ ym: false, ph: false })
  yaScripts().forEach((s) => s.remove())
  phScripts().forEach((s) => s.remove())
  umScripts().forEach((s) => s.remove())
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

  it('все ключи пусты — тишина, тегов нет, модуль выключен', () => {
    const { ym, ph } = setup()
    expect(enable({ host: GAME_HOST, search: '', id: '', posthogKey: '', umamiKey: '' })).toBe(false)
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

describe('Umami: третий приёмник (#656, #676)', () => {
  it('просмотр и цели доходят после загрузки тега; вызовы до неё не теряются', () => {
    const um: UmCall[] = []
    setup({ ym: false, ph: false })
    enable({ host: GAME_HOST, search: '', umamiKey: 'um_key' })
    firstGesture()
    track('ending', { id: 'family' })
    // до прихода script.js глобал не занят: заглушка перебила бы настоящий клиент (#676)
    expect((globalThis as { umami?: unknown }).umami).toBeUndefined()
    expect(um).toHaveLength(0)
    umScriptArrived(um) // script.js встал, браузер дал load — буфер ушёл в клиент
    expect(um).toEqual([[], ['ending', { id: 'family' }]])
  })

  it('ключ задан, хост игры, без debug/fast — цель приходит в Umami с тем же id, что и в остальные', () => {
    const um: UmCall[] = []
    const { ym, ph } = setup()
    expect(enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: 'ph_key', umamiKey: 'um_key' })).toBe(true)
    firstGesture()
    track('ending', { id: 'family' })
    umScriptArrived(um)
    expect(ym).toContainEqual([4242, 'reachGoal', 'ending', { id: 'family' }])
    expect(ph).toContainEqual(['capture', 'ending', { id: 'family' }])
    expect(um).toContainEqual(['ending', { id: 'family' }])
  })

  it('ключ Umami пуст — вызова Umami нет, тега нет, Метрика цель получает', () => {
    const um: UmCall[] = []
    const { ym } = setup()
    enable({ host: GAME_HOST, search: '', id: '4242', umamiKey: '' })
    firstGesture()
    track('ending', { id: 'family' })
    umScriptArrived(um)
    expect(um).toHaveLength(0)
    expect(umScripts()).toHaveLength(0)
    expect(ym).toContainEqual([4242, 'reachGoal', 'ending', { id: 'family' }])
  })

  it('ключ Umami пустой — приёмник молчит, остальные живут (механизм, состояние констант не охраняется)', () => {
    const { ym, ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '12345', posthogKey: 'ph_key', umamiKey: '' })
    firstGesture()
    track('ending', { id: 'family' })
    expect(umScripts()).toHaveLength(0)
    expect(ym).toContainEqual([12345, 'reachGoal', 'ending', { id: 'family' }])
    expect(ph.some((c) => c[0] === 'capture' && c[1] === 'ending')).toBe(true)
  })

  it('автосбор выключен, тег один, просмотр один', () => {
    const um: UmCall[] = []
    setup({ ym: false, ph: false })
    enable({ host: GAME_HOST, search: '', umamiKey: 'um_key' })
    firstGesture()
    const tags = umScripts()
    expect(tags).toHaveLength(1)
    expect((tags[0] as HTMLScriptElement).getAttribute('data-auto-track')).toBe('false')
    expect((tags[0] as HTMLScriptElement).getAttribute('data-website-id')).toBe('um_key')
    expect((tags[0] as HTMLScriptElement).src).toContain('cloud.umami.is/script.js')
    firstGesture() // второй жест, «Начать заново», состояния интерфейса
    umScriptArrived(um)
    expect(um.filter((c) => c.length === 0)).toHaveLength(1)
  })

  it('до жеста ни тега, ни буфера в глобале', () => {
    setup({ ym: false, ph: false })
    enable({ host: GAME_HOST, search: '', umamiKey: 'um_key' })
    expect(umScripts()).toHaveLength(0)
    expect((globalThis as { umami?: unknown }).umami).toBeUndefined()
  })

  it('падение Umami не отменяет цель в Метрику и PostHog', () => {
    const { ym, ph } = setup()
    ;(globalThis as { umami?: unknown }).umami = { track: () => { throw new Error('нет скрипта Umami') } }
    enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: 'ph_key', umamiKey: 'um_key' })
    firstGesture()
    track('ending', { id: 'family' })
    umScripts().forEach((s) => s.dispatchEvent(new Event('load')))
    expect(ym).toContainEqual([4242, 'reachGoal', 'ending', { id: 'family' }])
    expect(ph).toContainEqual(['capture', 'ending', { id: 'family' }])
  })

  it('имена целей и параметры те же, что у остальных: текст, долг и сид не попадают', () => {
    const um: UmCall[] = []
    const { ym } = setup({ ph: false })
    enable({ host: GAME_HOST, search: '', id: '4242', umamiKey: 'um_key' })
    firstGesture()
    const goals: Array<[Goal, Record<string, unknown>]> = [
      ['boot', { save: 'no', since: 3 }],
      ['milestone', { n: 25, day: 12 }],
      ['left', { phase: 'payday', day: 340, turns: 90, sec: 42, total: 300 }],
    ]
    for (const [goal, params] of goals) track(goal, params as never)
    umScriptArrived(um)
    for (const [goal, params] of goals) {
      expect(ym).toContainEqual([4242, 'reachGoal', goal, params])
      expect(um).toContainEqual([goal, params])
    }
    expect(JSON.stringify(um)).not.toMatch(/Мууу|отмазк|долг|\d{6}/)
  })
})
