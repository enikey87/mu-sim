// Пул окна «ты обиделся?» (#1620): событие повторяется в одной партии, `offendedAskFresh` открывает
// окно заново, а колода пула продолжает с того места, где остановилась. Три строки выгорали за первое
// окно, второе окно начинало пул заново — строка звучала дословным повтором (547117, repeat-window
// логического слоя). Здесь держатся три вещи: глубина на два окна, уникальность строк по стеблю и
// премисса долга — ни имени персонажа, ни суммы, которыми line-review ловит фантомы категории 6.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { valueOf } from './fact'
import { P_OFFENDED_ASK } from './rules/player-choice-pools'
import { offendedAskAt } from './memkeys'
import { PERSON_RE, sumsIn } from '../tools/logic-review'
import { buttonStem } from '../tools/playtest'

const poolTexts = (): string[] => P_OFFENDED_ASK.map((l) => String(valueOf(l)))
const frame = (game: Game) => { game.S.choices = null; return game.buildChoices() }
const askBtn = (game: Game) => frame(game).find((c) => c.act === 'offendedAsk')

/** Строки, которые окно предлагает в своих ходах: ход события и три после. */
const windowTexts = (game: Game, at: number): string[] => {
  const offered: string[] = []
  for (let turn = 0; turn <= 3; turn++) {
    game.S.stats.sent = at + turn
    const b = askBtn(game)
    if (b) offered.push(b.text)
  }
  return offered
}

describe('пул окна «ты обиделся?» (#1620)', () => {
  it('оба окна оставляют игрока кредитором Алика', () => {
    const { game } = makeGame()
    expect(game.S.debt).toBeGreaterThan(0)
    const debt = game.S.debt
    game.S.stats.sent = 100
    game.awayMsg('offended')
    const first = windowTexts(game, 100)
    game.S.stats.sent = 104
    game.awayMsg('offended')
    const second = windowTexts(game, 104)
    const offered = [...first, ...second]
    expect(offered).toHaveLength(8)
    expect(new Set(offered.map(buttonStem)).size).toBe(8)
    for (const text of offered) expect(text).not.toMatch(/на мне\s*[—-]\s*долг|я тебе должен|я должен тебе/i)
    expect(game.S.debt).toBe(debt)
  })

  it('в пуле 6–8 строк, все уникальны по стеблю и не называют персонажа или сумму', () => {
    const lines = poolTexts()
    expect(lines.length, `пул короче двух окон: ${lines.length}`).toBeGreaterThanOrEqual(6)
    expect(lines.length, `пул длиннее двух окон (4 показа в каждом): ${lines.length}`).toBeLessThanOrEqual(8)
    const stems = lines.map((t) => buttonStem(t))
    expect(new Set(stems).size, `стебли строк совпали: ${lines.join(' | ')}`).toBe(lines.length)
    const named = lines.filter((t) => Object.values(PERSON_RE).some((re) => re.test(t)))
    expect(named, `строка называет персонажа: ${named.join(' | ')}`).toEqual([])
    const sums = lines.flatMap((t) => [...sumsIn(t)].map((n) => `${n} в «${t}»`))
    expect(sums, `строка называет сумму: ${sums.join(' | ')}`).toEqual([])
  })

  it('два повторных события подряд: второе окно не повторяет строки первого', () => {
    const { game } = makeGame({ seed: 1 })
    game.S.stats.sent = 100
    game.awayMsg('offended')
    const firstAt = Number(game.S.mem[offendedAskAt])
    expect(firstAt, 'первое событие не штамповало ход').toBe(game.S.stats.sent)
    const first = windowTexts(game, firstAt)
    expect(first.length, `первое окно показало не весь пул: ${first.join(' → ')}`).toBe(4)
    expect(new Set(first.map((t) => buttonStem(t))).size, `строка повторилась внутри первого окна: ${first.join(' → ')}`).toBe(first.length)
    // второе событие — сразу за первым окном: самый тесный случай, когда повтор ловится логическим слоем
    game.S.stats.sent = firstAt + 4
    game.awayMsg('offended')
    const secondAt = Number(game.S.mem[offendedAskAt])
    expect(secondAt, 'второе событие не штамповало свой ход').toBe(firstAt + 4)
    const second = windowTexts(game, secondAt)
    expect(second.length, 'второе окно пусто — пул выгорел за первое').toBeGreaterThan(0)
    const firstStems = new Set(first.map((t) => buttonStem(t)))
    const repeats = second.filter((t) => firstStems.has(buttonStem(t)))
    expect(repeats, `второе окно повторило строки первого: ${repeats.join(' | ')}`).toEqual([])
  })
})
