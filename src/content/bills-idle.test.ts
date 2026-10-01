// #533: фоновые последствия счетов — не первая реплика после сообщения игрока.
import { describe, expect, it } from 'vitest'
import { alikTexts, makeGame } from '../test/helpers'
import { lightOff } from './memkeys'

describe('фоновые счета не отвечают игроку (#533)', () => {
  it('light.off → реплика без намерения: первая не про свет; свет — на AlikIdle', async () => {
    const { game } = makeGame({ seed: 11 })
    game.S.mem[lightOff] = true
    game.S.stats.sent = 10
    game.S.choices = null
    const choice = game.choices.find((c) => !c.act && c.tone === 'neutral') ?? game.choices.find((c) => !c.act)
    expect(choice, 'no-intent choice').toBeDefined()

    const from = game.S.msgs.length
    await game.send(choice!)
    const replied = alikTexts(game.S.msgs.slice(from))
    expect(replied.some((t) => /Свет отключили/.test(t)), replied.join(' | ')).toBe(false)
    expect(game.S.rules.once.Idle_LightOff).toBeUndefined()
    // реакция уехала с AlikTurn
    expect(game.rules.rules('AlikTurn').some((r) => r.name === 'Turn_LightOff' || r.name === 'Idle_LightOff')).toBe(false)
    expect(game.rules.rules('AlikIdle').some((r) => r.name === 'Idle_LightOff')).toBe(true)

    let light: string | undefined
    for (let i = 0; i < 40 && !light; i++) {
      const later = game.S.msgs.length
      if ((await game.fire('AlikIdle'))?.name === 'Idle_LightOff') light = alikTexts(game.S.msgs.slice(later))[0]
    }
    expect(light).toMatch(/Свет отключили/)
    expect(game.S.rules.once.Idle_LightOff).toBe(true)
  })
})
