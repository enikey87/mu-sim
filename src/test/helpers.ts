// Общие помощники тестов: игра с seeded-случайностью, ручными часами и памятью вместо localStorage.
import { Game, type GameOptions } from '../engine/game'
import { manualClock, type ManualClock } from '../engine/clock'
import { seededRng } from '../engine/rng'
import { setCount, type Storage } from '../engine/state'
import type { Msg } from '../engine/state'

export function memStorage(init: Record<string, string> = {}): Storage & { data: Record<string, string> } {
  const data = { ...init }
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v },
    removeItem: (k) => { delete data[k] },
  }
}

export interface TestGame { game: Game; clock: ManualClock; storage: ReturnType<typeof memStorage> }

export function makeGame(opts: Partial<GameOptions> & { seed?: number } = {}): TestGame {
  const clock = (opts.clock as ManualClock) ?? manualClock()
  const storage = (opts.storage as ReturnType<typeof memStorage>) ?? memStorage()
  const game = new Game({ hour: 14, noTimers: true, typos: false, strictSilence: true, ...opts, clock, storage, rng: opts.rng ?? seededRng(opts.seed ?? 1) })
  return { game, clock, storage }
}

/** Дождаться работы, начатой без await (пачка непрочитанных из конструктора): макрозадача — после всех микрозадач. */
export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export const alikTexts = (msgs: Msg[]): string[] =>
  msgs.filter((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text' && m.from === 'alik' && !m.deleted).map((m) => m.text)

// исправления опечаток («*бетон») — естественно повторяются, их не считаем
export const FIX_RE = /^\*|\*$|автозамена|Телефон новый|^Не «/

export { botTurn } from '../tools/bot'

/** Деньги партии — только через adjustMoney: в тестах ставим их здесь, одной строкой и явно. */
export const setMoney = (g: Game, n: number): void => { setCount(g.S, 'money', n) }
