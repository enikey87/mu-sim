import { describe, expect, it } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { spec } from './fact'
import { LEGENDS } from './legends'
import { OATH_FORMS, OATH_STAKE_MOUSTACHE } from './misc'

const forms = OATH_FORMS.filter((line) => spec(line).id !== OATH_STAKE_MOUSTACHE)

describe('плейтест: обещание при перенесённом на Гранта долге', () => {
  it.each(forms.map((line) => [spec(line).t, line] as const))('форма «%s» сохраняет плательщика и короткий срок', async (_text, form) => {
    const { game } = makeGame()
    game.S.mem['intro.karine'] = true
    game.setLegend('beton_law', 'beton')
    const pick = game.linePicked.bind(game)
    game.linePicked = (key, pool, opts) => pick(key, key === 'OATH_FORMS' ? [form] : pool, opts)
    const debt = game.S.debt
    const money = game.S.money
    await game.promiseLine(undefined, true)
    const said = alikTexts(game.S.msgs).join(' ')
    expect(said).toMatch(/как Грант признает долг/i)
    expect(said).toContain('с него и спросишь')
    expect(said).toContain('я подскажу, где его искать')
    expect(said).not.toMatch(/привезу|скину|отдам|верну|переведу|рассчитаюсь|расплачусь|закрою вопрос|всё будет|деньги будут|закину|принесу|всё решим/i)
    expect(game.S.ctx).toMatchObject({ when: 'как Грант признает долг', whenNever: true, whenKind: 'never' })
    expect(game.S.promises).toHaveLength(1)
    const entry = game.S.promises[0]
    expect(said.toLowerCase()).toContain(entry.t.toLowerCase())
    expect(entry).toMatchObject({ due: null })
    expect(entry.stake).toBeUndefined()
    expect(game.S.debt).toBe(debt)
    expect(game.S.money).toBe(money)
    const choices = Array.from({ length: 20 }, () => {
      game.S.choices = null
      return game.buildChoices()
    }).flat()
    const choice = choices.find((c) => c.act === 'promiseNever')
    expect(choice, 'короткий срок даёт игроку реакцию').toBeDefined()
    expect(choice!.text).not.toContain('подскажу')
    await game.fire('PlayerSays', { intent: choice!.act, arg: choice!.arg })
    expect(game.S.debt).toBe(debt)
    expect(game.S.money).toBe(money)
  })

  it('форма с префиксом не возвращает Алику обязанность заплатить', async () => {
    const { game } = makeGame()
    game.setLegend('beton_law', 'beton')
    await game.promiseLine('Обещаю:', true)
    const said = alikTexts(game.S.msgs).join(' ')
    expect(said).toContain('Обещаю: как Грант признает долг — с него и спросишь')
    expect(said).toContain('я подскажу, где его искать')
    expect(game.S.promises).toHaveLength(1)
  })

  it('непрочитанное обещание сохраняет те же роли и не дублирует журнал', async () => {
    const { game } = makeGame()
    game.setLegend('beton_law', 'beton')
    const debt = game.S.debt
    const money = game.S.money
    game.awayMsg('excuse')
    const first = alikTexts(game.S.msgs).at(-1)!
    expect(first).toMatch(/^как Грант признает долг — с него и спросишь/i)
    expect(first).toContain('я подскажу, где его искать')
    expect(game.S.promises).toHaveLength(1)
    expect(game.S.promises[0].t).toBe(first)
    game.S.stats.sent += 10
    await game.promiseLine(undefined, true)
    expect(game.S.promises).toHaveLength(1)
    expect(game.S.debt).toBe(debt)
    expect(game.S.money).toBe(money)
  })

  it.each(['clear', 'expire'])('форма про Гранта перестаёт действовать после %s', async (transition) => {
    const { game } = makeGame()
    game.setLegend('beton_law', 'beton')
    await game.promiseLine('Обещаю:', true)
    expect(alikTexts(game.S.msgs).at(-1)).toContain('с него и спросишь')
    if (transition === 'clear') game.setLegend(null, 'beton')
    else game.S.day += 31
    expect(game.legend()).toBeUndefined()
    await game.promiseLine('Обещаю:', true)
    expect(alikTexts(game.S.msgs).at(-1)).not.toContain('с него и спросишь')
    expect(game.S.ctx?.when).not.toBe('как Грант признает долг')
    expect(game.S.promises).toHaveLength(2)
  })

  it('обычная легенда продолжает обещать расчёт Аликом и использует свой срок', async () => {
    const { game } = makeGame()
    game.setLegend('beton_money', 'beton')
    await game.promiseLine('Обещаю:', true)
    const said = alikTexts(game.S.msgs).join(' ')
    expect(said).toContain(LEGENDS.beton_money.until.t)
    expect(said).toMatch(/привезу|скину|отдам|верну|переведу|рассчитаюсь|расплачусь|закрою вопрос|всё будет|деньги будут|закину|принесу|всё решим/i)
    expect(said).not.toContain('с него и спросишь')
    expect(game.S.ctx?.when).toBe(LEGENDS.beton_money.until.t)
    expect(game.S.promises).toHaveLength(1)
  })
})
