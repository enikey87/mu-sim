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

  // #545: в ходе с реакцией вместо ответа (reactOnly) фон счёта — не первый текст Алика после сообщения
  it('ход с реакцией вместо ответа: свет ждёт настоящего ответа (#545)', async () => {
    const { game } = makeGame({ seed: 9 })
    game.S.mem[lightOff] = true
    game.S.stats.sent = 10
    game.S.arcs.boris = { i: 1, last: 0 }
    game.S.choices = null
    const choice = game.choices.find((c) => !c.act && c.tone === 'neutral') ?? game.choices.find((c) => !c.act)
    expect(choice, 'no-intent choice').toBeDefined()

    const origChance = game.chance
    game.chance = () => true // шанс реакции (0.18) и шанс «только реакция» (0.3) оба взяты
    const from = game.S.msgs.length
    await game.send(choice!)
    game.chance = origChance
    expect(game.S.ctx?.type, 'ход дошёл до реакции, а не ответа').toBe('reactOnly')

    // первый текст Алика после сообщения — не про свет, и правила фона в пуле StoryBeat закрыты
    const after = alikTexts(game.S.msgs.slice(from))
    expect(after.some((t) => /Свет отключили\?/.test(t)), after.join(' | ')).toBe(false)
    expect(game.rules.collect({ event: 'StoryBeat' }, game.facts()).map((r) => r.name)).not.toContain('Beat_LightOff')

    // после настоящего ответа фон дожимается: lightOff ещё жив, гейт открыт
    let heard: string | undefined
    for (let i = 0; i < 20 && !heard; i++) {
      const next = game.choices.find((c) => !c.act && c.tone === 'neutral') ?? game.choices.find((c) => !c.act)
      if (!next) break
      const before = game.S.msgs.length
      await game.send(next)
      heard = alikTexts(game.S.msgs.slice(before)).find((t) => /Свет отключили\?/.test(t))
      for (let j = 0; j < 10 && !heard; j++) {
        const later = game.S.msgs.length
        if ((await game.fire('StoryBeat'))?.name === 'Beat_LightOff') heard = alikTexts(game.S.msgs.slice(later))[0]
      }
    }
    expect(heard, 'свет прозвучал после настоящего ответа').toMatch(/Свет отключили\?/)
  })
})
