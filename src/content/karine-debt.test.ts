import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { ARCS } from './arcs'
import { FINALES } from './finales'
import { karineKnowsDebt, karineThinksTax } from './memkeys'

const karineLines = (game: Game, from: number) => game.S.msgs.slice(from)
  .flatMap((m) => m.kind === 'text' && m.who === 'karine' ? [m.text] : [])

async function choose(game: Game, go: string) {
  game.S.choices = null
  const option = game.choices.find((c) => c.go === go)
  expect(option, go).toBeDefined()
  await game.send(option!)
}

async function meetKarine(game: Game, answer: 'wrong' | 'tell') {
  await game.enterNode('wife', 'start')
  await choose(game, answer)
  expect(game.S.mem[karineKnowsDebt]).toBe(answer === 'tell' ? true : undefined)
  expect(game.S.mem[karineThinksTax]).toBe(answer === 'wrong' ? true : undefined)
}

describe('Карине знает, кто требует долг', () => {
  it.each(['wrong', 'tell'] as const)('финал похорон после ответа %s', async (answer) => {
    const { game } = makeGame()
    await meetKarine(game, answer)
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.alik_death.eps[5], 'alik_death')
    const lines = karineLines(game, from)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Подтверждаю: жив')
    expect(lines[0].includes('Ваш долг')).toBe(answer === 'tell')
  })

  it.each(['wrong', 'tell'] as const)('завещание после ответа %s', async (answer) => {
    const { game } = makeGame()
    await meetKarine(game, answer)
    await game.enterNode('deathbed', 'ask')
    await choose(game, 'forgive')
    await choose(game, 'revive')
    expect(game.S.ach.forgive).toBeDefined()
    const from = game.S.msgs.length
    await game.playFinale('alik_death', FINALES.alik_death.find((f) => f.id === 'will')!)
    const lines = karineLines(game, from)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('зачитали завещание')
    expect(lines[0].includes('Вы же его простили')).toBe(answer === 'tell')
  })

  it.each(['wrong', 'tell'] as const)('отказ делиться в День выплаты после ответа %s', async (answer) => {
    const { game } = makeGame()
    await meetKarine(game, answer)
    await game.enterNode('payday', 'split')
    const from = game.S.msgs.length
    await choose(game, 'refuse')
    const lines = karineLines(game, from)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.some((line) => line.includes('Переложишь нам'))).toBe(answer === 'tell')
  })

  it('в День выплаты Карине сначала представляется незнакомому игроку', async () => {
    const { game } = makeGame()
    await game.enterNode('payday', 'split')
    const from = game.S.msgs.length
    await choose(game, 'refuse')
    const lines = karineLines(game, from)
    expect(lines[0]).toContain('Я жена Алика')
    expect(lines.join(' ')).not.toContain('Переложишь нам')
  })
})
