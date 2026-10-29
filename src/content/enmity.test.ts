// Режим мира «вражда» (#1558): пока род объявил сход, ситком сжимается — новые сериалы не стартуют,
// начатые стоят, семья посредничает за примирение, а жизнь Алика доходит слухами от третьих лиц.
// Выход один — извинение игрока; вне режима (и после извинения) мир прежний, новых строк нет.
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import { valueOf } from './fact'
import { ENMITY_FAMILY, ENMITY_RUMORS } from './enmity'
import type { Game } from '../engine/game'

/** Строки пулов: сторож считает по ним, а не по тексту реплики. */
const ENMITY_FAMILY_TEXTS: readonly string[] = ENMITY_FAMILY.map((e) => valueOf(e).t)
const ENMITY_RUMOR_TEXTS: readonly string[] = ENMITY_RUMORS.map((e) => valueOf(e).t)

const saidTexts = (game: Game, from = 0) =>
  game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' ? [m.text] : []))
const familyLines = (game: Game, from = 0) =>
  saidTexts(game, from).filter((t) => ENMITY_FAMILY_TEXTS.includes(t))
const rumorCards = (game: Game, from = 0) =>
  game.S.msgs.slice(from).filter((m) => m.kind === 'fwd' && ENMITY_RUMOR_TEXTS.includes(m.text))

/** Ходы в окне вражды: мир дышит, но день не доходит до экрана «Вендетты» (там сериалов уже нет). */
async function playWindow(game: Game, turns: number): Promise<void> {
  for (let i = 0; i < turns; i++) await game.send({ text: 'Ну и ладно.', tone: 'neutral' })
}

describe('режим мира «вражда» (#1558)', () => {
  it('сериалы стоят: в режиме новые не стартуют и начатые не идут, вне режима — идут', () => {
    const { game } = makeGame()
    game.S.day = 200

    expect(game.availableArcs().length, 'вне режима сериалы доступны').toBeGreaterThan(0)
    game.S.mem.vendetta = true
    expect(game.availableArcs(), 'в режиме новых нет').toEqual([])

    game.S.arcs.rubik = { i: 0, last: game.S.day - 10 }
    expect(game.arcCanAdvance('rubik'), 'начатый сериал замер').toBe(false)

    // НК к самому гейту: извинение снимает сход — и мир снова доступен
    game.S.mem.vendetta = false
    expect(game.availableArcs().length, 'после извинения сериалы вернулись').toBeGreaterThan(0)
    expect(game.arcCanAdvance('rubik'), 'начатый сериал продолжился').toBe(true)
  })

  it('окно вражды: семья посредничает, слухи приходят, а сериалы не начинаются', async () => {
    const { game } = makeGame({ seed: 7 })
    game.S.day = 200
    Object.assign(game.S.mem, { vendetta: true, coldWar: true })
    const from = game.S.msgs.length

    await playWindow(game, 30)

    expect(familyLines(game, from).length, 'семья-посредник').toBeGreaterThanOrEqual(2)
    expect(rumorCards(game, from).length, 'слухи за стеклом').toBeGreaterThanOrEqual(2)
    expect(Object.keys(game.S.arcs), 'ни один сериал не начался').toEqual([])
  })

  it('извинение возвращает прежний мир: сериалы идут, семья и слухи молчат', async () => {
    const { game } = makeGame({ seed: 5 })
    game.S.day = 250
    Object.assign(game.S.mem, { vendetta: true, coldWar: true })

    // #1570: цена выхода — два извинения; первое только называет её и мир не возвращает
    await game.fire('PlayerSays', { intent: 'sorry', tone: 'polite' })
    expect(game.S.mem.vendetta, 'первое «прости» сняло сход').toBe(true)
    await game.fire('PlayerSays', { intent: 'sorry', tone: 'polite' })
    expect(game.S.mem.vendetta, 'сход снят').toBe(false)
    expect(game.availableArcs().length, 'сериалы снова доступны').toBeGreaterThan(0)

    const from = game.S.msgs.length
    await playWindow(game, 20)
    expect(familyLines(game, from), 'посредник больше не зовёт').toEqual([])
    expect(rumorCards(game, from), 'слухи кончились').toEqual([])
  })

  it('нейтральная партия режима не касается: ни посредника, ни слухов, сериалы идут', async () => {
    const { game } = makeGame({ seed: 3 })
    game.S.day = 200
    const from = game.S.msgs.length

    await playWindow(game, 20)

    expect(familyLines(game, from), 'семьи-посредника нет').toEqual([])
    expect(rumorCards(game, from), 'слухов нет').toEqual([])
    expect(Object.keys(game.S.arcs).length, 'сериалы идут как раньше').toBeGreaterThan(0)
  })
})
