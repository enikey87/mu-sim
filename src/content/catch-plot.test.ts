// Сюжетные противоречия арок в бухгалтерии лжи (#1548): «Нива», обещание на условии, свадебные конверты.
// Класс держится парой утверждений и своей репликой игрока: пара без строки — не поимка, строка без пары — не кнопка.
import { describe, it, expect } from 'vitest'
import { LIE_ENVELOPES, LIE_NIVA, LIE_PROMISE, P_LIE_ENVELOPES, P_LIE_NIVA } from './lies'
import { conflicts, currentEpisode, openEpisodes } from './ledger'
import { makeGame, alikTexts, botTurn } from '../test/helpers'
import type { Game } from '../engine/game'
import type { ClaimKey } from './ids'
import { ARCS } from './arcs'
import { SOURCES } from './payday'
import { valueOf } from '../engine/rules'

const hear = (game: Game, claims: ClaimKey[], who?: string) =>
  game.alikMsg({ kind: 'text', from: 'alik', text: `реплика ${claims.join(',')}`, who }, claims)
const catchChoice = (game: Game) => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'catchLie') }
async function catchLie(game: Game): Promise<string> {
  const c = catchChoice(game)
  expect(c, 'кнопка «Поймать на лжи»').toBeDefined()
  const from = game.S.msgs.length
  await game.send(c!)
  return alikTexts(game.S.msgs.slice(from)).join(' ')
}
/** Реплика из пула: строка с пула или текст объекта-строки. */
const lines = (pool: readonly unknown[]): string[] => pool.map((e) => {
  const v = valueOf(e as never) as string | { t: string }
  return typeof v === 'string' ? v : v.t
})
const oneOf = (pool: readonly unknown[], text: string) => lines(pool).some((t) => text.includes(t.slice(0, 14)))

describe('класс «Нива»: пишет/вернулась сама против «ищем»', () => {
  it('её письмо после «ищем всем селом» рождает сюжетный эпизод и свою реплику игрока', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.niva.eps[1], 'niva')
    expect(catchChoice(game), 'пока версия одна — ловить нечего').toBeUndefined()
    await game.playEpisode(ARCS.niva.eps[4], 'niva')
    expect(currentEpisode(game.S.ledger)?.subject).toBe('niva.state')
    expect(game.facts().lieKind).toBe('niva')
    const c = catchChoice(game)!
    const lie = game.lie()!
    expect(lines(P_LIE_NIVA).some((t) => c.text.includes(game.X.fill(t, { old: lie.old.say, new: lie.new.say })))).toBe(true)
    expect(oneOf(LIE_NIVA, await catchLie(game))).toBe(true)
  })
  it('возвращение «Нивы» объясняет «искали → вернулась»: пара не рождается, а поздняя «задержка» ловится', async () => {
    const { game } = makeGame()
    for (const ep of ARCS.niva.eps.slice(0, 6)) await game.playEpisode(ep, 'niva')
    // эпизод один — «ищем всем селом» против её письма; «вернулась» пришла переходом, а не второй версией
    expect(currentEpisode(game.S.ledger)?.subject).toBe('niva.state')
    expect(openEpisodes(game.S.ledger, 'niva.state')).toHaveLength(1)
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ subject: 'niva.state', from: 'away', to: 'back' }))
    hear(game, ['niva_away'])
    expect(openEpisodes(game.S.ledger, 'niva.state')).toHaveLength(2)
    expect(game.facts().lieKind).toBe('niva')
  })
  it('поимка сюжетного противоречия не вытесняет вопрос про сериал', async () => {
    const { game } = makeGame()
    await game.playArc('niva') // вопрос «как там „Нива“?» открыт: ctx.arc стоит, серия не сегодня
    await game.playEpisode(ARCS.niva.eps[4], 'niva') // «Би-бип» против «ищем всем селом» — сюжетная поимка открыта
    game.S.day += 5 // по вопросу серия возможна: тот же день её не двигает
    game.S.choices = null
    const choices = game.buildChoices()
    expect(choices.some((c) => c.act === 'catchLie'), 'поимка в блоке').toBe(true)
    expect(choices.some((c) => c.act === 'arc' && c.arg === 'niva'), 'вопрос про «Ниву» уцелел').toBe(true)
    // поимка — добавочный вариант: вопрос сериала стоит выше, слот контекста поимка не занимает
    expect(choices.findIndex((c) => c.act === 'arc' && c.arg === 'niva')).toBeLessThan(choices.findIndex((c) => c.act === 'catchLie'))
  })
  it('«пишет сама» и «вернулась сама» не спорят: это одна история', () => {
    expect(conflicts('niva.state', 'writes', 'back')).toBe(false)
    expect(conflicts('niva.state', 'away', 'writes')).toBe(true)
    expect(conflicts('niva.state', 'away', 'back')).toBe(true)
  })
})

describe('класс «обещание на условии»: срок наступил, деньги не пришли', () => {
  it('реплика «условие выполнено — денег не добавило» публикует обе версии и даёт поимку', async () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'как «Нива» вернётся из Грузии', d: null, condition: 'niva.back' })
    expect(catchChoice(game), 'пока условие не наступило — обещание живо').toBeUndefined()
    game.promiseUnpaid(game.S.promises.length - 1)
    expect(currentEpisode(game.S.ledger)?.subject).toBe('promise.due')
    expect(game.facts().lieKind).toBe('promise')
    const c = catchChoice(game)!
    expect(c.text).toMatch(/условие/i)
    expect(oneOf(LIE_PROMISE, await catchLie(game))).toBe(true)
  })
  it('деньги по обещанию пришли — эпизод закрыт, обещание больше не ловится', () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'как ключ выйдет', d: null, condition: 'nune.keyPassed' })
    const i = game.S.promises.length - 1
    game.promiseUnpaid(i)
    expect(openEpisodes(game.S.ledger, 'promise.due')).toHaveLength(1)
    game.promiseKept(i)
    expect(openEpisodes(game.S.ledger, 'promise.due')).toHaveLength(0)
    expect(catchChoice(game)).toBeUndefined()
  })
  it('обещания разных записей не смешиваются в одну пару', () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'как Грант заплатит', d: null, condition: 'grant.paid' })
    game.recordPromise({ text: 'как ключ выйдет', d: null, condition: 'nune.keyPassed' })
    game.promiseUnpaid(0)
    expect(openEpisodes(game.S.ledger, 'promise.due')).toHaveLength(1)
    game.promiseUnpaid(1)
    expect(openEpisodes(game.S.ledger, 'promise.due')).toHaveLength(2)
    expect(conflicts('promise.due', 'open:0', 'unpaid:0')).toBe(true)
    expect(conflicts('promise.due', 'open:0', 'unpaid:1')).toBe(false)
  })
})

describe('класс «конверты Самвела»: у Самвела против «уже раздал»', () => {
  it('День выплаты говорит «раздал» — конверты, обещанные после свадьбы, ловятся', async () => {
    const { game } = makeGame()
    await game.say([{ t: 'Гости подарили конверты. Конверты у Самвела. Самвел танцует. Как дотанцует — поделим.', claims: ['samvel_envelopes'] }])
    expect(catchChoice(game), 'пока версия одна').toBeUndefined()
    const source = SOURCES.find((s) => /Самвел раздал свадебные конверты/.test(valueOf(s).t))!
    expect(valueOf(source).claims, 'строка Дня выплаты помечена версией «раздал»').toContain('samvel_envelopes_given')
    await game.say([source])
    expect(currentEpisode(game.S.ledger)?.subject).toBe('samvel.envelopes')
    expect(game.facts().lieKind).toBe('envelopes')
    const c = catchChoice(game)!
    expect(lines(P_LIE_ENVELOPES).some((t) => c.text.includes(t))).toBe(true)
    expect(oneOf(LIE_ENVELOPES, await catchLie(game))).toBe(true)
  })
})

describe('частота: новые классы не удваивают поток уличений', () => {
  it('за 300 ходов бота новых эпизодов не больше половины денежных', async () => {
    let fresh = 0
    let old = 0
    for (let seed = 1; seed <= 3; seed++) {
      const { game } = makeGame({ seed })
      for (let i = 0; i < 300; i++) {
        try { await botTurn(game) } catch { break }
      }
      const eps = game.S.ledger.episodes
      const plot = eps.filter((e) => e.subject === 'niva.state' || e.subject === 'promise.due' || e.subject === 'samvel.envelopes')
      fresh += plot.length
      old += eps.length - plot.length
    }
    // норма из задачи — рост не больше 1.5×: новые классы дают не больше половины прежнего потока
    expect(fresh, `новых ${fresh} против прежних ${old}`).toBeLessThanOrEqual(Math.ceil(old / 2))
  }, 120_000)
})
