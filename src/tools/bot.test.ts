import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { botTurn } from './bot'
import { flush } from '../test/helpers'

describe('coverage bot', () => {
  it('закрывает экран концовки — как игрок, иначе эндгейм не начинается (#190)', async () => {
    const { game } = makeGame()
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    expect(game.S.mem['endgame.active']).toBeUndefined()
    await botTurn(game)
    await flush()
    expect(game.S.ending).toBeNull()
    expect(game.S.mem['endgame.active']).toBe(true)
    expect(game.S.mem['lend50.asked']).toBe(true)
  })

  it('в эндгейме свободный текст бота доходит до AlikTurn (#288)', async () => {
    const { game } = makeGame({ seed: 4 })
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    await botTurn(game)
    await flush()
    expect(game.S.mem['endgame.active']).toBe(true)
    const chosen: string[] = []
    game.rules.tracer = (t) => chosen.push(...t.chosen)
    await botTurn(game, 0.7, 0.06, 1) // freeText = 1: всегда свободный текст
    expect(chosen).toContain('Endgame_Turn')
  })

  it('иногда отвечает на допработу зеркалом, когда оно открыто (#256)', async () => {
    let mirrored = 0
    for (let seed = 1; seed <= 80; seed++) {
      const { game } = makeGame({ seed })
      game.S.arcs.boris = { i: 2, last: 0 }
      game.S.actors.boris = { sick: true }
      await game.job()
      const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)!
      expect(game.canMirror()).toBe(true)
      const from = game.S.msgs.length
      await botTurn(game)
      const me = game.S.msgs.slice(from).find((m) => m.kind === 'text' && m.from === 'me')
      if (me && me.kind === 'text' && /Борис болеет|Нива|Самвел|кран|декрет/i.test(me.text)) mirrored++
      expect(game.S.msgs.find((m) => m.id === job.id)).toMatchObject({ answered: true })
    }
    expect(mirrored).toBeGreaterThan(5)
    expect(mirrored).toBeLessThan(60)
  })
})
