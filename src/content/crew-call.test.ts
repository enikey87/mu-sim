// Звонок с объекта (docs/design/crew-call.md, #576): Тарон входит в историю своим звонком,
// звонок звучит один раз в середине партии и пишет факт crew.paid.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { alikDead, blocked, crewPaid, endgame } from './memkeys'
import { SPEAKS, WORLD } from './world'
import { is } from './fact'

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
