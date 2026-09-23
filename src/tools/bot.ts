// Бот-игрок для симуляций: отвечает на допработу, заряжает телефон, иначе выбирает реплику (контекстную — чаще).
import type { Game } from '../engine/game'
import type { Choice } from '../engine/state'

/**
 * Фразы свободного ввода по корпусу input.test.ts: готовые варианты их не заменяют, поэтому без
 * отдельного шанса (freeText) правила просьбы, угрозы и «Мууу» в симуляции недостижимы.
 */
const FREE = ['Верни деньги до пятницы', 'ВЕРНИ ДЕНЬГИ!!!', 'Я тебя убью', 'Я тебя найду', 'Муууу']

export async function botTurn(game: Game, pickCtx = 0.7, rude = 0.06, freeText = 0): Promise<Choice | null> {
  if (game.ui.dead) { await game.charge(); return null }
  const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)
  if (job) { await game.answerJob(job.id, game.chance(0.5)); return null }
  if (freeText > 0 && game.rng.random() < freeText) {
    await game.send(FREE[Math.floor(game.rng.random() * FREE.length)])
    return null
  }
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
