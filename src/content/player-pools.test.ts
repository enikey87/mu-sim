import { describe, it, expect } from 'vitest'
import { requirePlayerPool, allPlayerPools, registerPlayerPool } from './player-pools'
import { P_VIA_BORIS } from './rules/player-choice-pools'

describe('PLAYER_POOLS (#491)', () => {
  it('реестр не пуст и держит вынесенные пулы choices', () => {
    expect(allPlayerPools().size).toBeGreaterThan(40)
    expect(allPlayerPools().get('P_VIA_BORIS')).toBe(P_VIA_BORIS)
    expect(allPlayerPools().has('WRONG_Q')).toBe(true)
  })

  it('NC: незарегистрированный пул — requirePlayerPool краснеет', () => {
    const orphan = ['Алик. Я уже продал гитару']
    expect(() => requirePlayerPool('P_ORPHAN', orphan)).toThrow(/unregistered player pool/)
  })

  it('NC: после register тот же массив проходит', () => {
    const lines = ['тест реестра']
    registerPlayerPool('P_TEST_TMP', lines)
    expect(() => requirePlayerPool('P_TEST_TMP', lines)).not.toThrow()
  })
})
