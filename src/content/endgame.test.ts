import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import { ENDGAME_FORMALITIES } from './endgame'
import type { Game } from '../engine/game'

const messages = (game: Game, from = 0) =>
  game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))

function finishPayday(game: Game, outcome = 'default'): void {
  game.S.mem.payday = outcome
  game.S.ending = `payday_${outcome}`
  game.S.endings[`payday_${outcome}`] = game.S.day
  game.closeEnding()
}

describe('бесконечная группа после Дня выплаты', () => {
  it('открывается один раз и сохраняет результат концовки', () => {
    const { game } = makeGame()
    game.S.debt = 0
    game.S.money = 252400

    finishPayday(game, 'real')

    expect(game.S.mem['endgame.active']).toBe(true)
    expect(game.S.mem['endgame.started']).toBe(game.S.day)
    expect(game.S.debt).toBe(0)
    expect(game.S.money).toBe(252400)
    expect(messages(game).join(' ')).toMatch(/ВЫПЛАТА ЗАКРЫТА/)
    expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])

    const count = game.S.msgs.length
    game.S.ending = 'payday_real'
    game.closeEnding()
    expect(game.S.msgs).toHaveLength(count)
  })

  it('учитывает вендетту только во вступлении', () => {
    const { game } = makeGame()
    game.S.endings.vendetta = game.S.day - 1

    finishPayday(game)

    expect(messages(game).join(' ')).toMatch(/вне политики/)
    expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
  })

  it('возвращает игрока, будит уведомления и продолжает формальности', async () => {
    const { game } = makeGame()
    finishPayday(game)

    for (const act of ['endgameLeave', 'endgameMute', 'endgameMoney']) {
      const before = game.S.msgs.length
      await game.send(game.choices.find((c) => c.act === act)!)
      expect(messages(game, before).length).toBeGreaterThan(2)
      expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
    }

    expect(game.S.mem['endgame.exits']).toBe(1)
    expect(game.S.mem['endgame.mutes']).toBe(1)
    expect(game.S.mem['endgame.forms']).toBeGreaterThanOrEqual(3)
    expect(messages(game).join(' ')).toMatch(/покинули группу/)
    expect(messages(game).join(' ')).toMatch(/добавил вас обратно/)
  })

  it('заменяет старые сюжетные ходы и новые концовки общим циклом', async () => {
    const { game } = makeGame()
    finishPayday(game)
    game.S.day = 900
    game.S.stats.sent = 400

    expect((await game.fire('StoryBeat'))?.name).toBe('Endgame_Formality')
    expect((await game.fire('CheckEnding'))?.name).toBe('Endgame_NoEnding')
    expect(game.S.ending).toBeNull()

    const reply = await game.fire('PlayerSays', { intent: 'request', tone: 'neutral' })
    expect(reply?.name).toBe('Endgame_Request')
  })

  it('счёт формальностей ведёт игра: юбилей звучит на своём счёте, номера в текстах не спорят с ним', async () => {
    const { game } = makeGame()
    finishPayday(game)
    for (let i = 0; i < 9; i++) await game.endgameFormality()
    expect(game.S.mem['endgame.forms']).toBe(9)
    const before = game.S.msgs.length
    await game.endgameFormality()
    expect(game.S.mem['endgame.forms']).toBe(10)
    expect(messages(game, before).join(' ')).toMatch(/Десять формальностей/)
    // «Формальность №1» выпадала бы и на пятидесятой: номер в пуле спорит со счётом
    expect(ENDGAME_FORMALITIES.join(' ')).not.toMatch(/№/)
  })
})
