// #612: шесть целей Метрики. Приёмник подставной — живая Метрика не зовётся.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { enable, boot, shown, left, track, GAME_HOST } from './metrics'
import { makeGame } from '../test/helpers'
import { PAYDAY_OUTCOMES } from '../content/finales'

type Call = [number, string, ...unknown[]]

/** Цели, отправленные в приёмник: [имя, параметры]. */
function goals(): [string, Record<string, unknown>][] {
  const ym = (globalThis as { ym?: unknown }).ym as unknown as ((...a: unknown[]) => void) | undefined
  const q = (ym as { q?: unknown[][] }).q ?? []
  return q
    .filter((c): c is Call => Array.isArray(c) && c[1] === 'reachGoal')
    .map((c) => [String(c[2]), c[3] as Record<string, unknown>])
}

const receiver = () => {
  const calls: unknown[][] = []
  const ym = (...a: unknown[]) => { calls.push(a) }
  ;(ym as { q?: unknown[][] }).q = calls
  ;(globalThis as { ym?: unknown }).ym = ym
  return calls
}

beforeEach(() => {
  localStorage.clear()
  document.querySelectorAll('script[src*="mc.yandex.ru"]').forEach((s) => s.remove())
  enable({ host: '', search: '', id: '' })
  receiver()
  enable({ host: GAME_HOST, search: '', id: '4242' })
})

describe('boot: первый жест, один раз, since — дни с первого визита (#612)', () => {
  it('новая партия и партия из сохранения дают разный save', () => {
    boot('no')
    boot('yes')
    expect(goals()).toEqual([
      ['boot', { save: 'no', since: 0 }],
      ['boot', { save: 'yes', since: 0 }],
    ])
  })

  it('первый визит пишет день, второй календарный день даёт since больше нуля', () => {
    const day1 = new Date(2026, 2, 18, 10, 0, 0).getTime()
    boot('no', day1)
    expect(goals()).toEqual([['boot', { save: 'no', since: 0 }]])
    const sameDayLater = new Date(2026, 2, 18, 23, 30, 0).getTime()
    boot('no', sameDayLater)
    expect(goals().at(-1)).toEqual(['boot', { save: 'no', since: 0 }])
    boot('yes', new Date(2026, 2, 19, 0, 5, 0).getTime())
    expect(goals().at(-1)).toEqual(['boot', { save: 'yes', since: 1 }])
    boot('no', new Date(2026, 2, 22, 12, 0, 0).getTime())
    expect(goals().at(-1)).toEqual(['boot', { save: 'no', since: 4 }])
  })

  it('счётчик молчит — день первого визита не пишется', () => {
    enable({ host: '', search: '', id: '' })
    boot('no')
    expect(goals()).toHaveLength(0)
    expect(localStorage.length).toBe(0)
  })
})

describe('left: отрезок закрывают скрытие и pagehide, второй раз цель не шлётся (#612)', () => {
  const depth = { phase: 'chat', day: 12, turns: 3 } as const

  it('секунды видимости копятся, total растёт, пока вкладка скрыта время не идёт', () => {
    shown(0)
    left(depth, 30_000)
    expect(goals().at(-1)).toEqual(['left', { phase: 'chat', day: 12, turns: 3, sec: 30, total: 30 }])

    // скрыта: 60 секунд проходят, но цель уже отправлена — время не идёт
    left(depth, 90_000)
    expect(goals()).toHaveLength(1)

    shown(100_000)
    left(depth, 130_000)
    expect(goals().at(-1)).toEqual(['left', { phase: 'chat', day: 12, turns: 3, sec: 30, total: 60 }])
  })

  it('фаза, день и ходы — это глубина партии, а не время', () => {
    for (const phase of ['intro', 'chat', 'payday', 'endgame'] as const) {
      shown(0)
      left({ ...depth, phase }, 10_000)
    }
    expect(goals().map(([, p]) => p.phase)).toEqual(['intro', 'chat', 'payday', 'endgame'])
    for (const [, p] of goals()) expect(p.day).toBe(12)
  })

  it('счётчик молчит — отрезок не пишет ни цели, ни сумму секунд', () => {
    enable({ host: '', search: '', id: '' })
    shown(0)
    left(depth, 30_000)
    expect(goals()).toHaveLength(0)
    expect(localStorage.getItem('alik.visibleSec')).toBeNull()
  })
})

describe('milestone: пороги сообщений игрока (#612)', () => {
  it('порог, пройденный до загрузки, не досылается', async () => {
    const { game } = makeGame({ seed: 2 })
    game.S.stats.sent = 9
    const before = goals().length
    await game.fire('CheckEnding')
    expect(game.S.stats.sent).toBe(9)
    expect(goals()).toHaveLength(before)
  })

  it('пересечение порога шлёт цель один раз, «Начать заново» считает с нуля', async () => {
    const { game } = makeGame({ seed: 2 })
    game.S.day = 7
    const send = async () => { await game.send({ text: 'Брат, я в холодильнике у дедушки', tone: 'neutral' }) }
    await send()
    // день цели — глубина партии в момент сообщения (7), а не после хода
    expect(goals().filter(([n]) => n === 'milestone')).toEqual([['milestone', { n: 1, day: 7 }]])
    await send()
    await send()
    expect(goals().filter(([n]) => n === 'milestone')).toHaveLength(1)

    const fresh = makeGame({ seed: 3 })
    await fresh.game.send({ text: 'Здравствуйте', tone: 'neutral' })
    expect(goals().filter(([n]) => n === 'milestone')).toHaveLength(2)
  })
})

describe('ending, endgame, copied: экран концовки и её хвост (#612)', () => {
  it('экран концовки шлёт ending с id, копирование — copied с тем же id и без текста', async () => {
    const { game } = makeGame()
    game.S.arcs.samvel = { i: 8, last: 0 }
    game.S.mem['finale.samvel'] = 'groom'
    game.S.day = 320
    await game.fire('CheckEnding')
    const ending = goals().find(([n]) => n === 'ending')
    expect(ending).toEqual(['ending', { id: 'family' }])

    track('copied', { id: 'family' })
    const copied = goals().find(([n]) => n === 'copied')
    expect(copied).toEqual(['copied', { id: 'family' }])
    expect(JSON.stringify(goals())).not.toMatch(/Породнились/)
  })

  it('закрытие экрана Дня выплаты создаёт группу и шлёт endgame с исходом', async () => {
    const { game } = makeGame()
    game.S.day = 340
    Object.assign(game.S.mem, { payday: 'coins', 'payday.chain': 'Лежали в сейфе.' })
    await game.fire('CheckEnding')
    expect(goals().find(([n]) => n === 'ending')).toEqual(['ending', { id: 'payday_coins' }])
    await game.closeEnding()
    expect(goals().find(([n]) => n === 'endgame')).toEqual(['endgame', { outcome: 'coins' }])
    expect(PAYDAY_OUTCOMES).toContain('coins')
  })

  it('исход endgame — хвост id концовки, а не то, что лежит в памяти сцены', async () => {
    const { game } = makeGame()
    game.S.day = 340
    // память сцены говорит одно, экран концовки — другое: правда в id
    Object.assign(game.S.mem, { payday: 'lavash', 'payday.chain': 'Цепочка.' })
    await game.reachEnding('payday_coins')
    await game.closeEnding()
    expect(goals().find(([n]) => n === 'endgame')).toEqual(['endgame', { outcome: 'coins' }])
  })

  it('каждый исход Дня выплаты даёт свой outcome — из id, а не из текста', async () => {
    for (const outcome of PAYDAY_OUTCOMES) {
      enable({ host: GAME_HOST, search: '', id: '4242' })
      const { game } = makeGame()
      game.S.day = 340
      Object.assign(game.S.mem, { payday: outcome, 'payday.chain': 'Цепочка.' })
      await game.fire('CheckEnding')
      await game.closeEnding()
      const got = goals().filter(([n]) => n === 'endgame').at(-1)
      expect(got, outcome).toEqual(['endgame', { outcome }])
    }
  })
})
describe('фоновая вкладка при загрузке (#612)', () => {
  it('страница, открытая скрытой, секунд не набирает', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    try {
      shown(0)
      left({ phase: 'intro', day: 0, turns: 0 }, 60_000)
      expect(goals().filter(([n]) => n === 'left')).toHaveLength(0)
      hidden.mockReturnValue(false)
      shown(0)
      left({ phase: 'intro', day: 0, turns: 0 }, 10_000)
      expect(goals().at(-1)).toEqual(['left', { phase: 'intro', day: 0, turns: 0, sec: 10, total: 10 }])
    } finally {
      hidden.mockRestore()
    }
  })
})
