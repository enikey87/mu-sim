import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { ARCS } from './arcs'
import { FINALES } from './finales'
import { grantPaid, houseOnGarik, intro, taxFrozen } from './memkeys'

describe('гейты реплик серии до её remember (#450)', () => {
  it('новый акт сообщает об оплате Гранта и заморозке счетов до записи этих фактов', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.grant.eps[0], 'grant')
    expect(game.S.mem[grantPaid]).toBeUndefined()
    expect(game.S.mem[taxFrozen]).toBeUndefined()

    const from = game.S.msgs.length
    await game.playEpisode(ARCS.rubik.eps[7], 'rubik')
    const lines = alikTexts(game.S.msgs.slice(from))
    expect(lines.some((line) => line.includes('Объект сдан, Грант заплатил!'))).toBe(true)
    expect(lines.some((line) => line.includes('Счета заморожены. Деньги есть'))).toBe(true)
    expect(lines.some((line) => line.includes('Теперь и бумага'))).toBe(false)
    expect(game.S.mem[grantPaid]).toBe(true)
    expect(game.S.mem[taxFrozen]).toBe(true)
  })

  it('финал Гарика описывает дом, если тот стоял на нём до освобождения', async () => {
    const { game } = makeGame()
    game.S.mem[houseOnGarik] = true
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.garik.eps[5], 'garik')
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом просел на два сантиметра'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('финал Гарика без дома не выдумывает просадку', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.garik.eps[5], 'garik')
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом просел'))).toBe(false)
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Гарика достали!'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('частный финал Гарика помнит дом до освобождения', async () => {
    const { game } = makeGame()
    game.S.mem[houseOnGarik] = true
    const from = game.S.msgs.length
    await game.playFinale('garik', FINALES.garik.find((f) => f.id === 'cutter')!)
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом, говорят, просядет'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('финал Карине вводит Гранта и не теряет её первую реплику', async () => {
    const { game } = makeGame()
    expect(game.S.mem[intro('grant')]).toBeUndefined()
    const from = game.S.msgs.length
    await game.playFinale('rubik', FINALES.rubik.find((f) => f.id === 'karine')!)
    expect(game.S.msgs.slice(from).some((m) => m.kind === 'text' && m.who === 'karine' && m.text.startsWith('Это Карине.'))).toBe(true)
    expect(game.S.mem[intro('grant')]).toBe(true)
  })
})
