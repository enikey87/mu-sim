// Ответ игрока на только что прозвучавшее: легенда денег, вмешавшийся персонаж, воспоминание Алика.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { CHORUS_TALK, MEMORY_TALK } from './talk'
import { LEGENDS } from './legends'
import type { Game } from '../engine/game'
import { valueOf } from '../engine/rules'
import type { Choice } from '../engine/state'

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
    expect(CHORUS_TALK.karine.map(valueOf).map((p) => p[0])).toContain(c.text)
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
    expect(LEGENDS.safe_baby.talk!.map(valueOf).map((p) => p[0])).toContain(c.text)
  })
  it('после воспоминания — ответ на воспоминание', async () => {
    const { game } = makeGame()
    game.S.ctx = { memory: true }
    const c = (await ask(game))!
    expect(MEMORY_TALK.map(valueOf).map((p) => p[0])).toContain(c.text)
  })
  it('у каждой легенды и каждого персонажа хора есть что спросить', () => {
    for (const [id, l] of Object.entries(LEGENDS)) expect(l.talk?.length, id).toBeGreaterThanOrEqual(2)
    for (const [who, p] of Object.entries(CHORUS_TALK)) expect(p.length, who).toBeGreaterThanOrEqual(2)
  })
})

describe('Гарик: признание признаёт отрицание (#784)', () => {
  /** Гарик сказал своё «ничего не брал» в этой партии — гоним хор, пока строка не выпадет. */
  const hearDenial = async (game: Game): Promise<boolean> => {
    game.S.mem['intro.garik'] = true
    for (let i = 0; i < 60; i++) {
      game.S.stats.sent += 20 // перерыв хора не помешает: он ходовой
      game.alikMsg({ kind: 'text', from: 'alik', text: 'Это Гарик виноват.' })
      const from = game.S.msgs.length
      await game.afterTurn()
      if (game.S.msgs.slice(from).some((m) => m.kind === 'text' && m.text.includes('ничего не брал'))) return true
    }
    return false
  }
  /** Кнопка-вопрос про перфоратор: у оффера есть шанс — перебираем кадры (как в jabs.test.ts). */
  const askTaken = (game: Game): Choice | undefined => {
    for (let i = 0; i < 20; i++) {
      game.S.choices = null
      const c = game.choices.find((x) => x.act === 'talk' && x.text === 'Гарик, а вы что-нибудь брали?')
      if (c) return c
    }
    return undefined
  }

  it('отрицание было — ответ на колкость его признаёт, а не спорит с ним', async () => {
    const { game } = makeGame({ seed: 11 })
    expect(await hearDenial(game), 'Гарик не сказал отрицание — проверка была бы пустой').toBe(true)
    expect(game.S.mem['garik.denied'], 'отрицание не записано фактом').toBe(true)
    const q = askTaken(game)
    expect(q, 'вопроса про перфоратор нет').toBeDefined()
    const from = game.S.msgs.length
    await game.send(q!)
    const answer = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.who === 'garik').map((m) => (m.kind === 'text' ? m.text : '')).join(' ')
    expect(answer, `ответ не признаёт отрицание: ${answer}`).toMatch(/ничего не брал/)
  })

  it('отрицания не было — признание на него не ссылается', async () => {
    const { game } = makeGame({ seed: 11 })
    game.S.mem['intro.garik'] = true
    game.S.ctx = { chorus: 'garik' }
    expect(game.S.mem['garik.denied'], 'факта отрицания нет в свежей партии').toBeUndefined()
    const q = askTaken(game)
    expect(q, 'вопроса про перфоратор нет').toBeDefined()
    const from = game.S.msgs.length
    await game.send(q!)
    const answer = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.who === 'garik').map((m) => (m.kind === 'text' ? m.text : '')).join(' ')
    expect(answer, `признание ссылается на несказанное отрицание: ${answer}`).not.toMatch(/сказал же/i)
  })
})
