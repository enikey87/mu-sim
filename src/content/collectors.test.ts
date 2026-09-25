// Коллекторы после credit.broke: мини-сериал, перевербовка, микрозайм молчит (#128).
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney } from '../test/helpers'
import { collectorsRecruited, creditBroke, endgame, intro } from './memkeys'
import { loanTaken, loanDueAt } from './credit'
import { D } from './excuses'
import { isOpen, valueOf, type Entry } from '../engine/rules'
import { threatClaim } from './memkeys'

const texts = (g: ReturnType<typeof makeGame>['game'], from = 0) =>
  g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))

describe('коллекторы (#128)', () => {
  it('на свежей партии коллекторы молчат', () => {
    const { game } = makeGame()
    expect(game.canSpeak('collectors')).toBe(false)
  })

  it('без credit.broke сериал в пуле nextArc не появляется', () => {
    const { game } = makeGame()
    expect(game.availableArcs()).not.toContain('collectors')
    game.S.mem[creditBroke] = true
    expect(game.availableArcs()).toContain('collectors')
    game.S.mem[endgame.active] = true
    expect(game.availableArcs()).not.toContain('collectors')
  })

  it('NC: без when сериал снова в пуле до broke', () => {
    // живой when на ARCS.collectors; регресс — убрать when и этот тест покраснеет на «без broke»
    const { game } = makeGame()
    expect(game.availableArcs().includes('collectors')).toBe(false)
  })

  it('линия: broke → серии → recruited; долг Алика не двигается; микрозайм молчит', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.mem[loanTaken('micro')] = true
    game.S.mem[loanDueAt('micro')] = game.S.day
    setMoney(game, 500)
    const debt0 = game.S.debt
    const money0 = game.S.money
    for (let i = 0; i < 5; i++) {
      await game.playArc('collectors')
      game.S.day += 3
    }
    expect(game.S.mem[intro('collectors')]).toBe(true)
    expect(game.S.mem[collectorsRecruited]).toBe(true)
    expect(game.canSpeak('collectors')).toBe(true)
    expect(game.S.ach.arc_collectors).toBeDefined()
    expect(game.S.debt).toBe(debt0)
    game.chargeCredit('micro')
    expect(game.S.money).toBe(money0) // платёж не списан
    expect(game.S.mem[loanDueAt('micro')]).toBeUndefined()
  })

  it('Beat_Collectors стартует сериал после broke', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.stats.sent = 10
    const r = await game.fire('StoryBeat')
    expect(r?.name).toBe('Beat_Collectors')
    expect(game.S.arcs.collectors?.i).toBe(1)
    expect(texts(game).some((t) => /Деньги-Ара|философствуем/.test(t))).toBe(true)
  })

  it('угроза коллекторами: «остались работать» только после recruited', () => {
    const line = (D.THREAT_A as Entry<unknown>[]).find((e) => /Остались работать/.test(String(valueOf(e))))!
    expect(isOpen(line, { [threatClaim]: 'collectors' })).toBe(false)
    expect(isOpen(line, { [threatClaim]: 'collectors', [collectorsRecruited]: true })).toBe(true)
  })

  it('NC: угроза без гейта recruited снова открыта до факта', () => {
    // механизм — needs(collectorsRecruited) на строке «Остались»; без него тест выше зелёный впустую
    const line = (D.THREAT_A as Entry<unknown>[]).find((e) => /Остались работать/.test(String(valueOf(e))))!
    expect(isOpen(line, { [threatClaim]: 'collectors', [collectorsRecruited]: true })).toBe(true)
  })
})
