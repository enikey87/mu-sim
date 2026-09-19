// Ответ игрока на только что прозвучавшее: легенда денег, вмешавшийся персонаж, воспоминание Алика.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { CHORUS_TALK, MEMORY_TALK } from './talk'
import { LEGENDS } from './legends'
import type { Game } from '../engine/game'

const talkOpt = (g: Game) => g.buildChoices().find((c) => c.act === 'talk')
async function ask(g: Game) {
  for (let seed = 0; seed < 30; seed++) { const c = talkOpt(g); if (c) return c }
  return undefined
}

describe('ответ на только что прозвучавшее', () => {
  it('после вмешательства Карине — вопрос Карине, отвечает Карине, и эта пара больше не предлагается', async () => {
    const { game } = makeGame()
    game.S.ctx = { chorus: 'karine' }
    const c = (await ask(game))!
    expect(CHORUS_TALK.karine.map((p) => p[0])).toContain(c.text)
    const from = game.S.msgs.length
    await game.send(c)
    const m = game.S.msgs.slice(from).find((x) => x.kind === 'text' && x.who === 'karine')
    expect(m).toBeDefined()
    game.S.ctx = { chorus: 'karine' }
    const next = await ask(game)
    expect(next?.text).not.toBe(c.text)
  })
  it('после реплики легенды — вопрос именно про неё', async () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    game.S.ctx = { legend: 'safe_baby' }
    const c = (await ask(game))!
    expect(LEGENDS.safe_baby.talk!.map((p) => p[0])).toContain(c.text)
  })
  it('после воспоминания — ответ на воспоминание', async () => {
    const { game } = makeGame()
    game.S.ctx = { memory: true }
    const c = (await ask(game))!
    expect(MEMORY_TALK.map((p) => p[0])).toContain(c.text)
  })
  it('у каждой легенды и каждого персонажа хора есть что спросить', () => {
    for (const [id, l] of Object.entries(LEGENDS)) expect(l.talk?.length, id).toBeGreaterThanOrEqual(2)
    for (const [who, p] of Object.entries(CHORUS_TALK)) expect(p.length, who).toBeGreaterThanOrEqual(2)
  })
})
