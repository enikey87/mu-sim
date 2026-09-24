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
})
