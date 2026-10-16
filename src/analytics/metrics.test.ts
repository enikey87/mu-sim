// #611: счётчик Метрики. Приёмник подставной — живая Метрика не зовётся.
import { describe, it, expect, beforeEach } from 'vitest'
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

  it('счётчик не включается: пустой номер, чужой хост, ?debug, ?fast', () => {
    const cases: Array<[string, Parameters<typeof enable>[0]]> = [
      ['пустой номер', { host: GAME_HOST, search: '', id: '', posthogKey: '', umamiKey: '' }],
      ['localhost', { host: 'localhost', search: '', id: '12345' }],
      ['vite preview', { host: '127.0.0.1:4173', search: '', id: '12345' }],
      ['?debug', { host: GAME_HOST, search: search('debug'), id: '12345' }],
      ['?fast', { host: GAME_HOST, search: search('fast'), id: '12345' }],
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