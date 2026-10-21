import { describe, it, expect } from 'vitest'
import type { Game } from '../engine/game'
import { makeGame } from '../test/helpers'
import { saidText } from './fact'
import { IDLE } from './life'
import { threatClaim } from './memkeys'

const COURT = /суде/
const idleLine = (game: Game): string => saidText(game.addrSaidLine('IDLE', IDLE))

describe('idle «ты там не в суде» — только после угрозы судом (#1184)', () => {
  it('без threat.claim строка не выпадает из IDLE; после «Я иду в суд!» — выпадает', async () => {
    const { game } = makeGame()
    const before: string[] = []
    for (let i = 0; i < IDLE.length; i++) before.push(idleLine(game))
    expect(before, 'пул IDLE пуст — проверка ничего не меряет').toHaveLength(IDLE.length)
    expect(before.some((t) => COURT.test(t)), 'суд без угрозы').toBe(false)

    await game.send('Я иду в суд!')
    expect(game.S.mem[threatClaim], 'угроза судом не поставила threat.claim — проверка пустеет').toBe('court')
    const after: string[] = []
    for (let i = 0; i < IDLE.length && !after.some((t) => COURT.test(t)); i++) after.push(idleLine(game))
    expect(after.some((t) => COURT.test(t)), 'после угрозы судом строка idle не выпала').toBe(true)
  })
})
