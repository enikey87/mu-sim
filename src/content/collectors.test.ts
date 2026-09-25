// Коллекторы после credit.broke: мини-сериал, перевербовка, микрозайм молчит (#128).
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney } from '../test/helpers'
import { collectorsRecruited, creditBroke, endgame, intro, paydayScene, threatClaim } from './memkeys'
import { loanTaken, loanDueAt } from './credit'
import { D } from './excuses'
import { NOTIF } from './life'
import { isOpen, test, valueOf, type Entry, type Facts } from '../engine/rules'

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

  // playArc не сверяется с availableArcs — старт держит только when правила; NC: when → [] красит оба случая
  it('гейт старта: без broke и в эндгейме Beat_Collectors молчит', async () => {
    const beats = async (g: ReturnType<typeof makeGame>['game']) => {
      const names: string[] = []
      for (let i = 0; i < 12; i++) { names.push((await g.fire('StoryBeat'))?.name ?? '-'); g.S.day += 2; g.S.stats.sent++ }
      return names
    }
    const fresh = makeGame().game
    fresh.S.stats.sent = 10
    expect(await beats(fresh)).not.toContain('Beat_Collectors')
    expect(fresh.S.arcs.collectors).toBeUndefined()
    const late = makeGame().game
    late.S.stats.sent = 10
    late.S.mem[creditBroke] = true
    late.S.mem[endgame.active] = true
    expect(await beats(late)).not.toContain('Beat_Collectors')
    expect(late.S.arcs.collectors).toBeUndefined()
  })

  it('начатая линия идёт своим битом: серия не чаще раза в 3 дня, развязка за пару десятков ходов (#324)', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.stats.sent = 10
    await game.fire('StoryBeat')
    expect(game.S.arcs.collectors?.i).toBe(1)
    // в тот же день вторая серия не идёт — NC: снять is('collectorsCanAdvance') из Beat_CollectorsNext
    for (let i = 0; i < 6; i++) { game.S.stats.sent++; await game.fire('StoryBeat') }
    expect(game.S.arcs.collectors?.i).toBe(1)
    const days = [game.S.arcs.collectors!.last]
    const names = new Set<string>()
    for (let i = 0; i < 60 && game.S.arcs.collectors!.i < 5; i++) {
      game.S.day++
      game.S.stats.sent++
      const r = await game.fire('StoryBeat')
      if (r) names.add(r.name)
      if (game.S.arcs.collectors!.last !== days.at(-1)) days.push(game.S.arcs.collectors!.last)
    }
    expect(game.S.arcs.collectors?.i).toBe(5)
    expect(game.S.mem[collectorsRecruited]).toBe(true)
    expect(names).toContain('Beat_CollectorsNext')
    expect(days.length).toBe(5)
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(3)
    expect(days[4] - days[0]).toBeLessThanOrEqual(40)
  })

  it('в эндгейме линия не продолжается', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.stats.sent = 10
    await game.fire('StoryBeat')
    game.S.mem[endgame.active] = true
    // поведение держит Endgame_Formality (специфичность 100 забирает StoryBeat целиком), а не критерий бита:
    // снятие missing(endgame.active) с Beat_CollectorsNext здесь не краснит — потому его критерий проверяется ниже отдельно
    for (let i = 0; i < 40; i++) { game.S.day++; game.S.stats.sent++; await game.fire('StoryBeat') }
    expect(game.S.arcs.collectors?.i).toBe(1)
  })

  it('старт и бит сами объявляют «не в эндгейме» — NC: снять missing(endgame.active) у Beat_Collectors / Beat_CollectorsNext', () => {
    const { game } = makeGame()
    const whenOf = (name: string) => game.rules.rules('StoryBeat').find((r) => r.name === name)!.when
    const open = (name: string, f: Facts) => whenOf(name).every((c) => test(c, f))
    expect(open('Beat_Collectors', { [creditBroke]: true })).toBe(true)
    expect(open('Beat_Collectors', { [creditBroke]: true, [endgame.active]: true })).toBe(false)
    const going = { 'arc.collectors': 2, collectorsCanAdvance: true }
    expect(open('Beat_CollectorsNext', going)).toBe(true)
    expect(open('Beat_CollectorsNext', { ...going, [endgame.active]: true })).toBe(false)
  })

  it('уведомление «где живёт ваш Алик» — эхо второй серии, не после выплаты и не в эндгейме (#324)', () => {
    const n = NOTIF.find((x) => /где живёт ваш Алик/.test(x.t))!
    const open = (f: Facts) => (n.when ?? []).every((c) => test(c, f))
    expect(open({ 'arc.collectors': 2 })).toBe(true)
    expect(open({})).toBe(false) // до линии: broke, но серии нет
    expect(open({ 'arc.collectors': 1 })).toBe(false) // спрашивают «где он?» — ещё не знают
    expect(open({ 'arc.collectors': 3 })).toBe(false) // уже у Алика
    expect(open({ 'arc.collectors': 2, [paydayScene]: 'payday' })).toBe(false)
    expect(open({ 'arc.collectors': 2, [endgame.active]: true })).toBe(false)
  })

  it('угроза коллекторами: «остались работать» только после recruited', () => {
    const line = (D.THREAT_A as Entry<unknown>[]).find((e) => /Остались работать/.test(String(valueOf(e))))!
    expect(isOpen(line, { [threatClaim]: 'collectors' })).toBe(false)
    expect(isOpen(line, { [threatClaim]: 'collectors', [collectorsRecruited]: true })).toBe(true)
  })

  it('«Пусть сначала найдут» — пока не приехали; «чай пьют» — у Алика до перевербовки (#324)', () => {
    const find = (re: RegExp) => (D.THREAT_A as Entry<unknown>[]).find((e) => re.test(String(valueOf(e))))!
    const claim = { [threatClaim]: 'collectors' }
    const seek = find(/Пусть сначала найдут/)
    expect(isOpen(seek, claim)).toBe(true) // линии ещё нет
    expect(isOpen(seek, { ...claim, 'arc.collectors': 2 })).toBe(true)
    expect(isOpen(seek, { ...claim, 'arc.collectors': 3 })).toBe(false) // «Мы приехали к Алику»
    const tea = find(/чай пьют/)
    expect(isOpen(tea, { ...claim, 'arc.collectors': 2 })).toBe(false)
    expect(isOpen(tea, { ...claim, 'arc.collectors': 3 })).toBe(true)
    expect(isOpen(tea, { ...claim, 'arc.collectors': 4, [collectorsRecruited]: true })).toBe(false)
  })
})
