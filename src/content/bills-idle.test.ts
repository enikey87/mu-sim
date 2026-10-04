// #533: фоновые последствия счетов — не первая реплика после сообщения игрока.
import { describe, expect, it } from 'vitest'
import { alikTexts, makeGame } from '../test/helpers'
import { lightOff } from './memkeys'

describe('фоновые счета не отвечают игроку (#533)', () => {
  // сид 5 + arcs.boris: на родителе (Turn_LightOff на AlikTurn) свет — первая реплика после send
  it('light.off → реплика без намерения: первая не про свет; свет — на StoryBeat', async () => {
    const { game } = makeGame({ seed: 5 })
    game.S.mem[lightOff] = true
    game.S.stats.sent = 10
    game.S.arcs.boris = { i: 1, last: 0 }
    game.S.choices = null
    const choice = game.choices.find((c) => !c.act && c.tone === 'neutral') ?? game.choices.find((c) => !c.act)
    expect(choice, 'no-intent choice').toBeDefined()

    const from = game.S.msgs.length
    await game.send(choice!)
    const replied = alikTexts(game.S.msgs.slice(from))
    expect(replied[0], replied.join(' | ')).not.toMatch(/Свет отключили/)
    expect(game.rules.rules('AlikTurn').some((r) => /LightOff/.test(r.name))).toBe(false)
    expect(game.rules.rules('StoryBeat').some((r) => r.name === 'Beat_LightOff')).toBe(true)

    // StoryBeat того же хода мог уже сказать про свет — иначе дожимаем
    if (!game.S.rules.once.Beat_LightOff) {
      let light: string | undefined
      for (let i = 0; i < 40 && !light; i++) {
        const later = game.S.msgs.length
        if ((await game.fire('StoryBeat'))?.name === 'Beat_LightOff') light = alikTexts(game.S.msgs.slice(later))[0]
      }
      expect(light).toMatch(/Свет отключили/)
    }
    expect(game.S.rules.once.Beat_LightOff).toBe(true)
    expect(replied.concat(alikTexts(game.S.msgs.slice(from))).some((t) => /Свет отключили/.test(t))).toBe(true)
  })
})
