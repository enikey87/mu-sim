import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import {
  ENDGAME_ALIK_BACK, ENDGAME_FORMALITIES, ENDGAME_LEAVE, ENDGAME_MONEY, ENDGAME_MUTE,
  ENDGAME_RENAMES, ENDGAME_RETURNER_LINES, ENDGAME_RETURNERS,
} from './endgame'
import { valueOf } from '../engine/rules'
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

  it('колоды эндгейма большие и без дублей: длинная партия не циклит одни строки', () => {
    const pools: Array<[string, readonly string[], number]> = [
      ['money', ENDGAME_MONEY, 60],
      ['mute', ENDGAME_MUTE, 60],
      ['leave', ENDGAME_LEAVE, 60],
      ['formalities', ENDGAME_FORMALITIES, 150],
      ['renames', ENDGAME_RENAMES, 30],
    ]
    for (const [name, pool, min] of pools) {
      expect(new Set(pool).size, name).toBe(pool.length)
      expect(pool.length, name).toBeGreaterThanOrEqual(min)
    }
    expect(ENDGAME_FORMALITIES.join(' ')).not.toMatch(/№/)
  })

  it('одна шутка — один раз: ни одна пара строк не делит общий кусок ≥ 30 символов', () => {
    // общая подстрока такой длины — это та же шутка в новой обёртке («Коллеги, X» / «Итак, X»), а не новая шутка
    const shared = (a: string, b: string): number => {
      let best = 0
      for (let i = 0; i < a.length; i++) for (let len = best + 1; i + len <= a.length && len <= b.length; len++) {
        if (b.includes(a.slice(i, i + len))) best = len
      }
      return best
    }
    const pools: Array<[string, readonly string[]]> = [
      ['money', ENDGAME_MONEY],
      ['mute', ENDGAME_MUTE],
      ['leave', ENDGAME_LEAVE],
      ['formalities', ENDGAME_FORMALITIES],
      ['returners', Object.values(ENDGAME_RETURNER_LINES).flat()],
      ['alik-back', ENDGAME_ALIK_BACK],
    ]
    for (const [name, pool] of pools) {
      for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
        expect(shared(pool[i], pool[j]), `${name}: «${pool[i]}» / «${pool[j]}»`).toBeLessThan(30)
      }
    }
  })

  it('у каждого возвращателя ≥12 реплик, гейт знакомства — на его записи', () => {
    const whos = ENDGAME_RETURNERS.map((e) => valueOf(e).who)
    expect(whos).toHaveLength(6)
    for (const who of whos) {
      const lines = ENDGAME_RETURNER_LINES[who]
      expect(lines, who).toBeDefined()
      expect(lines.length, who).toBeGreaterThanOrEqual(12)
      expect(new Set(lines).size, who).toBe(lines.length)
    }
  })

  it('колода возвращателя выдаёт каждую реплику по разу и молчит, когда кончилась', () => {
    const { game } = makeGame()
    for (const [who, lines] of Object.entries(ENDGAME_RETURNER_LINES)) {
      const drawn = lines.map(() => game.decks.tryDraw(`ENDGAME_RETURNER.${who}`, lines, true))
      expect(new Set(drawn).size, who).toBe(lines.length)
      expect(game.decks.tryDraw(`ENDGAME_RETURNER.${who}`, lines, true), who).toBeNull()
    }
  })

  it('исчерпав запас, возвращатель перестаёт возвращать — дальше возвращает Алик', async () => {
    const { game } = makeGame()
    finishPayday(game)
    game.S.mem['met.samvel'] = true // единственный допустимый возвращатель
    const before = game.S.msgs.length
    for (let i = 0; i <= ENDGAME_RETURNER_LINES.samvel.length; i++) await game.send(game.choices.find((c) => c.act === 'endgameLeave')!)
    const spoken = game.S.msgs.slice(before).flatMap((m) => (m.kind === 'text' && m.who === 'samvel' ? [m.text] : []))
    expect(spoken).toHaveLength(ENDGAME_RETURNER_LINES.samvel.length)
    expect(new Set(spoken).size).toBe(spoken.length)
    expect(messages(game, before).join(' ')).toMatch(/Алик добавил вас обратно/)
    const quips = game.S.msgs.slice(before).flatMap((m) => (m.kind === 'text' && ENDGAME_ALIK_BACK.includes(m.text) ? [m.text] : []))
    expect(quips.length).toBeGreaterThan(0)
  })

  it('тридцать формальностей подряд — без повторов: колода тянет длинную партию', async () => {
    const { game } = makeGame()
    finishPayday(game)
    const before = game.S.msgs.length
    for (let i = 0; i < 30; i++) await game.endgameFormality()
    const said = messages(game, before).filter((t) => !/Десять формальностей/.test(t))
    expect(new Set(said).size, said.join(' | ')).toBe(said.length)
  })

  it('возвращающий говорит реплику из своей колоды', async () => {
    const { game } = makeGame()
    finishPayday(game)
    for (const who of Object.keys(ENDGAME_RETURNER_LINES)) game.S.mem[`met.${who}`] = true

    const before = game.S.msgs.length
    for (let i = 0; i < 12; i++) await game.send(game.choices.find((c) => c.act === 'endgameLeave')!)
    const spoken = game.S.msgs.slice(before).flatMap((m) => (m.kind === 'text' && m.who && m.who !== 'alik' ? [m] : []))
    expect(spoken.length).toBe(12)
    for (const m of spoken) expect(ENDGAME_RETURNER_LINES[m.who!], `${m.who}: ${m.text}`).toContain(m.text)
  })
})
