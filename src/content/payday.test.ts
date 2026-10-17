// День выплаты: запуск, сборка из событий партии, дележ до 50 ₽, великая отмазка, поймать противоречие, исходы.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import type { Criterion } from '../engine/rules'
import { spec } from '../engine/rules/lines'
import { CLAIMS, LEAD, MORNING_CONTRA, OUTCOME, ROLL, SOURCES, type Claim, type Lead } from './payday'
import { LEGENDS } from './legends'
import { CLAIM_LEDGER } from './ledger'
import { bathAsked, garikCut, met, nuneDekretOver } from './memkeys'
import { ARCS } from './arcs'
import { spec as lineSpec, valueOf, type Entry } from './fact'

const texts = (g: Game, n = 0) => g.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
const choose = async (g: Game, go: string) => { g.S.choices = null; const c = g.choices.find((x) => x.go === go); expect(c, go).toBeDefined(); await g.send(c!) }
const rich = (g: Game) => {
  g.S.day = 340
  Object.assign(g.S.mem, { 'finale.nune': 'default', 'finale.niva': 'chose', 'finale.boris': 'brigadir', 'met.samvel': true, 'met.karine': true, 'met.boris': true, 'intro.niva': true, 'niva.player': true })
  Object.assign(g.S.arcs, { nune: { i: 6, last: 0 }, niva: { i: 7, last: 0 }, boris: { i: 10, last: 0 } })
  Object.assign(g.S.ach, { q_goat: 1, court: 1, q_hash: 1 })
}

describe('День выплаты', () => {
  it('запускается сюжетным ходом только в третьем акте: 330+ день и 3 законченных сериала, после двух штрихов подводки (#893)', async () => {
    const { game } = makeGame()
    game.S.day = 340
    // без серии не открываем ничего: сюжетный ход в этой части теста не играется (#893 — scene-floor не мешает)
    game.S.stats.sent = 0
    for (let i = 0; i < 5; i++) expect((await game.fire('StoryBeat'))?.name ?? '').not.toMatch(/^Beat_Payday/)
    rich(game)
    // линии сошлись — третий акт предваряет подводка: два штриха в разные дни, и только потом анонс
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_First')
    expect(game.S.mem['payday.signs']).toBe(1)
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_Second')
    expect(game.S.mem['payday.signs']).toBe(2)
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_Payday')
    expect(game.S.scene?.id).toBe('payday')
    expect(game.S.ach.payday).toBeDefined()
  })
  it('законченная линия коллекторов не приближает День выплаты: считаются сюжетные сериалы (#338)', () => {
    const { game } = makeGame()
    game.S.day = 340
    const done = (id: string) => ({ i: ARCS[id].eps.length, last: 0 })
    Object.assign(game.S.arcs, { nune: done('nune'), boris: done('boris'), collectors: done('collectors') })
    const lead = () => game.rules.collect({ event: 'StoryBeat' }, game.facts()).some((r) => r.name === 'Beat_PaydayLead_First')
    expect(game.facts().arcsDone).toBe(2)
    expect(lead()).toBe(false)
    game.S.arcs.grant = done('grant')
    expect(game.facts().arcsDone).toBe(3)
    expect(lead()).toBe(true) // не пустая проверка: третий сюжетный сериал подводку открывает
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
    // chose той же специфичности, что поимка (#760): этот проход проверяет мешок, а не жребий двух заслуг
    delete game.S.mem['finale.niva']
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
  it('переводы 50 ₽ вычитаются один раз: суд и выплата считают от одного долга (#832)', async () => {
    const { game } = makeGame()
    const base = game.debt
    await game.transfer()
    await game.transfer()
    expect(game.debt, 'два перевода — ровно минус сто').toBe(base - 100)
    // суд идёт своим счётом и долг не переписывает: база остаётся той же
    game.S.mem.court = 3
    expect(game.debt, 'суд не двигает базис долга').toBe(base - 100)
    // выплата называет ровно текущий долг, а не другой базис
    const debt = game.debt
    const n = game.S.msgs.length
    game.S.ach.saint = 1
    game.S.ach.court = 1
    expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_real')
    const sys = game.S.msgs.slice(n).filter((m) => m.kind === 'sys').map((m) => m.text).join(' ')
    expect(sys, 'выплата назвала не тот базис').toContain(`${debt.toLocaleString('ru-RU')} ₽`)
    expect(game.debt, 'долг закрыт выплатой').toBe(0)
  })

  it('Самвел не объявляет себя хозяином свадьбы до серии со свадьбой (#831)', () => {
    const line = ROLL.find((e) => valueOf(e).t.includes('хозяин свадьбы'))
    expect(line, 'строка Самвела не найдена — проверка пустеет').toBeDefined()
    const when = spec(line!).when ?? []
    expect(when.some((c) => String(c.key) === 'arc.samvel' && c.op === '>=' && Number(c.value) >= 1), 'нет ворот по серии, где свадьба объявлена').toBe(true)
  })

  it('противоречие утра не выдаёт старое событие за сегодняшнее (#832)', () => {
    // утро о конверте говорит как о воспоминании («Помнишь конверт из фундамента?»), поэтому «сегодня же
    // фундамент вскрыли» — ложь: вскрытие было в финале бетона, днями раньше
    const beton = MORNING_CONTRA.find((c) => c.morning.test('Помнишь конверт из фундамента? У него было двойное дно. 40 000 — чьи, не знаю, теперь наши.'))
    expect(beton, 'ворота этого противоречия не сработали — проверка была бы пустой').toBeDefined()
    expect(beton!.say, 'старое вскрытие подано как сегодняшнее').not.toMatch(/сегодня/i)
    // там, где утро само объявляет сегодняшнюю новость, «сегодня» уместно
    const safe = MORNING_CONTRA.find((c) => c.morning.test('Сейф открыли! Второй ключ нашёлся — у малыша в игрушках. Внутри 120 000 и соска.'))
    expect(safe!.say).toMatch(/сегодня/i)
    // и каждый блок morning-контра опирается на настоящую строку утра этой партии
    const morning = SOURCES.map((e) => valueOf(e).t).join('\n')
    for (const c of MORNING_CONTRA) expect(c.morning.test(morning), `нет строки утра под ${c.morning}`).toBe(true)
  })

  // #909: доля Гарика — аренда за хранение денег и доля экскурсий, а не «копил, пока сидел»
  it('источник Гарика переозвучен под новый голос: аренда и экскурсии, сумма прежняя', () => {
    const garik = SOURCES.filter((e) => valueOf(e).t.includes('Гарик принёс'))
    expect(garik.length, 'строка Гарика в источниках одна').toBe(1)
    const t = valueOf(garik[0]!).t
    expect(t).toMatch(/аренд/i)
    expect(t).toMatch(/экскурс/i)
    expect(t).toMatch(/честный человек/)
    expect(t, 'старой формулировки нет').not.toMatch(/копил, пока сидел/i)
    expect(valueOf(garik[0]!).amount).toBe(25000)
  })

  it('с живым hodl утро не продаёт коины, а исход отдаёт лаваш; хвастовство о курсе помечено (#815)', async () => {
    const { game } = makeGame()
    game.S.day = 420
    game.S.mem['crypto.hodl'] = true
    await game.enterNode('payday', 'announce')
    await choose(game, 'witness')
    const morning = texts(game).join('\n')
    // hodl жив: обменяна часть, остальное остаётся в коине
    expect(morning).toContain('Остальное держу')
    expect(morning).not.toMatch(/[Пп]родал весь/)
    // хвастовство о курсе из легенды прозвучало в партии — это утверждение Алика, а не описание мира
    const boast = LEGENDS.crypto.lines.map((l) => lineSpec(l)).find((x) => (x.claims ?? []).includes('lavash_rate_up'))
    expect(boast, 'хвастовство о курсе помечено claims').toBeDefined()
    await game.say([{ t: boast!.t, claims: ['lavash_rate_up'] }])
    // исход при живом hodl — лавашом, и курс в нём честный, 1:1
    expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_lavash')
    expect(texts(game).join('\n')).toContain('Курс: 1 LAV = 1 лаваш')
    // обе версии — про один предмет, значит игрок может поймать Алика на курсе
    expect(CLAIM_LEDGER.lavash_rate_up.subject).toBe('money.rate')
    expect(CLAIM_LEDGER.lavash_rate_same.subject).toBe('money.rate')
    expect(CLAIM_LEDGER.lavash_rate_up.value).not.toBe(CLAIM_LEDGER.lavash_rate_same.value)
    expect(game.lie()?.kind, 'курс — предмет поимки').toBe('money')
  })
  it('кнопка-шутка звучит на следующий день и не поздравляет «с» прошедшим днём (#821)', () => {
    for (const [id, o] of Object.entries(OUTCOME)) {
      for (const b of o.button) {
        expect(lineSpec(b).t, `${id}: кнопка поздравляет «с» днём, который уже прошёл`).not.toMatch(/[Сс] Днём выплаты/)
      }
    }
    expect(lineSpec(OUTCOME.default!.button[0]!).t, 'день выплаты назван прошедшим').toMatch(/был День выплаты/)
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
    expect(late(game), 'подводка не сыграна — третьему акту рано (#893)').toBe(false)
    game.S.mem['payday.lead'] = 428
    game.S.mem['payday.signs'] = 2
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
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_First')
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_Second')
    game.nextDay(1)
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
  // #893: приёмка — штрихи подводки звучат за 2–3 дня до выплаты, по одному в день, раньше третьего акта их нет
  it('подводка: два штриха за два дня до анонса, один в день, и только в третьем акте (#893)', async () => {
    const { game } = makeGame()
    rich(game)
    // все сериалы закрыты: в этом окне сюжетный ход не открывает сцену и штрихи не глушит scene-floor
    const done = (id: string) => ({ i: ARCS[id].eps.length, last: 0 })
    Object.assign(game.S.arcs, Object.fromEntries(Object.keys(ARCS).map((id) => [id, done(id)])))
    // раньше третьего акта штрихов нет
    game.S.day = 329
    expect((await game.fire('StoryBeat'))?.name ?? '').not.toMatch(/^Beat_PaydayLead/)
    expect(game.S.mem['payday.signs']).toBeUndefined()
    // линии сошлись: первый штрих, второй ждёт своего дня — в тот же день его нет
    game.S.day = 340
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_First')
    expect(game.S.mem['payday.signs']).toBe(1)
    expect((await game.fire('StoryBeat'))?.name ?? '', 'второй штрих в тот же день').not.toBe('Beat_PaydayLead_Second')
    expect(game.S.mem['payday.signs']).toBe(1)
    const sign1Day = game.S.day
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_Second')
    expect(game.S.mem['payday.signs']).toBe(2)
    const sign2Day = game.S.day
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_Payday')
    // выплата — «завтра» после анонса: от дня первого штриха до неё три дня, от второго — два
    const at = Number(game.S.mem['payday.at'])
    expect(at).toBe(game.S.day + 1)
    expect(at - sign1Day).toBe(3)
    expect(at - sign2Day).toBe(2)
  })
  // #893: штрихи линий — по фактам идущих линий; чужие голоса молчат (как в пулах Дня выплаты)
  it('штрих Нуне — только с идущим декретом, Гарик — только на связи и со своей линией (#893)', () => {
    const { game } = makeGame()
    const who = () => game.lines.eligible('PD_LEAD', LEAD, game.lineFacts()).map((p) => (p.spec as Lead).w)
    expect(who(), 'общие штрихи Алика — в любой партии').toEqual([undefined, undefined, undefined])
    game.S.arcs.nune = { i: 1, last: 0 }
    game.S.mem[met('nune')] = true
    expect(who()).toContain('nune')
    game.S.mem[nuneDekretOver] = true
    expect(who(), 'декрет кончился — свой штрих Нуне молчит').not.toContain('nune')
    delete game.S.mem[nuneDekretOver]
    game.S.arcs.garik = { i: 1, last: 0 }
    game.S.mem[met('garik')] = true
    expect(who()).toContain('garik')
    game.S.mem[garikCut] = true
    expect(who(), 'Гарик без связи — его штрих молчит').not.toContain('garik')
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
  it('«Нивой» важнее стиля партии: финал chose бьёт Размика и Страсбург (#760)', async () => {
    const pick = async (seed: number, setup: (g: Game) => void) => {
      const { game } = makeGame({ seed })
      setup(game)
      return (await game.fire('PaydayOutcome'))?.name
    }
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(await pick(seed, (g) => { g.S.mem['finale.niva'] = 'chose'; g.S.mem['finale.razmik'] = 'default' }), `размик, сид ${seed}`).toBe('Payday_niva')
      expect(await pick(seed, (g) => { g.S.mem['finale.niva'] = 'chose'; g.S.ach.strasbourg = 1 }), `страсбург, сид ${seed}`).toBe('Payday_niva')
    }
    // chose нет — «Не тебе», как прежде
    expect(await pick(1, (g) => { g.S.mem['finale.razmik'] = 'default' })).toBe('Payday_notyou')
    const hierarchy = '`real` (4) > `lavash` (3) > `coins` (2) = `niva` (2) > `strasbourg`/`notyou` (1) > `default` (0)'
    expect(readFileSync('ENDINGS.md', 'utf8')).toContain(hierarchy)
    expect(readFileSync('docs/design/endings-single-condition.md', 'utf8')).toContain(hierarchy)
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
  it('баран передан игроку: доля Бориса не срезает выплату и называет, кто им пользовался (#856)', () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 8, last: 0 }
    game.S.mem['met.boris'] = true
    const claim = () => game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts())
      .map((p) => p.spec as Claim).find((c) => c.who === 'boris')
    expect(claim()?.cut, 'баран ещё у Алика — доля срезает выплату').toBe(20000)
    game.S.items.push('баран Борис') // has.boris — так его ставит барахолка
    expect(claim()?.cut, 'баран передан игроку — срезать за службу Алику нечего').toBe(0)
    expect(claim()?.t, 'текст называет, кто пользовался бараном').toMatch(/служил Алику/)
  })

  it('доля Карине за ванную не называет обещания игрока: условие мира назвала она сама (#862)', () => {
    const { game } = makeGame()
    // так доля и появляется: ритуал примирения, ветка «текстом» — Карине объявляет своё условие.
    // Игрок при этом мог отказаться от допработы ванной, и обещания в партии не было
    game.S.mem[bathAsked] = true
    const bath = game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts()).filter((p) => /ванн/i.test(p.text))
    expect(bath.length, 'доля за ванную не выпала — проверка пустеет').toBe(1)
    expect(bath[0].text, '«вы обещали» — обещания игрок не давал').not.toMatch(/обещал|договор|соглас/i)
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
