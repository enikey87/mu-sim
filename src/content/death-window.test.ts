// #1610: объявление «Алик умер» — заметное событие, у него своё окно отклика (как у #927/#1439).
// Раньше обе прямые реакции были вероятностными: Condole требовал ctx.rel и ctx.sad, Mourn шёл с
// odds 0.5 — в первом блоке вариантов прямых строк не было, соболезнование приходило через 1–3 дня.
import { describe, expect, it } from 'vitest'
import type { Game } from '../engine/game'
import type { Entry } from '../engine/rules'
import { makeGame } from '../test/helpers'
import { deathAnnAt } from './memkeys'
import { D } from './excuses'
import { valueOf } from './fact'

const POOL = new Set<string>((D.P_CONDOLE as Entry<string>[]).map(valueOf))

/** Первый блок после объявления: прямые строки соболезнований из пула окна. */
const condole = (game: Game): string[] => {
  game.S.choices = null
  return game.buildChoices()
    .filter((c) => c.act === 'condole' && POOL.has(c.text))
    .map((c) => c.text)
}
const collected = (game: Game): string[] =>
  game.rules.collect({ event: 'BuildChoices' }, game.facts()).map((r) => r.name)

describe('окно отклика на объявление смерти (#1610)', () => {
  it('в первом блоке после «Алик умер» есть прямая строка соболезнований', async () => {
    const { game } = makeGame()
    game.S.day = 250
    await game.playArc('alik_death')
    expect(game.S.mem.alik_dead, 'смерть не объявлена').toBe(true)
    expect(Number(game.S.mem[deathAnnAt]), 'ход объявления не штампован').toBe(game.S.stats.sent)
    expect(condole(game), 'в блоке нет прямой строки P_CONDOLE').not.toHaveLength(0)
  })

  it('смена пишущей (мама вместо Карине) окно не отменяет: оно на факте объявления', async () => {
    const { game } = makeGame()
    game.S.day = 250
    // Карине ушла к Рубику — объявление пишет мама Алика
    game.S.mem['finale.rubik'] = 'karine'
    await game.playArc('alik_death')
    expect(game.S.mem.alik_dead).toBe(true)
    expect(condole(game), 'при подмене пишущей окна нет').not.toHaveLength(0)
  })

  it('окно закрывается: на четвёртый ход после объявления кнопки уже нет', async () => {
    const { game } = makeGame()
    game.S.day = 250
    await game.playArc('alik_death')
    const at = Number(game.S.mem[deathAnnAt])
    expect(collected(game)).toContain('Opt_DeathCondole')
    game.S.stats.sent = at + 3 // последний ход окна — как у остальных событий (#927)
    expect(collected(game)).toContain('Opt_DeathCondole')
    game.S.stats.sent = at + 4
    expect(collected(game), 'окно не закрылось — кнопка живёт весь траур').not.toContain('Opt_DeathCondole')
  })

  it('НК: без факта объявления окна нет — правило держится на штампе, а не на трауре', async () => {
    const { game } = makeGame()
    game.S.day = 250
    await game.playArc('alik_death')
    expect(collected(game)).toContain('Opt_DeathCondole')
    delete game.S.mem[deathAnnAt]
    expect(game.S.mem.alik_dead, 'траур остался — значит, проверяем то, что нужно').toBe(true)
    expect(collected(game), 'кнопка осталась без факта объявления').not.toContain('Opt_DeathCondole')
  })
})
