// Звонок с объекта (docs/design/crew-call.md, #576): Тарон входит в историю своим звонком,
// звонок звучит один раз в середине партии и пишет факт crew.paid.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import type { Game } from '../engine/game'
import { alikDead, blocked, crewPaid, endgame } from './memkeys'
import { CREW_CALL, CREW_PAID } from './crew'
import { SPEAKS, WORLD } from './world'
import { is, valueOf } from './fact'

const taronMsgs = (game: ReturnType<typeof makeGame>['game']) =>
  game.S.msgs.filter((m) => m.kind === 'text' && m.who === 'taron')
const sysMsgs = (game: ReturnType<typeof makeGame>['game']) =>
  game.S.msgs.filter((m) => m.kind === 'sys').map((m) => m.text)

describe('звонок с объекта', () => {
  it('Тарон молчит, пока не позвонил: в SPEAKS — факт знакомства, не «умеет писать»', () => {
    const { game } = makeGame()
    expect(SPEAKS.taron, 'в SPEAKS — только факт знакомства').toEqual(WORLD.taron)
    expect(is('intro.taron').key).toBe('intro.taron')
    expect(game.canSpeak('taron'), 'на свежей партии Тарон не говорит').toBe(false)
  })

  it('звонок в середине партии: строка системы, реплика Тарона, факт crew.paid', async () => {
    const { game } = makeGame()
    game.S.day = 210
    await game.fire('AlikIdle')
    expect(sysMsgs(game), 'звонок объявляется пропущенным').toContain('Пропущенный звонок: Тарон (объект)')
    const said = taronMsgs(game)
    expect(said.length, 'Тарон пишет сам — этим и входит в историю').toBe(1)
    expect(game.S.mem['intro.taron'], 'знакомство писал движок, не разметка').toBe(true)
    expect(game.S.mem[crewPaid], 'факт звонка — на доске мира').toBe(true)
  })

  it('единственный звонок не говорит, что Тарон уже звонил', async () => {
    const pool = CREW_CALL.map((e) => valueOf(e)[1]).join('\n')
    expect(pool).not.toMatch(/Это снова Тарон/)
    const { game } = makeGame()
    game.S.day = 210
    await game.fire('AlikIdle')
    expect(taronMsgs(game).flatMap((m) => (m.kind === 'text' ? [m.text] : [])).join(' ')).not.toMatch(/снова/)
    expect(game.S.mem[crewPaid]).toBe(true)
    await game.fire('AlikIdle')
    expect(taronMsgs(game)).toHaveLength(1)
  })

  it('звонок один раз за партию: второй idle молчит', async () => {
    const { game } = makeGame()
    game.S.day = 210
    await game.fire('AlikIdle')
    await game.fire('AlikIdle')
    await game.fire('AlikIdle')
    expect(taronMsgs(game).length).toBe(1)
    expect(sysMsgs(game).filter((t) => t === 'Пропущенный звонок: Тарон (объект)').length).toBe(1)
  })

  it('на первой неделе звонка нет: середина партии — гейт, а не случайность', async () => {
    const { game } = makeGame()
    game.S.day = 190
    await game.fire('AlikIdle')
    expect(taronMsgs(game)).toHaveLength(0)
    expect(game.S.mem[crewPaid]).toBeUndefined()
  })

  it('в окне блокировки, смерти, эндгейма и сцены звонка нет', async () => {
    for (const [what, setup] of [
      ['блок', (g: ReturnType<typeof makeGame>['game']) => { g.rules.applyOps([{ key: blocked, op: '=', value: true }], {}) }],
      ['смерть Алика', (g: ReturnType<typeof makeGame>['game']) => { g.rules.applyOps([{ key: alikDead, op: '=', value: true }], {}) }],
      ['эндгейм', (g: ReturnType<typeof makeGame>['game']) => { g.rules.applyOps([{ key: endgame.active, op: '=', value: true }], {}) }],
      // сцена открыта: состояние parties задано вручную — проверяем поведение правила, не путь
      ['сцена', (g: ReturnType<typeof makeGame>['game']) => { g.S.scene = { id: 'meet', node: 'ask', vars: {} } }],
    ] as const) {
      const { game } = makeGame()
      game.S.day = 210
      setup(game)
      await game.fire('AlikIdle')
      expect(taronMsgs(game), `в окне «${what}» звонка нет`).toHaveLength(0)
      expect(game.S.mem[crewPaid], `в окне «${what}» факт звонка не пишется`).toBeUndefined()
    }
  })
})

describe('упрёк по звонку с объекта', () => {
  /** Партия, в которой звонок уже состоялся: факт crew.paid, Тарон в истории. */
  const afterCall = async () => {
    const { game } = makeGame()
    game.S.day = 210
    await game.fire('AlikIdle')
    return game
  }
  const optCrewPaid = (g: Game) => g.rules.collect({ event: 'BuildChoices' }, g.facts()).filter((r) => r.name === 'Opt_CrewPaid')

  it('до звонка упрёка нет: оффер живёт под фактом crew.paid', async () => {
    const { game } = makeGame()
    game.S.day = 190
    await game.fire('AlikIdle')
    expect(game.S.mem[crewPaid]).toBeUndefined()
    expect(optCrewPaid(game)).toHaveLength(0)
  })

  it('после звонка кнопка упрёка собирается, и Алик отвечает из своего пула', async () => {
    const game = await afterCall()
    const rules = optCrewPaid(game)
    expect(rules).toHaveLength(1)
    const c = rules[0].offer!(game.rules.ctx(game, rules[0], { event: 'BuildChoices' }, game.facts()))
    expect(c?.act).toBe('crewPaid')
    expect(c?.text, 'кнопка — из пула упрёка').toBeTruthy()
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'crewPaid' })
    const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
    expect(CREW_PAID.some((l) => answer.includes(l)), `ответ не из пула: ${answer}`).toBe(true)
  })

  it('упрёк повторяем: второй отвечает другой строкой, звонок не объявляется снова', async () => {
    const game = await afterCall()
    const answers: string[] = []
    for (let i = 0; i < 2; i++) {
      const n = game.S.msgs.length
      await game.fire('PlayerSays', { intent: 'crewPaid' })
      answers.push(alikTexts(game.S.msgs.slice(n)).join(' '))
    }
    for (const a of answers) expect(CREW_PAID.some((l) => a.includes(l)), a).toBe(true)
    expect(answers[0], 'колода не зациклена на одной строке').not.toBe(answers[1])
    expect(sysMsgs(game).filter((t) => t === 'Пропущенный звонок: Тарон (объект)').length, 'звонок — один раз').toBe(1)
  })

  it('в окне блокировки и смерти упрёка нет', async () => {
    for (const [what, setup] of [
      ['блок', (g: Game) => { g.rules.applyOps([{ key: blocked, op: '=', value: true }], {}) }],
      ['смерть Алика', (g: Game) => { g.rules.applyOps([{ key: alikDead, op: '=', value: true }], {}) }],
    ] as const) {
      const game = await afterCall()
      setup(game)
      expect(optCrewPaid(game), `в окне «${what}» оффера нет`).toHaveLength(0)
    }
  })
})
