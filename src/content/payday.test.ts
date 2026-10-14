// День выплаты: запуск, сборка из событий партии, дележ до 50 ₽, великая отмазка, поймать противоречие, исходы.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import type { Criterion } from '../engine/rules'
import { spec } from '../engine/rules/lines'
import { CLAIMS, ROLL, type Claim } from './payday'
import { ARCS } from './arcs'
import { valueOf, type Entry } from './fact'

const texts = (g: Game, n = 0) => g.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
const choose = async (g: Game, go: string) => { g.S.choices = null; const c = g.choices.find((x) => x.go === go); expect(c, go).toBeDefined(); await g.send(c!) }
const rich = (g: Game) => {
  g.S.day = 340
  Object.assign(g.S.mem, { 'finale.nune': 'default', 'finale.niva': 'chose', 'finale.boris': 'brigadir', 'met.samvel': true, 'met.karine': true, 'met.boris': true, 'intro.niva': true, 'niva.player': true })
  Object.assign(g.S.arcs, { nune: { i: 6, last: 0 }, niva: { i: 7, last: 0 }, boris: { i: 10, last: 0 } })
  Object.assign(g.S.ach, { q_goat: 1, court: 1, q_hash: 1 })
}

describe('День выплаты', () => {
  it('запускается сюжетным ходом только в третьем акте: 330+ день и 3 законченных сериала', async () => {
    const { game } = makeGame()
    game.S.day = 340
    game.S.stats.sent = 20
    for (let i = 0; i < 5; i++) expect((await game.fire('StoryBeat'))?.name).not.toBe('Beat_Payday')
    rich(game)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_Payday')
    expect(game.S.scene?.id).toBe('payday')
    expect(game.S.ach.payday).toBeDefined()
  })
  it('законченная линия коллекторов не приближает День выплаты: считаются сюжетные сериалы (#338)', () => {
    const { game } = makeGame()
    game.S.day = 340
    const done = (id: string) => ({ i: ARCS[id].eps.length, last: 0 })
    Object.assign(game.S.arcs, { nune: done('nune'), boris: done('boris'), collectors: done('collectors') })
    const payday = () => game.rules.collect({ event: 'StoryBeat' }, game.facts()).some((r) => r.name === 'Beat_Payday')
    expect(game.facts().arcsDone).toBe(2)
    expect(payday()).toBe(false)
    game.S.arcs.grant = done('grant')
    expect(game.facts().arcsDone).toBe(3)
    expect(payday()).toBe(true) // не пустая проверка: третий сюжетный сериал выплату открывает
  })
  it('полный проход: утро из событий партии → 240 000 → дележ → 50 ₽ → великая отмазка → поймал → мешок мелочи', async () => {
    const { game } = makeGame()
    rich(game)
    await game.enterNode('payday', 'announce')
    const n = game.S.msgs.length
    await choose(game, 'witness')
    const morning = texts(game, n).join('\n')
    expect(morning).toMatch(/Сейф открыли|«Нива» вернулась|Борис-прораб/)
    expect(morning).toMatch(/К выплате: 240\s000 ₽/)
    expect(game.S.scene?.node).toBe('split')
    await choose(game, 'share')
    expect(game.S.mem['payday.sum']).toBe(50)
    expect(game.S.scene?.node).toBe('grand')
    const chain = String(game.S.mem['payday.chain'])
    // звенья — из событий этой партии: сейф Нуне, «Нива», Борис-прораб, коза, суд, хаш
    expect(chain).toMatch(/сейф|«Нив|Борис|коз|суд|хаш/)
    game.S.choices = null
    // утром «Сейф открыли» / «Нива вернулась» — в отмазке это же место: есть что поймать
    expect(game.choices.find((c) => c.go === 'catch')!.text).toMatch(/^Стоп\. (Сегодня|Утром|Борис|«Нива»|Грант)/)
    const debt = game.S.debt
    await choose(game, 'catch')
    expect(game.S.mem.payday).toBe('coins')
    expect(game.S.debt).toBe(0)
    expect(game.S.money).toBeGreaterThanOrEqual(debt)
    expect(game.S.scene).toBeNull()
    await game.fire('CheckEnding')
    expect(game.S.ending).toBe('payday_coins')
  })
  it('утро выплаты — день payday.at: без паузы и после сдвига календаря на анонсе', async () => {
    const { game } = makeGame()
    rich(game)
    await game.enterNode('payday', 'announce')
    const at = Number(game.S.mem['payday.at'])
    expect(at).toBe(game.S.day + 1)
    await choose(game, 'bag')
    expect(game.S.day).toBe(at)

    const { game: g2 } = makeGame()
    rich(g2)
    await g2.enterNode('payday', 'announce')
    const at2 = Number(g2.S.mem['payday.at'])
    g2.nextDay(3) // away/зарядка, сцена висит
    const stuck = g2.S.day
    expect(stuck).toBeGreaterThan(at2)
    await choose(g2, 'bag')
    expect(g2.S.day).toBe(stuck) // не прыгаем ещё на день от уже прошедшего «завтра»
    expect(texts(g2).join(' ')).toMatch(/День выплаты/)
  })
  it('без поимки — 50 ₽ «остатка», а на следующий день кнопка: «Повторим через год?»', async () => {
    const { game } = makeGame()
    game.S.day = 340
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    await choose(game, 'refuse')
    expect(game.S.mem['payday.refused']).toBe(true)
    const debt = game.S.debt
    const n = game.S.msgs.length
    await choose(game, 'accept')
    expect(game.S.mem.payday).toBe('default')
    expect(game.S.debt).toBe(debt - 50)
    // исход ставит кнопку на «завтра»; ход заканчивается +1…3 — кнопка в том же send
    expect(texts(game, n).join(' ')).toMatch(/через год/)
    rich(game)
    game.S.day = 500
    expect((await game.fire('StoryBeat'))?.name).not.toBe('Beat_Payday')
    expect(game.S.scene).toBeNull()
  })
  it('бедная партия: общие источники и добор до 240 000, общие звенья отмазки', async () => {
    const { game } = makeGame()
    game.S.day = 420
    await game.enterNode('payday', 'announce')
    await choose(game, 'doubt')
    expect(texts(game).join(' ')).toMatch(/К выплате: 240\s000 ₽/)
    await choose(game, 'share')
    expect(String(game.S.mem['payday.chain']).length).toBeGreaterThan(80)
  })
  it('День выплаты прошёл — правило уходит из пула, а не перехватывает StoryBeat молча', () => {
    const late = (g: Game) => g.rules.collect({ event: 'StoryBeat' }, g.facts()).some((r) => r.name === 'Beat_Payday_Late')
    const { game } = makeGame()
    game.S.day = 430
    game.S.stats.sent = 200
    expect(late(game)).toBe(true)
    game.S.mem['payday.at'] = 400
    expect(late(game)).toBe(false)
    delete game.S.mem['payday.at']
    game.S.mem.payday = 'coins'
    expect(late(game)).toBe(false)
  })
  it('прерванная сцена Дня выплаты не теряет третий акт: его объявляют снова (#571)', async () => {
    const { game } = makeGame()
    game.S.day = 340
    game.S.stats.sent = 200
    rich(game)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_Payday')
    expect(game.S.scene?.id).toBe('payday')
    // игрок жмёт реплику с актом («поймать на лжи») посреди сцены — сцена прерывается
    await game.send({ text: 'Стоп. Это всё неправда.', tone: 'neutral', act: 'catchLie' })
    expect(game.S.mem.payday, 'исход не записан — акт не завершён').toBeUndefined()
    // не потерян: тот же ход объявляет сцену снова (once-метка beat'а снята вместе с днём)
    expect(game.S.scene?.id).toBe('payday')
    await choose(game, 'bag')
    await choose(game, 'share')
    expect(String(game.S.mem['payday.chain']).length).toBeGreaterThan(80)
  })
  it('исходы по стилю партии: частный побеждает', async () => {
    const pick = async (setup: (g: Game) => void) => { const { game } = makeGame(); setup(game); return (await game.fire('PaydayOutcome'))?.name }
    expect(await pick(() => {})).toBe('Payday_default')
    expect(await pick((g) => { g.S.mem['payday.caught'] = true })).toBe('Payday_coins')
    expect(await pick((g) => { g.S.mem['payday.caught'] = true; g.S.mem['crypto.hodl'] = true })).toBe('Payday_lavash') // и поимка, и крипта: лаваш (3) выше монет (2)
    expect(await pick((g) => { g.S.mem['crypto.hodl'] = true })).toBe('Payday_lavash') // одной крипты хватает — поимка больше не нужна
    expect(await pick((g) => { g.S.mem['finale.niva'] = 'chose' })).toBe('Payday_niva')
    expect(await pick((g) => { g.S.ach.strasbourg = 1 })).toBe('Payday_strasbourg')
    expect(await pick((g) => { g.S.mem['finale.razmik'] = 'default' })).toBe('Payday_notyou') // любой финал Размика, без счётчика криков
    expect(await pick((g) => { g.S.ach.saint = 1; g.S.ach.court = 1 })).toBe('Payday_real') // вежливость и суд — квесты и поимки не нужны
  })
  it('в перекличке — только те, кого игрок встречал, и каждый один раз', async () => {
    const { game } = makeGame()
    game.S.day = 340
    game.S.mem['met.judge'] = true
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    // перекличка — между «добавил вас в группу» и вопросом Самвела про доли
    const start = game.S.msgs.findIndex((m) => m.kind === 'sys' && /ДЕНЬ ВЫПЛАТЫ/.test(m.text))
    const roll = game.S.msgs.slice(start + 1, -1)
    const whos = roll.flatMap((m) => (m.kind === 'text' && m.who ? [m.who] : []))
    expect(whos).toContain('judge')
    expect(whos).not.toContain('rubik')
    expect(new Set(whos).size).toBe(whos.length)
  })
  // застолье уже списало 6 000 и уменьшило долг на 1 000 — партия приходит к выплате с этими числами
  const afterFeast = (g: Game) => { g.S.day = 340; g.S.ach.q_tamada = 1; g.adjustDebt(239000 - g.S.debt) }
  it('доля за сервиз добирает разницу: с зачтённым на застолье выходит названная сумма', async () => {
    const { game } = makeGame()
    afterFeast(game)
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    const n = game.S.msgs.length
    await choose(game, 'share')
    const out = texts(game, n).join('\n')
    expect(out).toMatch(/зачли шесть тысяч/)
    expect(out).toMatch(/тридцать девять сверху/)
    // 239 000 − 39 000: вместе с зачтёнными шестью тысячами сервиз стоит ровно названные сорок пять
    expect(out).toMatch(/К выплате: 200\s000 ₽/)
  })
  it('отказ делиться берёт больше названного — и это объявлено до долей, а не спрятано в числе', async () => {
    const { game } = makeGame()
    afterFeast(game)
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    const n = game.S.msgs.length
    await choose(game, 'refuse')
    const out = texts(game, n).join('\n')
    expect(out).toMatch(/родня услышала «по рублю»/)
    expect(out).toMatch(/К выплате: 180\s500 ₽/) // 239 000 − 39 000 − 19 500
  })
  it('доля Самвела уместна только по факту его линии, а не по знакомству от чужой реплики (#701)', () => {
    const { game } = makeGame()
    const whos = (pool: ReturnType<typeof game.lines.eligible>) => pool.map((p) => (p.spec as { who?: string }).who)
    expect(whos(game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts()))).not.toContain('samvel')
    const roll = whos(game.lines.eligible('PD_ROLL', ROLL, game.lineFacts()))
    expect(roll).not.toContain('samvel')
    expect(roll).not.toContain('karine')
    // знакомство без линии (суд, родня) претензию не открывает — открывает его сериал
    game.S.mem['intro.samvel'] = true
    expect(whos(game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts()))).not.toContain('samvel')
    game.S.arcs.samvel = { i: ARCS.samvel.eps.length, last: 0 }
    expect(whos(game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts()))).toContain('samvel')
  })
  // несостыковка из плейтест-раундов 43–44: распорядитель дележа сам открывал Самвелу знакомство,
  // и в партии без его линии он требовал «подарок молодым» на свадьбе, которой не было (#701)
  it('дележ без самвеловской линии ведёт Алик, с линией — дядя Самвел, и претензия только по линии', async () => {
    const host = async (line: boolean) => {
      const { game } = makeGame()
      game.S.day = 340
      if (line) await game.playArc('samvel') // линия партии — настоящим производителем, не памятью
      await game.enterNode('payday', 'announce')
      await choose(game, 'bag')
      const hostLine = game.S.msgs.find((m) => m.kind === 'text' && /по традиции, доли/.test(m.text))
      expect(hostLine, 'дележ звучит').toBeDefined()
      const pool = (p: ReturnType<typeof game.lines.eligible>) => p.map((x) => (x.spec as { who?: string }).who)
      return {
        who: hostLine!.kind === 'text' ? hostLine!.who : undefined,
        claims: pool(game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts())),
      }
    }
    const noLine = await host(false)
    expect(noLine.who).toBeUndefined() // говорит Алик: Самвел не появляется «из ниоткуда»
    expect(noLine.claims).not.toContain('samvel')
    const withLine = await host(true)
    expect(withLine.who).toBe('samvel')
    expect(withLine.claims).toContain('samvel')
  })
  // #740: замер на 201 партии — доля была первым словом спикера у тёти Гоар (140 из 142), мамы (49 из 201)
  // и Нуне (2 из 79, сид 99031); остальные к дележу уже писали сами. Незнакомый голос — представление.
  it('доля незнакомого спикера представляется; знакомого — как раньше, и дележ считается одинаково (#740)', async () => {
    const play = async (known: boolean, quest: 'q_goat' | 'q_tamada' = 'q_goat') => {
      const { game } = makeGame()
      Object.assign(game.S.ach, { [quest]: 1 })
      game.S.arcs.nune = { i: 1, last: 0 } // dekret: Нуне могла так и не заговорить самой
      if (known) Object.assign(game.S.mem, { 'met.goar': true, 'met.nune': true, 'met.mama': true })
      await game.enterNode('payday', 'announce')
      await choose(game, 'bag')
      const n = game.S.msgs.length
      await choose(game, 'share')
      return texts(game, n).join('\n')
    }
    const strangers = await play(false)
    expect(strangers).toMatch(/Это тётя Гоар\. Коза — моя\./)
    expect(strangers).toMatch(/Здравствуйте\. Я Нуне\./)
    expect(strangers).toMatch(/Это мама Алика\./)
    expect(strangers).not.toMatch(/поседела/)
    const strangersTamada = await play(false, 'q_tamada')
    expect(strangersTamada).toMatch(/Это тётя Гоар\. А сервиз\?/)
    const known = await play(true)
    expect(known).not.toMatch(/Это тётя Гоар|Я Нуне|Это мама Алика/)
    expect(known).toMatch(/А кто будет платить за мою козу/)
    expect(known).toMatch(/Налог с выплаты\. Я из декрета/)
    expect(known).toMatch(/Я из-за вас обоих поседела/)
    // доли те же: 240 000 − 60 000 (коза) − 30 000 (налог) − 25 000 (лекарства) = 125 000; сервиз — 39 000
    expect(strangers).toMatch(/К выплате: 125\s000 ₽/)
    expect(strangersTamada).toMatch(/К выплате: 146\s000 ₽/)
    expect(known).toMatch(/К выплате: 125\s000 ₽/)
    for (const out of [strangers, strangersTamada, known]) expect(out).toMatch(/К выплате: 50 ₽/)
  })
  it('у спикера доли с веткой «первый раз» разведены по знакомству все реплики, а не одна (#740)', () => {
    const crit = (e: Entry<Claim>, f: (c: Criterion) => boolean): boolean =>
      (spec(e).when ?? []).some(function walk(c): boolean {
        return f(c) || (c.all ?? []).some(walk)
      })
    const first = (e: Entry<Claim>, who: string) => crit(e, (c) => c.key === `met.${who}` && c.op === '!exist')
    const known = (e: Entry<Claim>, who: string) => crit(e, (c) => c.key === `met.${who}` && c.op === '==' && c.value === true)
    let branched = 0
    for (const who of new Set(CLAIMS.map((e) => valueOf(e).who))) {
      const entries = CLAIMS.filter((e) => valueOf(e).who === who)
      // без ветки «первый раз» знакомство спикера держат факты его арки/сцены (grant, razmik, rubik, judge, samvel, karine, boris)
      if (!entries.some((e) => first(e, who))) continue
      branched += entries.length
      for (const e of entries) {
        expect(first(e, who) !== known(e, who), `${who}: «${valueOf(e).t.slice(0, 40)}…» без разведения по знакомству`).toBe(true)
      }
    }
    expect(branched, 'веток «первый раз» не стало — проверка пустеет').toBeGreaterThanOrEqual(6)
  })
  it('после выплаты старая допработа и перевод не меняют долг; кнопка допработы закрыта', async () => {
    const { game } = makeGame()
    await game.job()
    const job = game.S.msgs.find((m) => m.kind === 'job')!
    expect(job.kind).toBe('job')
    rich(game)
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    await choose(game, 'refuse')
    game.S.choices = null
    await choose(game, 'accept')
    expect(game.debtSealed()).toBe(true)
    const sealed = game.S.debt
    const money = game.S.money
    // исход закрыл все незакрытые job
    expect(game.S.msgs.find((m) => m.id === job.id && m.kind === 'job')!).toMatchObject({ answered: true })
    // даже прямой вызов после печати — долг не растёт
    await game.job()
    const job2 = [...game.S.msgs].reverse().find((m) => m.kind === 'job' && !m.answered)
    if (job2 && job2.kind === 'job') await game.answerJob(job2.id, true)
    expect(game.S.debt).toBe(sealed)
    await game.transfer()
    expect(game.S.debt).toBe(sealed)
    expect(game.S.money).toBe(money) // перевод тоже без эффекта
    expect(game.adjustDebt(1000)).toBe(false)
    expect(game.S.debt).toBe(sealed)
  })
})
