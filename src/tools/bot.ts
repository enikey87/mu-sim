// Бот-игрок для симуляций: отвечает на допработу, заряжает телефон, иначе выбирает реплику (контекстную — чаще).
import type { Game } from '../engine/game'
import type { Choice } from '../engine/state'
import { endgame } from '../content/memkeys'

/**
 * Фразы свободного ввода по корпусу input.test.ts: готовые варианты их не заменяют, поэтому без
 * отдельного шанса (freeText) правила просьбы, угрозы и «Мууу» в симуляции недостижимы.
 */
const FREE = ['Верни деньги до пятницы', 'ВЕРНИ ДЕНЬГИ!!!', 'Я тебя убью', 'Я тебя найду', 'Муууу']
/** После выплаты корпус тот же, плюс нейтральная: фразы с тоном и намерением перехватывают раньше хода, и только она доходит до AlikTurn (#288). */
const FREE_ENDGAME = ['Я еще жду', ...FREE]

export async function botTurn(game: Game, pickCtx = 0.7, rude = 0.06, freeText = 0): Promise<Choice | null> {
  // как игрок: экран концовки закрывают, иначе эндгейм не начинается и гейт его не видит (#190)
  if (game.S.ending) { await game.closeEnding(); return null }
  if (game.battery.dead) { await game.battery.charge(); return null }
  const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)
  if (job) {
    // иногда зеркало — иначе оракул плейтеста его не видит (#256)
    const ans = game.canMirror() && game.chance(0.25) ? 'mirror' as const : game.chance(0.5)
    await game.answerJob(job.id, ans)
    return null
  }
  // карточка банка: кредит или продажа кнопкой в ленте, а не репликой Алику (#287)
  const offer = game.S.msgs.find((m) => m.kind === 'card' && m.offer && !m.answered)
  if (offer && game.rng.random() < 0.7) { game.answerCard(offer.id, game.rng.random() < 0.5 ? 'take' : 'sell'); return null }
  if (freeText > 0 && game.rng.random() < freeText) {
    const corpus = game.S.mem[endgame.active] ? FREE_ENDGAME : FREE
    await game.send(corpus[Math.floor(game.rng.random() * corpus.length)])
    return null
  }
  const cs = game.choices
  if (!cs.length) return null
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
