// Достижимость концовки `real` «Настоящие деньги» живой партией, а не подставленными фактами (#1436).
// Обе двери ослабленного условия (#1435) проходятся скриптованным игроком: только настоящие ходы —
// вежливые сообщения, официальные обращения в суд и кнопки поимки; ни одного set-факта.
import { describe, it, expect } from 'vitest'
import { Game } from '../engine/game'
import { manualClock } from '../engine/clock'
import { seededRng } from '../engine/rng'
import { ENDINGS, paydayOutcome } from './finales'
import type { Msg } from '../engine/state'

/** Официальное обращение: тон и категорию даёт классификатор, а не разметка в драйвере (#1435). */
const FORMAL_COURT = 'Добрый день. Направляю официальное обращение в суд: прошу приобщить документы к делу.'

/** Ход драйвера: реплика игрока (пул или свободный текст), ответ на допработу, карточка банка. */
type Sent =
  | { kind: 'text'; text: string; tone: string; category?: string }
  | { kind: 'choice'; text: string; tone: string; act?: string }
  | { kind: 'job'; yes: boolean }
  | { kind: 'card' }

interface Driven {
  game: Game
  sent: Sent[]
  /** Прирост ступени суда на каждое официальное обращение: по конвенции вежливого пути — 0, 1, 0, 1… */
  courtSteps: number[]
  /** Сколько раз кнопка поимки была предложена движком в момент нажатия. */
  catchSlots: number
  /** Сработавшие правила по событиям: имя каждого выигравшего правила партии. */
  fired: string[]
}

/**
 * Скриптованный игрок: вежливый тон до конца партии, ответы на допработы и карточки банка как у живого
 * игрока. `court` — после вежливой серии добирается до заседания официальными обращениями;
 * `catches` — вместо суда ловит Алика на лжи, пока не поймает три РАЗНЫЕ пары (#1481). Дальше Дня выплаты ведёт тот же цикл: сцену играют
 * её собственные кнопки. Ни одного прямого изменения фактов — только `send`/`answerJob`/`answerCard`.
 */
async function drive(seed: number, mode: 'court' | 'catches'): Promise<Driven> {
  const clock = manualClock(Date.parse('2026-09-14T12:00:00Z'))
  const game = new Game({ storage: null, clock, rng: seededRng(seed), noTimers: true, hour: 14, strictTurns: true })
  const sent: Sent[] = []
  const courtSteps: number[] = []
  const fired: string[] = []
  let catchSlots = 0
  game.rules.tracer = (t) => { if (t.chosen.length) fired.push(...t.chosen) }
  const court = (): number => Number(game.S.mem.court ?? 0)
  for (let turn = 0; turn < 600 && !game.S.mem.payday; turn++) {
    if (game.battery.dead) { await game.battery.charge(); continue }
    const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)
    if (job) { sent.push({ kind: 'job', yes: true }); await game.answerJob(job.id, true); continue }
    const card = game.S.msgs.find((m) => m.kind === 'card' && !!m.offer && !m.answered)
    if (card) { sent.push({ kind: 'card' }); game.answerCard(card.id, 'take'); continue }
    // Официальное обращение — только вне сцены: заседание играется своими кнопками, а не новым обращением
    if (mode === 'court' && game.S.ach.saint && !game.S.ach.court && !game.S.scene && court() < 7) {
      const before = court()
      await game.send(FORMAL_COURT)
      courtSteps.push(court() - before)
      sent.push({ kind: 'text', text: FORMAL_COURT, ...game.classifyInput(FORMAL_COURT) })
      continue
    }
    // Дверь (#1481) — три РАЗНЫЕ поимки, поэтому ловим, пока не наберётся три уникальные пары: повторная
    // поимка той же пары счётчик не двигает и требует новой пары, а не ещё одного нажатия
    const catchOpt = mode === 'catches' && game.S.ach.saint && Number(game.S.mem.caughtUnique ?? 0) < 3
      ? game.choices.find((c) => c.act === 'catchLie')
      : undefined
    if (catchOpt) {
      catchSlots++
      sent.push({ kind: 'choice', text: catchOpt.text, tone: catchOpt.tone, act: catchOpt.act })
      await game.send(catchOpt)
      continue
    }
    if (!game.choices.length) { await game.onIdle(); continue }
    // вежливый игрок: сначала кнопка с вежливым тоном, иначе первая предложенная. Соболезнование —
    // не давление по деньгам: траурная кнопка окна объявления смерти (#1610) уводит скрипт с его цели,
    // поэтому вежливый выбор её пропускает (утверждения партии те же)
    const c = game.choices.find((x) => x.tone === 'polite' && x.act !== 'condole') ?? game.choices[0]
    sent.push({ kind: 'choice', text: c.text, tone: c.tone, act: c.act })
    await game.send(c)
  }
  return { game, sent, courtSteps, catchSlots, fired }
}

const talk = (m: Msg): string =>
  m.kind === 'text' || m.kind === 'sys' || m.kind === 'transfer' ? m.text : ''

const said = (game: Game): string => game.S.msgs.map(talk).join('\n')

/** Общие утверждения обеих партий: вежливость без единой грубости, концовка real и её экран. */
function expectReal(d: Driven): void {
  const { game } = d
  // вежливая серия настоящая: ачивка saint и ни одного грубого или угрожающего сообщения за партию
  expect(game.S.ach.saint, 'вежливая серия не набралась').toBeTruthy()
  expect(d.sent.filter((s) => 'tone' in s && (s.tone === 'rude' || s.tone === 'threat')), 'в партии были угрозы или грубость').toEqual([])
  // партия дошла до Дня выплаты сюжетным путём, а не вызовом сцены из теста
  expect(d.fired.filter((n) => /^Beat_Payday($|_)/.test(n)), 'День выплаты открыло не правило').not.toEqual([])
  expect(game.S.mem.payday, 'исход не «Настоящие деньги»').toBe('real')
  // «весь долг настоящими»: исход закрывает долг, а не переписывает его
  expect(game.debt, 'долг не закрыт выплатой').toBe(0)
  expect(game.S.ending).toBe('payday_real')
  expect(paydayOutcome(String(game.S.ending))).toBe('real')
  // экран концовки — та запись, чьё условие держится на фактах партии
  const screen = ENDINGS.find((e) => e.id === game.S.ending)
  expect(screen, 'экрана для исхода нет').toBeTruthy()
  expect(screen!.when.every((c) => game.holds(c)), 'экран исхода не сходится с фактами партии').toBe(true)
}

describe('Достижимость «Настоящих денег» живой партией (#1436)', () => {
  it('вежливая серия и вежливый суд: заседание без единой угрозы, затем real', async () => {
    const d = await drive(1, 'court')
    const { game } = d
    // классификатор сам делает официальное обращение вежливым — драйвер разметку не подставляет
    expect(game.classifyInput(FORMAL_COURT)).toMatchObject({ tone: 'polite', category: 'threat' })
    // канцелярия двигает дело каждым вторым обращением: 0, 1, 0, 1… — иначе до заседания не дойти
    expect(d.courtSteps, 'ступени суда шли не по два обращения').toEqual([0, 1, 0, 1, 0, 1, 0, 1])
    expect(game.S.ach.court, 'заседание не состоялось').toBeTruthy()
    expectReal(d)
    // дверь — суд: исход называет заседание и не называет поимки
    expect(said(game), 'исход не сказал про суд').toMatch(/дошёл до суда/)
    expect(said(game), 'исход сослался на поимки на судебной двери').not.toMatch(/ловил меня на слове/)
  }, 120_000)

  it('вежливая серия и три поимки: без суда вообще, real через вторую дверь', async () => {
    const d = await drive(1, 'catches')
    const { game } = d
    // поимок могло быть больше трёх: повторная поимка той же пары не приближает дверь (#1481)
    expect(d.catchSlots, 'кнопку поимки не предлагали').toBeGreaterThanOrEqual(3)
    expect(Number(game.S.mem.caught), 'поимок меньше трёх').toBeGreaterThanOrEqual(3)
    expect(Number(game.S.mem.caughtUnique), 'разных поимок не три').toBe(3)
    expect(game.S.ach.liar3, 'третья поимка не зачтена').toBeTruthy()
    // суда в этой партии не было вовсе — значит, дверь именно вторая (saint И поимки)
    expect(game.S.mem.court, 'суд всё-таки двигался').toBeUndefined()
    expect(game.S.ach.court).toBeUndefined()
    expectReal(d)
    expect(said(game), 'исход не сказал про поимки').toMatch(/ловил меня на слове/)
    expect(said(game), 'исход сослался на суд, которого не было').not.toMatch(/дошёл до суда/)
  }, 120_000)
})
