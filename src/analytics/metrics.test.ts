// @vitest-environment jsdom
// #611: счётчик Метрики. Приёмник подставной — живая Метрика не зовётся.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { enable, firstGesture, isOn, track, COUNTER_ID, GAME_HOST, type Goal } from './metrics'
import { ENDINGS, PAYDAY_OUTCOMES } from '../content/finales'

type Call = [number, string, ...unknown[]]

const receiver = () => {
  const calls: Call[] = []
  ;(globalThis as { ym?: unknown }).ym = (...args: unknown[]) => { calls.push(args as Call) }
  return calls
}
const scripts = () => [...document.querySelectorAll('script[src*="mc.yandex.ru"]')]
const search = (extra = '') => `?${extra}`

beforeEach(() => {
  delete (globalThis as { ym?: unknown }).ym
  delete (globalThis as { disableYaCounter?: unknown }).disableYaCounter
  document.querySelectorAll('script[src*="mc.yandex.ru"]').forEach((s) => s.remove())
  // модульное состояние счётчика — с нуля на каждый тест
  enable({ host: '', search: '', id: '' })
})

describe('счётчик Метрики: молчит, пока не выполнены все три условия (#611)', () => {
  it('пустой номер в константе — прод по умолчанию тихий, и это исправное состояние', () => {
    expect(COUNTER_ID).toBe('')
  })

  it('счётчик не включается: пустой номер, чужой хост, ?debug, ?fast, ?noidle', () => {
    const cases: Array<[string, Parameters<typeof enable>[0]]> = [
      ['пустой номер', { host: GAME_HOST, search: '', id: '', posthogKey: '', umamiKey: '' }],
      ['localhost', { host: 'localhost', search: '', id: '12345' }],
      ['vite preview', { host: '127.0.0.1:4173', search: '', id: '12345' }],
      ['?debug', { host: GAME_HOST, search: search('debug'), id: '12345' }],
      ['?fast', { host: GAME_HOST, search: search('fast'), id: '12345' }],
      ['?noidle', { host: GAME_HOST, search: search('noidle'), id: '12345' }],
      ['Яндекс Игры', { host: 'games.yandex.ru', search: '', id: '12345' }],
      ['VK', { host: 'vk.com', search: '', id: '12345' }],
    ]
    for (const [name, opts] of cases) {
      const calls = receiver()
      expect(enable(opts), name).toBe(false)
      expect(isOn(), name).toBe(false)
      firstGesture()
      track('ending', { id: 'family' })
      expect(calls, name).toHaveLength(0)
      expect(scripts(), name).toHaveLength(0)
    }
  })

  it('номер задан и хост игры — после жеста приёмник получает init с выключенным вебвизором', () => {
    const calls = receiver()
    expect(enable({ host: GAME_HOST, search: '', id: '4242' })).toBe(true)
    expect(isOn()).toBe(true)
    firstGesture()
    const init = calls.find((c) => c[1] === 'init')
    expect(init?.[0]).toBe(4242)
    expect(init?.[2]).toMatchObject({ webvisor: false, clickmap: false, trackLinks: false, accurateTrackBounce: true })
    expect(calls.some((c) => c[1] === 'hit')).toBe(true)
    expect(scripts().map((s) => (s as HTMLScriptElement).src)).toEqual([expect.stringContaining('mc.yandex.ru/metrika/tag.js')])
  })

  it('до жеста сеть не трогаем: init/hit и тег появляются только на firstGesture', () => {
    const calls = receiver()
    enable({ host: GAME_HOST, search: '', id: '4242' })
    expect(calls).toHaveLength(0)
    expect(scripts()).toHaveLength(0)
    firstGesture()
    expect(calls.length).toBeGreaterThan(0)
    expect(scripts()).toHaveLength(1)
  })

  it('клиент Метрики жив: disableYaCounter не выставлен (иначе пустеет «Возвращаемость»)', () => {
    receiver()
    enable({ host: GAME_HOST, search: '', id: '4242' })
    firstGesture()
    track('boot', { save: 'no', since: 0 })
    expect((globalThis as { disableYaCounter?: unknown }).disableYaCounter).toBeUndefined()
  })

  it('track молчит, пока счётчик выключен, и говорит сразу после включения', () => {
    const calls = receiver()
    track('ending', { id: 'family' })
    expect(calls).toHaveLength(0)
    enable({ host: GAME_HOST, search: '', id: '4242' })
    track('ending', { id: 'payday_coins' })
    expect(calls).toEqual([[4242, 'reachGoal', 'ending', { id: 'payday_coins' }]])
  })
})

describe('параметры цели не принимают текст сообщения (#611)', () => {
  it('id концовки — из ENDINGS, произвольная строка не компилируется', () => {
    // @ts-expect-error текст сообщения не EndingId
    const bad: Parameters<typeof track>[1] = { id: 'Брат, я в холодильнике у дедушки' }
    void bad
    // @ts-expect-error goal вне списка
    track('chat', {})
    // @ts-expect-error текст реплики в параметрах boot
    track('boot', { save: 'no', since: 0, text: 'Мууу' })
    // @ts-expect-error outcome — только исходы Дня выплаты
    track('endgame', { outcome: 'payed' })
    // @ts-expect-error фаза закрыта списком
    track('left', { phase: 'sheet', day: 3, turns: 10, sec: 5, total: 9 })
    // живые цели компилируются
    expect(ENDINGS.every((e) => e.id.startsWith('payday_') || typeof e.id === 'string')).toBe(true)
    for (const g of ['boot', 'milestone', 'ending', 'copied', 'endgame', 'left'] as Goal[]) expect(g).toBeTruthy()
  })

  it('ни один параметр цели не строковый кроме закрытых перечислений', () => {
    const calls = receiver()
    enable({ host: GAME_HOST, search: '', id: '4242' })
    track('milestone', { n: 25, day: 12 })
    track('copied', { id: 'multiverse' })
    track('endgame', { outcome: 'strasbourg' })
    track('left', { phase: 'payday', day: 340, turns: 90, sec: 42, total: 300 })
    const json = JSON.stringify(calls.map((c) => c.slice(3)))
    expect(json).not.toMatch(/Мууу|отмазк|долг/)
    expect(json).toContain('"phase":"payday"')
  })

  it('исходы endgame совпадают с хвостами id payday_*', () => {
    const tails = ENDINGS.filter((e) => e.id.startsWith('payday_')).map((e) => e.id.slice(7))
    expect([...tails].sort()).toEqual([...PAYDAY_OUTCOMES].sort())
  })
})

describe('прогон с репликой игрока не кладёт её текст в приёмник (#611)', () => {
  it('после хода текст сообщения в целях не появляется', async () => {
    const calls = receiver()
    enable({ host: GAME_HOST, search: '', id: '4242' })
    firstGesture()
    calls.length = 0
    const { makeGame, flush } = await import('../test/helpers')
    const { game } = makeGame({ seed: 2 })
    await game.fire('CheckEnding')
    await flush()
    expect(game.S.stats.sent).toBeGreaterThanOrEqual(0)
    const blob = JSON.stringify(calls)
    for (const m of game.S.msgs) {
      if (m.kind === 'text') expect(blob).not.toContain(m.text)
    }
    expect(blob).not.toContain(String(game.S.debt))
  })
})

describe('один просмотр за загрузку (#611)', () => {
  it('повторные состояния интерфейса просмотр не шлют', () => {
    const calls = receiver()
    enable({ host: GAME_HOST, search: '', id: '4242' })
    firstGesture()
    const hits = calls.filter((c) => c[1] === 'hit').length
    // состояния интерфейса (смена рендера, досье, тост) вызова track не делают
    track('ending', { id: 'family' })
    track('copied', { id: 'family' })
    expect(calls.filter((c) => c[1] === 'hit').length).toBe(hits)
    expect(calls.filter((c) => c[1] === 'init').length).toBe(1)
    expect(scripts()).toHaveLength(1)
  })

  it('повторный жест и смена игры просмотр не дублируют', () => {
    const calls = receiver()
    enable({ host: GAME_HOST, search: '', id: '4242' })
    firstGesture()
    firstGesture() // второй жест, «Начать заново», смена рендера
    expect(calls.filter((c) => c[1] === 'init')).toHaveLength(1)
    expect(calls.filter((c) => c[1] === 'hit')).toHaveLength(1)
    expect(scripts()).toHaveLength(1)
  })
})

// #1258: ключи живут в переменных сборки, а не в коде. Модуль читает их при загрузке,
// поэтому каждый случай — свой импорт после подмены окружения.
const receiversTags = () =>
  [...document.querySelectorAll('script[src*="mc.yandex.ru"], script[src*="posthog"], script[src*="umami"]')]

describe('ключи приёмников — из переменных сборки, а не из кода (#1258)', () => {
  // isolate: false (vite.config) — jsdom-документ и модульный реестр общие на воркере:
  // чужой файл мог оставить свой тег приёмника в документе, а этот блок меряет абсолютную
  // чистоту. Чистим ДО каждого теста тоже — утверждение про «наш модуль ничего не грузит»,
  // а не про «в общем документе ничего нет» (флейк CI 27.10: посторонний posthog-тег).
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    receiversTags().forEach((s) => s.remove())
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    receiversTags().forEach((s) => s.remove())
  })

  it('переменные не заданы — все три ключа пусты, приёмники молчат, тегов нет', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_METRIKA_COUNTER', '')
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', '')
    const fresh = await import('./metrics')
    // захардкоженный ключ в модуле провалит ровно это утверждение
    expect([fresh.COUNTER_ID, fresh.POSTHOG_KEY, fresh.UMAMI_KEY]).toEqual(['', '', ''])
    expect(fresh.enable({ host: fresh.GAME_HOST, search: '' })).toBe(false)
    expect(fresh.isOn()).toBe(false)
    fresh.firstGesture()
    expect(receiversTags()).toHaveLength(0)
  })

  it('переменные заполнены — ключи из окружения, теги встают по первому жесту', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_METRIKA_COUNTER', '4242')
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'umami-test')
    const fresh = await import('./metrics')
    expect([fresh.COUNTER_ID, fresh.POSTHOG_KEY, fresh.UMAMI_KEY]).toEqual(['4242', 'phc_test', 'umami-test'])
    const calls = receiver()
    expect(fresh.enable({ host: fresh.GAME_HOST, search: '' })).toBe(true)
    fresh.firstGesture()
    expect(calls.some((c) => c[0] === 4242 && c[1] === 'init')).toBe(true)
    const srcs = receiversTags().map((s) => (s as HTMLScriptElement).src)
    expect(srcs).toEqual(expect.arrayContaining([
      expect.stringContaining('mc.yandex.ru/metrika/tag.js'),
      expect.stringContaining('array.js'),
      expect.stringContaining('cloud.umami.is/script.js'),
    ]))
    const umamiTag = document.querySelector('script[src*="cloud.umami.is"]')
    expect(umamiTag?.getAttribute('data-website-id')).toBe('umami-test')
  })

  it('пробелы вокруг значения ключом не считаются', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_METRIKA_COUNTER', '   ')
    vi.stubEnv('VITE_POSTHOG_KEY', '  ')
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', ' ')
    const fresh = await import('./metrics')
    expect([fresh.COUNTER_ID, fresh.POSTHOG_KEY, fresh.UMAMI_KEY]).toEqual(['', '', ''])
    expect(fresh.enable({ host: fresh.GAME_HOST, search: '' })).toBe(false)
  })
})
describe('заглушка ym до прихода tag.js: протокол официального сниппета (27.10, Метрика молчала при живом теге)', () => {
  it('очередь ложится в ym.a — её читает tag.js; в ym.q её нет', () => {
    enable({ host: GAME_HOST, search: '', id: '4242' })
    firstGesture()
    const stub = (globalThis as { ym?: { a?: unknown[][]; q?: unknown[][] } }).ym
    expect(typeof stub, 'жест обязан поставить заглушку-функцию').toBe('function')
    expect(stub!.a, 'очередь в ym.a: init и hit').toBeTruthy()
    expect(stub!.a!.length).toBeGreaterThanOrEqual(2)
    expect(stub!.a![0]![0]).toBe(4242)
    expect(stub!.a![0]![1]).toBe('init')
    expect(stub!.a![1]![1]).toBe('hit')
    expect(stub!.q, 'ym.q — не протокольное поле: tag.js его не читает').toBeUndefined()
  })

  it('разыгранная tag.js очередь доносит init и hit до настоящего счётчика', () => {
    enable({ host: GAME_HOST, search: '', id: '4242' })
    firstGesture()
    const stub = (globalThis as { ym?: { a?: unknown[][] } }).ym
    // tag.js на приходе применяет записи из ym.a и заменяет заглушку настоящим API
    const delivered: Call[] = []
    for (const entry of stub!.a ?? []) delivered.push(entry as Call)
    ;(globalThis as { ym?: unknown }).ym = (...args: unknown[]) => { delivered.push(args as Call) }
    expect(delivered.some((c) => c[1] === 'init' && c[0] === 4242), 'init дошёл').toBe(true)
    expect(delivered.some((c) => c[1] === 'hit'), 'hit дошёл').toBe(true)
  })
})
