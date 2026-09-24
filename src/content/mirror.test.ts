// Зеркало (docs/design/mirror.md): третий ответ на допработу — отмазка Алика, правдивая в этой партии.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { valueOf } from '../engine/rules'
import { MIRROR, MIRROR_REPLY } from './mirror'

const pool = MIRROR.map(valueOf)
const replies = new Set(MIRROR_REPLY.map(valueOf))
const borisSick = (g: Game) => { g.S.arcs.boris = { i: 2, last: 0 }; g.S.actors.boris = { sick: true } }
const nivaAway = (g: Game) => { g.S.arcs.niva = { i: 1, last: 0 }; g.S.mem['intro.niva'] = true; g.S.mem['niva.away'] = true }
const job = async (g: Game) => { await g.job(); return g.S.msgs.findLast((m) => m.kind === 'job')! }
const texts = (g: Game, from: number, who: 'me' | 'alik') => g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === who ? [m.text] : []))

describe('зеркало', () => {
  it('в свежей партии зеркал нет — кнопки нет и нажатие ничего не делает', async () => {
    const { game } = makeGame()
    expect(game.canMirror()).toBe(false)
    const j = await job(game)
    const n = game.S.msgs.length
    await game.answerJob(j.id, 'mirror')
    expect(game.S.msgs.length).toBe(n)
    const still = game.S.msgs.find((m) => m.id === j.id)
    expect(still?.kind === 'job' && !still.answered).toBe(true)
  })

  it('каждое зеркало открыто только под своим фактом', () => {
    const { game } = makeGame()
    expect(game.mirrors()).toEqual([])
    borisSick(game)
    expect(game.mirrors().map((m) => m.me)).toEqual([pool[0].me])
    nivaAway(game)
    expect(game.mirrors().map((m) => m.me)).toEqual([pool[0].me, pool[1].me])
    game.S.actors.boris = { sick: false }
    expect(game.mirrors().map((m) => m.me)).toEqual([pool[1].me])
  })

  it('отказ зеркалом: отмазка из открытых, ответ — про неё же или общий; долг, календарь, настроение, ссора не тронуты', async () => {
    let own = 0
    let general = 0
    for (let seed = 1; seed <= 30; seed++) {
      const { game } = makeGame({ seed })
      borisSick(game)
      nivaAway(game)
      const j = await job(game)
      const [debt, day, mood, heat, money] = [game.S.debt, game.S.day, game.S.mood, game.S.mem['rude.heat'], game.S.money]
      const from = game.S.msgs.length
      await game.answerJob(j.id, 'mirror')
      const [me] = texts(game, from, 'me')
      const said = pool.find((m) => m.me === me)!
      expect(said, me).toBeDefined()
      const [alik] = texts(game, from, 'alik')
      const other = pool.filter((m) => m !== said).map((m) => m.alik)
      expect(other, alik).not.toContain(alik)
      if (alik === said.alik) own++
      else { expect(replies.has(alik), alik).toBe(true); general++ }
      expect([game.S.debt, game.S.day, game.S.mood, game.S.mem['rude.heat'], game.S.money]).toEqual([debt, day, mood, heat, money])
      expect(game.S.msgs.find((m) => m.id === j.id)).toMatchObject({ answered: true })
      expect(game.ui.busy).toBe(false)
    }
    expect(own).toBeGreaterThan(0)
    expect(general).toBeGreaterThan(0)
  })

  it('обычный отказ по-прежнему стоит настроения — зеркало от него отличается', async () => {
    const { game } = makeGame()
    borisSick(game)
    const j = await job(game)
    const mood = game.S.mood
    await game.answerJob(j.id, false)
    expect(game.S.mood).toBe(mood - 1)
  })

  it.each([['блок', 'blocked'], ['Алик умер', 'alik_dead'], ['телефон у Карине', 'phone.karine'], ['эндгейм', 'endgame.active']])('%s — зеркала нет, хотя факт открыт', (_, key) => {
    const { game } = makeGame()
    borisSick(game)
    expect(game.canMirror()).toBe(true)
    game.S.mem[key] = true
    expect(game.canMirror()).toBe(false)
  })
})
