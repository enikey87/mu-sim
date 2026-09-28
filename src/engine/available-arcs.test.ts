import { describe, expect, it } from 'vitest'
import { ARCS } from '../content/arcs'
import { gte, missing } from '../content/fact'
import { collectorsRecruited, creditBroke, endgame } from '../content/memkeys'
import { makeGame } from '../test/helpers'

describe('availableArcs', () => {
  it('читает условия старта по текущим памяти и дню, включая отсутствующий ключ', () => {
    const { game } = makeGame()
    const arc = ARCS.collectors
    const when = arc.when
    const start = game.S.day
    arc.when = [...(when ?? []), gte('day', start + 1), missing(collectorsRecruited)]
    try {
      for (const [id, other] of Object.entries(ARCS)) {
        if (id !== 'collectors') game.S.arcs[id] = { i: other.eps.length, last: start - 10 }
      }
      const offered = () => game.availableArcs().includes('collectors')
      expect(offered()).toBe(false)
      expect(game.facts().arcAvailable).toBe(false)
      game.S.mem[creditBroke] = true
      game.S.mem.day = start + 100
      expect(offered()).toBe(false)
      game.S.day++
      expect(offered()).toBe(true)
      expect(game.facts().arcAvailable).toBe(true)
      game.S.mem[collectorsRecruited] = true
      expect(offered()).toBe(false)
      expect(game.facts().arcAvailable).toBe(false)
      delete game.S.mem[collectorsRecruited]
      expect(offered()).toBe(true)
      game.S.mem[endgame.active] = true
      expect(offered()).toBe(false)
      delete game.S.mem[endgame.active]
      game.S.mem[creditBroke] = false
      expect(offered()).toBe(false)
      game.S.mem[creditBroke] = true
      expect(offered()).toBe(true)
    } finally {
      arc.when = when
    }
  })

  it('не перечисляет всю память ради условия одной арки', () => {
    const { game } = makeGame()
    game.S.mem = new Proxy(game.S.mem, { ownKeys: () => { throw new Error('memory enumeration') } })
    game.S.mem[creditBroke] = true
    expect(game.availableArcs()).toContain('collectors')
  })
})
