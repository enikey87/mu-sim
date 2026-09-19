// Общие помощники тестов: игра с seeded-случайностью, ручными часами и памятью вместо localStorage.
import { Game, type GameOptions } from '../engine/game'
import { manualClock, type ManualClock } from '../engine/clock'
import { seededRng } from '../engine/rng'
import type { Storage } from '../engine/state'
import type { Choice, Msg } from '../engine/state'

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
  const game = new Game({ hour: 14, noTimers: true, ...opts, clock, storage, rng: opts.rng ?? seededRng(opts.seed ?? 1) })
  return { game, clock, storage }
}

export const alikTexts = (msgs: Msg[]): string[] =>
  msgs.filter((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text' && m.from === 'alik' && !m.deleted).map((m) => m.text)

// исправления опечаток («*бетон») — естественно повторяются, их не считаем
export const FIX_RE = /^\*|\*$|автозамена|Телефон новый|^Не «/

/** Бот: отвечает на допработу, заряжает телефон, иначе выбирает реплику (контекстную — чаще). */
export async function botTurn(game: Game, pickCtx = 0.7, rude = 0.06): Promise<Choice | null> {
  if (game.dead) { await game.charge(); return null }
  const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)
  if (job) { await game.answerJob(job.id, game.chance(0.5)); return null }
  const cs = game.choices
  const ctx = cs.filter((c) => c.act || c.scene)
  let c: Choice
  if (ctx.length && game.rng.random() < pickCtx) c = ctx[Math.floor(game.rng.random() * ctx.length)]
  else {
    const safe = cs.filter((x) => x.tone !== 'rude')
    c = game.rng.random() < rude ? (cs.find((x) => x.tone === 'rude') ?? cs[0]) : safe[Math.floor(game.rng.random() * safe.length)] ?? cs[0]
  }
  await game.send(c)
  return c
}
