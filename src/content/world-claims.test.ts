// #535: реплики не утверждают о мире то, чего не было (кран / Размик).
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import { isOpen, valueOf } from '../engine/rules'
import { D } from './excuses'
import { ENDGAME_RETURNER_LINES } from './endgame'
import { needs, WORLD } from './world'
import { gate } from './fact'

const craneLeft = () => {
  const e = (D.CONSTR as unknown[]).find((x) => {
    const v = valueOf(x as never) as { t?: string } | string
    const t = typeof v === 'string' ? v : v?.t
    return typeof t === 'string' && t.includes('Кран уехал на свадьбу')
  })
  expect(e, 'crane wedding excuse').toBeDefined()
  return e as Parameters<typeof isOpen>[0]
}

describe('утверждения о мире (#535)', () => {
  it('Размик на кране — «кран уехал» закрыт; после финала — открыт', () => {
    const { game } = makeGame()
    game.S.mem['arc.razmik'] = 1
    expect(game.holds(WORLD.razmikUp)).toBe(true)
    expect(isOpen(craneLeft(), game.lineFacts())).toBe(false)

    game.S.mem['finale.razmik'] = 'down'
    expect(game.holds(WORLD.razmikUp)).toBe(false)
    expect(isOpen(craneLeft(), game.lineFacts())).toBe(true)
  })

  it('NC: без гейта finale «кран уехал» открыт, пока Размик сверху', () => {
    const { game } = makeGame()
    game.S.mem['arc.razmik'] = 1
    const ungated = needs('crane')({ t: 'Кран уехал на свадьбу в Ереван', claims: ['crane_wedding'] })
    expect(isOpen(ungated, game.lineFacts())).toBe(true)
    expect(isOpen(craneLeft(), game.lineFacts())).toBe(false)
  })

  it('эндгейм Размика не утверждает «сверху» / «сорок метров» / «спустился»', () => {
    const { game } = makeGame()
    game.S.mem['arc.razmik'] = 1
    expect(game.holds(WORLD.razmikUp)).toBe(true)
    const pool = ENDGAME_RETURNER_LINES.razmik
    expect(pool.some((t) => /сверху|Сорок метров|Сам спустился/i.test(t))).toBe(false)

    // если вернуть «сверху видел» без гейта — строка была бы уместна и при спуске, и наверху;
    // колода tryDraw гейтов не читает, поэтому правка — переписывание, не needs('razmikUp')
    game.S.mem['finale.razmik'] = 'down'
    expect(game.holds(WORLD.razmikUp)).toBe(false)
    const heightClaim = 'Я сверху видел, куда ведёт выход. Никуда.'
    expect(pool).not.toContain(heightClaim)
    expect(isOpen(gate(WORLD.razmikUp)(heightClaim), game.lineFacts())).toBe(false)
    expect(isOpen(heightClaim, game.lineFacts())).toBe(true)
  })
})
