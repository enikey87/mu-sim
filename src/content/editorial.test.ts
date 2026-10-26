import { describe, expect, it } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { BARTER } from './scenes'
import { valueOf } from './fact'
import { ARC_TALK } from './talk'
import { FINALES } from './finales'
import { P_MONEY } from './topics'
import { rubikHoleAt } from './memkeys'

describe('редакторские замены: контекст и сборка реплик', () => {
  it.each([false, true])('ответ о дырке проверяет знакомство с инспектором: линия начата = %s', async (started) => {
    const { game } = makeGame()
    if (started) game.S.arcs.rubik = { i: 4, last: game.S.day }
    game.S.mem[rubikHoleAt] = game.S.stats.sent
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'rubikHole', arg: '0' })
    const answer = alikTexts(game.S.msgs.slice(from)).join(' ')
    expect(answer.length).toBeGreaterThan(0)
    expect(answer.includes('Рубику для отчётности')).toBe(started)
    expect(game.S.mem[rubikHoleAt]).toBeUndefined()
  })

  it.each([
    'перфоратор',
    'люстра с хрусталём, трёхрожковая',
    'ведро абрикосов',
    'три коробки остатков плитки',
  ])('отказ от товара «%s» не требует рода и числа и не проводит обмен', async (name) => {
    const { game } = makeGame()
    const good = BARTER.map(valueOf).find((item) => item.n === name)
    expect(good).toBeDefined()
    await game.enterNode('barter', 'ask')
    game.S.scene!.vars = { ...good! }
    game.S.choices = null
    const refuse = game.choices.find((choice) => choice.go === 'refuse')
    expect(refuse).toBeDefined()
    const debt = game.S.debt
    const items = [...game.S.items]
    const from = game.S.msgs.length
    await game.send(refuse!)
    const answer = alikTexts(game.S.msgs.slice(from)).join(' ')
    expect(answer).toContain('У меня даже вещи обидчивые. Все в хозяина.')
    expect(answer).not.toContain(`${name} обиделся`)
    expect(game.S.debt).toBe(debt)
    expect(game.S.items).toEqual(items)
    expect(game.S.ach.barter).toBeUndefined()
  })

  it('уточнённая колкость про акт отвечает в своём окне, не раньше и не после нажатия', async () => {
    const { game } = makeGame({ seed: 13 })
    game.S.mem['intro.karine'] = true
    game.S.arcs.rubik = { i: 7, last: game.S.day }
    game.lines.mark('TALK:arc:rubik:0')
    game.lines.mark('TALK:arc:rubik:1')
    const question = 'Подожду. Но сначала пусть подпишет акт.'
    const pair = ARC_TALK.rubik.map(valueOf).find((item) => item[0] === question)
    expect(pair).toBeDefined()
    expect(pair![2]!(game, 'Рубик проверяет плитку.')).toBe(false)
    const line = 'Брат, ты же не хочешь, чтобы из-за твоих денег распалась семья? Скажи, что подождёшь.'
    await game.say([line])
    game.setCtx({ arc: 'rubik' })
    expect(pair![2]!(game, line)).toBe(true)
    const candidates = []
    for (let i = 0; i < 30; i++) {
      game.S.choices = null
      candidates.push(...game.buildChoices())
    }
    const choice = candidates.find((item) => item.act === 'talk' && item.text === question)
    expect(choice, 'обновлённая колкость не предлагается').toBeDefined()
    const from = game.S.msgs.length
    await game.send(choice!)
    expect(alikTexts(game.S.msgs.slice(from)).join(' ')).toContain('Я слово держу, когда его держит бумага.')
    for (let i = 0; i < 10; i++) {
      game.S.choices = null
      expect(game.buildChoices().some((item) => item.text === question)).toBe(false)
    }
  })

  it('«профсоюз выбил 500» означает получение игроком, а не списание взноса', async () => {
    const { game } = makeGame()
    game.S.mem['intro.grant'] = true
    const before = game.S.debt
    const finale = FINALES.razmik.find((item) => item.id === 'union')!
    expect(finale).toBeDefined()
    await game.playFinale('razmik', finale)
    expect(game.S.debt).toBe(before - 500)
    expect(game.S.msgs.some((msg) => msg.kind === 'sys' && msg.text.includes('500'))).toBe(true)
  })

  it('вежливый вопрос о низком балансе остаётся вопросом о деньгах, без заявки на обмен терпением', () => {
    const pool = P_MONEY.low.polite.map(valueOf)
    expect(pool).toContain('Алик, баланс всё ниже, терпение всё тоньше. Может, хоть баланс поправим?')
    expect(pool).not.toContain('Алик, у меня остаток низкий, а терпение — высокое. Поменяемся?')
  })
})
