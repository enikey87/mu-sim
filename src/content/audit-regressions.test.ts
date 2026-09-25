import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { alikTexts, makeGame } from '../test/helpers'
import { ARCS } from './arcs'
import { D, type When } from './excuses'
import { CHORUS_LEGEND, LEGENDS } from './legends'
import { COURT_SCENE, QUESTS } from './quests'
import { turnRules } from './rules/turn'
import { dateOf } from '../engine/time'
import { Gated, isOpen, test, valueOf, type Entry, type LineSpec } from '../engine/rules'
import { playtest, transcript } from '../tools/playtest'
import { CHORUS, PROMISE_DUE_KEPT, PROMISE_MET } from './world'
import { ENDGAME_FORMALITIES, ENDGAME_RETURNERS } from './endgame'
import { P_FRIDAY, TOPICS } from './topics'
import { CLAIMS, GRAND, MORNING_CONTRA, PAYDAY_SCENE, ROLL, SOURCES } from './payday'
import { CLAIMS as LIE_CLAIMS, P_LIE } from './lies'
import { MEMORY } from './memory'
import * as TALK from './talk'
import * as RUDE from './rude'
import * as MISC from './misc'
import { FWD, NOTIF, PERIOD } from './life'
import { ARC_DONE, GROUP } from './arcs'
import { LEGAL_CLAIMS, legalClaim, type LegalClaim } from '../engine/input'
import { threatClaim } from './memkeys'

/** Инстанция угрозы: тексты игрока → что игра обязана ответить. Проверяется и детектор, и пул. */
const CLAIM_SAMPLES: Array<[string, LegalClaim]> = [
  ['Я иду в суд!', 'court'], ['Я подаю в суд. Серьёзно.', 'court'], ['Я подам иск.', 'court'],
  ['Завтра пойду в полицию!', 'police'], ['Вызову участкового.', 'police'],
  ['Я пишу заявление.', 'statement'], ['Напишу жалобу.', 'statement'],
  ['Напишу заявление в прокуратуру', 'prosecutor'],
  ['Мой адвокат с вами свяжется.', 'lawyer'], ['Я нашёл юриста. Настоящего, с дипломом.', 'lawyer'],
  ['Я найму коллекторов', 'collectors'], ['Напишу заявление в налоговую', 'tax'],
]

describe('регрессии первоначального аудита', () => {
  it('активная легенда не допускает независимую денежную отмазку', async () => {
    const { game } = makeGame()
    game.setLegend('grant', 'grant')
    const before = game.S.msgs.length
    await game.excuseTurn()
    const text = game.S.msgs.slice(before).flatMap((m) => m.kind === 'text' ? [m.text] : []).join(' ')
    expect(text).toContain(LEGENDS.grant.until)
  })

  it('непрочитанные отмазки тоже остаются внутри активной легенды', async () => {
    let promiseSeen = false
    for (let seed = 1; seed <= 80; seed++) {
      const { game } = makeGame({ seed })
      game.setLegend('grant', 'grant')
      const promises = game.S.promises.length
      await game.awayBurst(1, 0)
      if (game.S.promises.length === promises) continue
      const message = game.S.msgs.at(-1)
      expect(message).toMatchObject({ kind: 'text', text: expect.stringContaining(LEGENDS.grant.until) })
      promiseSeen = true
    }
    expect(promiseSeen).toBe(true)
  })

  it('следующий перевод исполняет обещанные 51 ₽', async () => {
    let checked = false
    for (let seed = 1; seed <= 50 && !checked; seed++) {
      const { game } = makeGame({ seed })
      await game.fire('PlayerSays', { intent: 'transferQ' })
      if (game.S.mem.nextTransfer !== 51) continue
      const debt = game.S.debt
      await game.transfer()
      expect(game.S.debt).toBe(debt - 51)
      expect(game.S.msgs.findLast((m) => m.kind === 'transfer')).toMatchObject({ kind: 'transfer', amount: 51 })
      expect(game.S.mem.nextTransfer).toBeUndefined()
      checked = true
    }
    expect(checked).toBe(true)
  })

  it('среда утром, обещанная в среду, означает следующую среду', () => {
    const { game } = makeGame()
    while (dateOf(game.S.day).getDay() !== 3) game.S.day++
    const when = (D.WHEN as Entry<When>[]).map(valueOf).find((entry) => entry.t === 'в среду утром')!
    game.recordPromise({ text: when.t, ...when })
    expect(game.S.promises.at(-1)?.due).toBe(game.S.day + 7)
  })

  it('Нуне называется по имени в линии Бориса только после начала её арки', () => {
    const open = (line: Entry<string | LineSpec>, facts: Record<string, string | number | boolean>) => {
      const spec = valueOf(line)
      return typeof spec === 'string' || (spec.when ?? []).every((criterion) => test(criterion, facts))
    }
    const before = LEGENDS.boris_smeta.lines.filter((line) => open(line, {})).map(valueOf)
    expect(before.some((line) => typeof line !== 'string' && line.t.includes('бухгалтер'))).toBe(true)
    expect(before.some((line) => typeof line !== 'string' && line.t.includes('Нуне'))).toBe(false)

    const after = LEGENDS.boris_smeta.lines.filter((line) => open(line, { 'arc.nune': 1 })).map(valueOf)
    expect(after.some((line) => typeof line !== 'string' && line.t.includes('Нуне'))).toBe(true)
  })

  it('воспоминание называет последний полученный предмет', async () => {
    const { game } = makeGame()
    game.S.stats.sent = 20
    game.S.items.push('Угол конверта в бетоне')
    const rule = turnRules.find((candidate) => candidate.name === 'Turn_Memory')!
    await rule.respond!(game.rules.ctx(game, rule, { event: 'AlikTurn' }, game.facts()))
    expect(game.S.msgs.findLast((m) => m.kind === 'text')).toMatchObject({ kind: 'text', text: expect.stringContaining('Угол конверта в бетоне') })
  })

  it('работа тамадой имеет однозначный арифметический итог', () => {
    const node = QUESTS.q_tamada.nodes.yes
    expect(node.fx?.debt).toBe(-1000)
    expect(node.sys).toContain('долг Алика уменьшился на 1 000 ₽')
  })

  it('перевод за плитку доступен только после снятия угла', () => {
    const note = (D.TRANSFER_NOTE as Entry<string>[]).find((entry) => valueOf(entry) === 'за плитку в углу')!
    expect(isOpen(note, {})).toBe(false)
    expect(isOpen(note, { 'tile.cornerRemoved': true })).toBe(true)
  })

  it('выход неправильного ключа исполняет событийное обещание', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 4; i++) {
      if (i) game.S.day++
      await game.playArc('nune')
    }
    const promise = game.S.promises.find((record) => record.condition === 'nune.keyPassed')!
    expect(promise.met).toBeUndefined()

    game.S.day++
    await game.playArc('nune')
    await game.afterTurn()
    expect(promise.met).toBe(game.S.day)
    expect(game.legend()).toBe('safe_wrongkey')
  })

  it('текстовая выгрузка сохраняет каждое голосовое сообщение', async () => {
    let voices = 0
    for (let seed = 1; seed <= 20 && voices === 0; seed++) {
      const played = await playtest(seed, 100)
      voices = played.game.S.msgs.filter((message) => message.kind === 'voice').length
      const rendered = transcript(played).split('🎤 голосовое 0:').length - 1
      expect(rendered).toBe(voices)
    }
    expect(voices).toBeGreaterThan(0)
  })

  it('формулировки фиксируют границы долга и обследования фундамента', () => {
    expect(String(ARCS.tile.eps.at(-1)?.m[0])).toContain('Основной долг остался')
    expect(String(ARCS.beton.eps[3].m[0])).toContain('Фундамент не вскрывали')
    expect((valueOf(ARCS.grant.eps[3].m[0]) as { t: string }).t).toContain('Ваш долг — его обязательство')
  })
})

describe('регрессии раунда 16', () => {
  const texts = (entries: readonly Entry<unknown>[], facts: Parameters<typeof isOpen>[1] | Record<string, string | number | boolean>) =>
    entries.filter((e) => isOpen(e, facts)).map((e) => { const v = valueOf(e); return typeof v === 'string' ? v : (v as { t: string }).t })

  it('«с того света» пишет мёртвый Алик: смерть длится до серии возвращения, а не шесть дней', async () => {
    const { game } = makeGame()
    game.S.day = 250
    await game.playArc('alik_death')
    for (let i = 0; i < 2; i++) { game.S.day += 10; await game.afterTurn(); await game.playArc('alik_death') }
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('с того света'))).toBe(true)
    expect(game.S.mem.alik_dead).toBe(true)
    game.S.day += 10
    await game.playArc('alik_death')
    expect(game.S.mem.alik_dead).toBe(false)
  })

  it('выход из смерти предлагается, даже когда все вопросы про похороны недавно показывали', async () => {
    const { game } = makeGame()
    game.S.day = 250
    await game.playArc('alik_death')
    game.S.day += 2
    while (game.freshPlayer('F_alik_death', ARCS.alik_death.follow) !== null) { /* исчерпать окно показанных */ }
    game.S.choices = null
    expect(game.buildChoices().some((c) => c.act === 'arc' && c.arg === 'alik_death')).toBe(true)
  })

  it('серия похорон без Самвела не остаётся одним обещанием, а после возвращения его не спрашивают про «тот свет»', () => {
    const wake = ARCS.alik_death.eps[4].m
    expect(texts(wake, {}).some((t) => /поминки/i.test(t))).toBe(true)
    expect(texts(wake, {}).join(' ')).not.toMatch(/Самвел/)
    expect(texts(ARCS.alik_death.follow, { 'arc.alik_death': 4 })).not.toContain('Алик, вы там как, на том свете?')
    expect(texts(ARCS.alik_death.eps[5].m, { 'intro.karine': true }).join(' ')).not.toMatch(/^Алик жив/)
  })

  it('реплики легенд и обещаний не выдают старую новость и не обещают объяснений, которых не будет', () => {
    expect(texts(LEGENDS.niva_back.lines, {}).join(' ')).not.toMatch(/вернулась/)
    // заморозку ставят и Борис, и Рубик: до показаний Бориса легенда о нём не говорит
    expect(texts(LEGENDS.frozen.lines, { 'intro.boris': true, 'arc.boris': 9 }).join(' ')).not.toMatch(/Борис/)
    expect(PROMISE_MET.join(' ')).not.toMatch(/Сейчас объясню/)
    for (const t of PROMISE_DUE_KEPT) expect(t).toContain('{t}')
    expect(String(valueOf(ARCS.rubik.eps.find((e) => texts(e.m, {}).join(' ').includes('проверяет уровнем'))!.m[0]))).not.toMatch(/который день/)
  })

  it('перевод «держу слово» называет обещание, по которому пришёл', async () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'как штукатурка высохнет', d: 3 })
    const rule = game.rules.all.find((r) => r.name === 'Due_Kept')!
    const facts = { ...game.facts(), promise: 0 }
    const before = game.S.msgs.length
    await rule.respond!(game.rules.ctx(game, rule, { event: 'PromiseDue', facts }, facts))
    expect(game.S.msgs.slice(before).some((m) => m.kind === 'text' && m.text.includes('«как штукатурка высохнет»'))).toBe(true)
    // досье зовёт это «сдержал», а не «припомнили»: `asked` у записи закрывает срок, `kept` называет причину
    expect([game.S.promises[0].asked, game.S.promises[0].kept]).toEqual([true, true])
  })

  it('«вы обещали в пятницу» — только если Алик обещал пятницу', () => {
    expect(texts(P_FRIDAY, {}).join(' ')).not.toMatch(/обещал/)
    const { game } = makeGame()
    const friday = (D.WHEN as Entry<When>[]).map(valueOf).find((w) => w.due && 'weekday' in w.due && w.due.weekday === 5)!
    game.recordPromise({ text: friday.t, ...friday })
    expect(texts(P_FRIDAY, game.lineFacts()).join(' ')).toMatch(/обещали/)
    expect((D.LEGENDARY as Entry<string>[]).map(valueOf).join(' ')).not.toMatch(/обещал к пятнице/)
  })

  it('цикл 2: сроки и ответы не опираются на то, чего не было', () => {
    // кран никуда не уезжает — ни одного факта об этом нет
    expect((D.WHEN as Entry<When>[]).map(valueOf).map((w) => w.t).join(' ')).not.toMatch(/кран вернётся/)
    // «Банк правда работает?» — только если Алик говорил о банке, а не о Лос-Анджелесе
    expect(TOPICS.customs.need?.[4]?.test('Грант в Лос-Анджелесе. Поэтому денег нет')).toBe(false)
    expect(String(ARCS.beton.eps[3].m[0])).toContain('Дом — заказчика, Гранта')
    expect(JSON.stringify(LEGENDS.niva_gone.talk)).not.toMatch(/не заводится/)
    const { game } = makeGame()
    const sys = (game.scenes.redo.nodes.look.sys as unknown as ((v: Record<string, string>) => string)[])[0]
    expect(sys({ seen: '' })).not.toMatch(/полгода/)
  })

  it('цикл 3: Размик после финала не «наверху», Гарик не «только что» из фундамента, карта — не «ещё раз» в первый раз', () => {
    const payday = JSON.stringify([SOURCES, ROLL, CLAIMS])
    expect(payday).not.toMatch(/Сорок метров|слез с крана|только что из фундамента/)
    expect(JSON.stringify(ENDGAME_RETURNERS)).not.toMatch(/Отсюда видно/)
    expect(ARC_DONE.garik.join(' ')).not.toMatch(/теперь блогер/)
    expect(texts(D.P_NEU_B as Entry<string>[], {}).join(' ')).not.toMatch(/«Завтра» — это какой день/)
    expect(JSON.stringify(D)).not.toMatch(/Телефон выключаю/)
    const { game } = makeGame()
    const card = game.scenes.card.nodes
    const first = [...card.ask.opts!.flatMap((o) => (Array.isArray(o.t) ? texts(o.t, {}) : [])), ...texts(card.knows.a as Entry<string>[], {})]
    expect(first.join(' ')).not.toMatch(/ещё раз|сорок раз/)
    expect(JSON.stringify(game.scenes)).not.toMatch(/Учусь на экономиста/)
    expect(texts(ARCS.alik_death.eps[4].m, {}).every((t) => t.includes('тогда'))).toBe(true)
  })

  it('цикл 4: соболезнуют умершему, Грант «всё заплатил» — только когда это факт, сроки и праздники по календарю', () => {
    expect(texts(D.P_CONDOLE as Entry<string>[], { 'grandpa.dying': true, mourning: true }).join(' ')).not.toMatch(/соболезн/i)
    expect(texts(D.P_CONDOLE as Entry<string>[], { alik_dead: true }).join(' ')).toMatch(/соболезн/i)
    expect(texts(CHORUS.grant, {}).join(' ')).not.toMatch(/заплатил|оплачено/)
    // «всё заплатил» — новость одной серии Гранта: реплика легенды Лос-Анджелеса её не объявляет и факт не пишет
    const la = CHORUS_LEGEND.grant.map(valueOf).find((l) => typeof l !== 'string' && /Лос-Андж/.test(l.t)) as LineSpec
    expect(la.t).not.toMatch(/всё заплатил/)
    expect(la.remember ?? []).toEqual([])
    expect(texts(ARCS.beton.follow, { 'arc.beton': 2 })).not.toContain('Фундамент вскрыли?')
    expect(texts(PERIOD.evening, { 'wedding.samvel': true }).join(' ')).not.toMatch(/дома|футбол/)
    expect(texts(PERIOD.evening, { 'wedding.anush': true }).join(' ')).not.toMatch(/дома|футбол/)
    expect(JSON.stringify([PERIOD, GRAND])).not.toMatch(/тамада не отпускает|ты её снимал с крыши/)
    expect(JSON.stringify(LEGENDS)).not.toMatch(/третий раз гадает/)
    expect(JSON.stringify(CLAIMS)).not.toMatch(/Вы сомневались/)
    const landlord = NOTIF.find((n) => /Жду до пятницы/.test(n.t))!
    expect((landlord.when ?? []).every((c) => test(c, { dow: 5 }))).toBe(false)
    const builder = FWD.find((f) => /Днём строителя/.test(JSON.stringify(valueOf(f))))!
    expect(isOpen(builder, { month: 8, dom: 29 })).toBe(false)
    expect(isOpen(builder, { month: 8, dom: 9 })).toBe(true)
    const { game } = makeGame()
    expect(game.facts().dom).toBe(dateOf(game.S.day).getDate())
  })

  it('цикл 5: срок из легенды — не «завтра»; День выплаты ждёт возвращения Алика', async () => {
    const { game } = makeGame()
    const p = { text: 'расплачусь завтра', t: 'завтра', d: 1, tomorrow: true }
    ;(game as unknown as { alignPromise: (p: object, until: string) => object }).alignPromise(p, 'как ключ выйдет')
    game.recordPromise(p as Parameters<typeof game.recordPromise>[0])
    expect(game.S.mem['said.tomorrow']).toBeUndefined()

    for (const late of [false, true]) {
      const { game: g } = makeGame()
      g.S.day = late ? 500 : 340
      g.S.stats.sent = late ? 200 : 100
      if (!late) for (const id of ['boris', 'nune', 'grant']) g.S.arcs[id] = { i: ARCS[id].eps.length, last: 0 }
      const beat = () => g.rules.collect({ event: 'StoryBeat' }, g.facts()).map((r) => r.name).filter((n) => n.startsWith('Beat_Payday'))
      expect(beat(), late ? 'поздний' : 'сошлись линии').toEqual([late ? 'Beat_Payday_Late' : 'Beat_Payday'])
      g.S.mem.alik_dead = true
      expect(beat()).toEqual([])
    }
  })

  it('цикл 5: повторы и утверждения без факта', () => {
    expect(texts(LEGENDS.beton_money.lines, { 'intro.grant': true, 'grant.paid': true }).join(' ')).not.toMatch(/Грант не заплатит/)
    expect(JSON.stringify(LEGENDS.grant.lines)).not.toMatch(/плитка слишком ровная/)
    expect(JSON.stringify(D)).not.toMatch(/в прошлый раз, ты не оценил/)
    expect(JSON.stringify(ARCS.nune.eps)).toMatch(/Ключ у малыша Нуне/)
    expect(JSON.stringify(ARCS.beton.eps[2])).not.toMatch(/"Подтверждаю\./)
    expect(JSON.stringify(MORNING_CONTRA.map((c) => c.say))).not.toMatch(/утром/i)
    // пара противоречия мертва, если её «утренний» источник переписали: каждая находит свой доход
    const incomes = SOURCES.map((x) => valueOf(x).t)
    for (const c of MORNING_CONTRA) expect(incomes.some((t) => c.morning.test(t)), String(c.morning)).toBe(true)
    const links = Object.values(GRAND).flat().map((l) => { const v = valueOf(l); return typeof v === 'string' ? v : v.t })
    for (const c of MORNING_CONTRA) expect(links.some((t) => c.link.test(t)), String(c.link)).toBe(true)
    const blood = NOTIF.find((n) => n.app === 'Донорский центр')!
    expect((blood.when ?? []).every((c) => test(c, {}))).toBe(false)
    expect((blood.when ?? []).every((c) => test(c, { 'blood.given': true }))).toBe(true)
  })

  it('цикл 6: «после свадьбы Бориса» — после, а не в день приглашения', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 5, last: 0 }
    await game.playArc('boris')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('Свадьба Бориса! Приходи!'))).toBe(true)
    expect(game.S.mem['boris.married']).toBeUndefined()
    game.S.day += 5
    await game.afterTurn()
    expect(game.S.mem['boris.married']).toBe(true)
  })

  it('цикл 6: утверждения о том, чего в переписке не было', () => {
    const frozenTalk = LEGENDS.frozen.talk!
    const asked = frozenTalk.filter((e) => JSON.stringify(e).includes('Что именно Борис рассказал'))
    expect(asked.every((e) => !isOpen(e, { 'intro.boris': true, 'intro.niva': true, 'arc.boris': 9 }))).toBe(true)
    expect(JSON.stringify(frozenTalk)).not.toMatch(/Про сейф/)
    expect(JSON.stringify(ARCS.boris.eps)).not.toMatch(/писать учил/)
    expect(JSON.stringify(COURT_SCENE)).not.toMatch(/выговор за «когда рак/)
    expect(JSON.stringify(GROUP)).not.toMatch(/я уже написал ему/)
    expect(JSON.stringify(RUDE)).not.toMatch(/не я их позвал/)
    expect(texts(P_LIE, { 'lie.alikOld': true }).join(' ')).not.toMatch(/у вас \{old\}/)
    const bank = NOTIF.find((n) => /это хобби/.test(n.t))!
    expect((bank.when ?? []).every((c) => test(c, { fifty: 1 }))).toBe(false)
    expect(bank.t).not.toMatch(/в месяц/)
    const refuse = PAYDAY_SCENE.nodes.refuse.a!
    // Карине ещё не писала: её первая реплика говорит, кто она
    const first = texts(refuse, {})
    expect(first.length).toBeGreaterThan(0)
    expect(first.every((t) => t.includes('жена Алика'))).toBe(true)
  })

  it('цикл 7: повтор «отключить уведомления» признаёт, что их включили обратно', async () => {
    const { game } = makeGame()
    ;(game as unknown as { startEndgame: (o: string) => void }).startEndgame('coins')
    const sys = () => game.S.msgs.flatMap((m) => (m.kind === 'sys' ? [m.text] : []))
    await game.endgameAction('mute')
    expect(sys().filter((t) => t.includes('отключили'))).toEqual(['Вы отключили уведомления'])
    await game.endgameAction('mute')
    expect(sys().filter((t) => t.includes('отключили')).at(-1)).toMatch(/снова включены/)
  })

  it('цикл 7: сейф, сервиз, пятница и застолье — без того, чего не было', () => {
    expect(JSON.stringify(PERIOD)).not.toMatch(/свадьба не отпускает/)
    expect(JSON.stringify(MEMORY)).not.toMatch(/ищет, кто разбил сервиз/)
    expect(JSON.stringify(SOURCES)).not.toMatch(/Малыш Алик наконец отдал ключ/)
    expect(JSON.stringify(LIE_CLAIMS)).not.toMatch(/Ключ всё ещё в пути/)
    expect(JSON.stringify(MORNING_CONTRA.map((c) => c.say))).not.toMatch(/Какой ещё ключ/)
    expect(texts(P_FRIDAY, { 'said.friday': true }).join(' ')).not.toMatch(/Сегодня пятница — день, когда/)
  })

  it('цикл 8: «это вы кому?» — только сразу после сообщения не тому', async () => {
    const { game } = makeGame()
    await game.wrongChat()
    expect(game.facts()['ctx.wrong']).toBe(true)
    await game.say(['Брат, у меня сегодня хорошее настроение.'])
    expect(game.facts()['ctx.wrong']).toBeFalsy()
  })

  it('цикл 8: звонок заказчику и вопросы Гранту не повторяют уже сказанное', () => {
    const { game } = makeGame()
    game.S.day = 250
    const rule = game.rules.all.find((r) => r.name === 'Scene_customer')!
    expect(rule.when.some((c) => c.key === 'grant.paid' && c.op === '!exist')).toBe(true)
    expect(JSON.stringify(TALK)).not.toMatch(/вы правда ему всё заплатили/)
    expect(JSON.stringify(D.CONDOLE_A)).not.toMatch(/Там оценят/)
    expect(JSON.stringify(NOTIF)).not.toMatch(/Ваше заявление «Алик не платит» принято/)
    // строка живёт внутри функции правила — JSON её не видит, проверяем исходник
    expect(readFileSync('src/content/rules/choices.ts', 'utf8')).not.toMatch(/Суд — не свадьба/)
  })

  it('группа выплаты — не семейная, и последние 50 ₽ в ней уже не лежат', () => {
    expect(texts(ENDGAME_RETURNERS, { 'met.samvel': true }).join(' ')).not.toMatch(/семейн/)
    expect(ENDGAME_FORMALITIES.join(' ')).not.toMatch(/хранит последние 50/)
  })

  it('цикл 9: пул ответов на угрозу говорит про инстанцию, которую игрок назвал', async () => {
    const POOLS: Array<[string, readonly Entry<unknown>[]]> = [
      ['THREAT_A', D.THREAT_A], ['APPEAL', RUDE.APPEAL], ['THREAT_AGAIN', MISC.THREAT_AGAIN],
    ]
    // чем строка отвечает. Гейт на чужой предмет — дефект в любом пуле: строка про Вардана не идёт тому, кто звал суд
    const SUBJECT: Array<[LegalClaim, RegExp]> = [
      ['court', /(?:^|\. )Суд[? —]|присяжн/i], ['police', /Полиция\?|Вардан/], ['statement', /^Заявление\?/],
      ['prosecutor', /^Прокурор\?/], ['lawyer', /^Адвокат\?|^Юрист\?/], ['collectors', /^Коллекторы\?/], ['tax', /^Налоговая\?/],
    ]
    for (const [name, pool] of POOLS) for (const e of pool) {
      const t = String(valueOf(e))
      const named = SUBJECT.filter(([, re]) => re.test(t)).map(([id]) => id)
      const claims = e instanceof Gated ? e.when.filter((c) => c.key === threatClaim).map((c) => String(c.value)) : []
      expect(new Set(claims).size, `${name}: ${t}`).toBe(claims.length)
      for (const c of claims) expect(named, `${name}: ${t}`).toContain(c)
      // пул, который отвечает игроку, предметных строк без гейта не держит: ответ обязан быть про его слова
      if (name === 'THREAT_A' && named.length) expect(claims, `${name}: ${t}`).toEqual(named)
    }
    // гейт не мёртвый: своему предмету строка открыта, чужому закрыта
    const collector = (D.THREAT_A as Entry<unknown>[]).find((e) => /Коллектор/.test(String(valueOf(e))))!
    expect(isOpen(collector, { [threatClaim]: 'collectors' })).toBe(true)
    expect(isOpen(collector, { [threatClaim]: 'court' })).toBe(false)
    expect(isOpen(collector, {})).toBe(false)
    // инстанцию не назвали — общий ответ есть, и он не называет ни одной
    const generic = texts(D.THREAT_A as Entry<unknown>[], {})
    expect(generic.length).toBeGreaterThan(0)
    expect(generic.join(' ')).not.toMatch(/суд|полиц|заявлен|прокурор|адвокат|юрист|коллектор|налогов/i)
    // полиция — не суд: без полицейской угрозы про Вардана молчат все три пула
    for (const [name, pool] of POOLS) for (const e of pool) {
      if (!/Вардан/.test(String(valueOf(e)))) continue
      expect(isOpen(e, { [threatClaim]: 'court' }), `${name}: Вардан`).toBe(false)
      expect(isOpen(e, { [threatClaim]: 'police' }), `${name}: Вардан`).toBe(true)
    }
    // живая проверка: факт пишет само сообщение игрока, ответ — из пула по этому факту.
    // своя партия на образец и сид: ответ, который назвал чужую инстанцию хоть раз, — дефект;
    // своя инстанция, если её строка открыта, должна прозвучать хоть раз — иначе гейт мёртв
    for (const [text, want] of CLAIM_SAMPLES) {
      const own = SUBJECT.find(([id]) => id === want)![1]
      let hits = 0
      for (let seed = 1; seed <= 16; seed++) {
        const { game } = makeGame({ seed })
        await game.send(text)
        expect(game.S.mem[threatClaim], text).toBe(want)
        const said = alikTexts(game.S.msgs)
        for (const t of said) for (const [id, re] of SUBJECT) if (id !== want) expect(t, `${text} (сид ${seed})`).not.toMatch(re)
        if (said.some((t) => own.test(t))) hits++
      }
      const reachable = texts(D.THREAT_A as Entry<unknown>[], { [threatClaim]: want }).some((t) => own.test(t))
      if (reachable) expect(hits, text).toBeGreaterThan(0)
    }
  })

  it('цикл 9: каждая инстанция достижима, и её значение в гейте — из реестра', () => {
    for (const [text, want] of CLAIM_SAMPLES) expect(legalClaim(text), text).toBe(want)
    expect(legalClaim('Готовьте документы, Алик.')).toBeUndefined()
    for (const [id] of LEGAL_CLAIMS) expect(CLAIM_SAMPLES.some(([, w]) => w === id), id).toBe(true)
  })

  it('цикл 9: новость объявляет один источник, а не второй', () => {
    // «Борис стал прорабом» — серия; строка легенды продолжает
    expect(texts(LEGENDS.boris_object.lines, { 'arc.boris': 8 }).join(' ')).not.toMatch(/Он прораб/)
    // объект закрывает финал Бориса, а не серия о назначении
    expect(NOTIF.find((n) => /Баран-прораб/.test(n.t))!.t).not.toMatch(/сдал объект/)
    // «Ищем Ниву всем селом» — серия; строка легенды не повторяет поиск
    expect(texts(LEGENDS.niva_gone.lines, { 'arc.niva': 2 }).join(' ')).not.toMatch(/Ищем|Деньги с ней/)
    // расчёт Гранта пишет его серия (grant.paid): реплика легенды его не объявляет
    const law = CHORUS_LEGEND.grant.find((l) => typeof valueOf(l) !== 'string' && /beton_law/.test(JSON.stringify(valueOf(l))))!
    expect(String((valueOf(law) as LineSpec).t)).not.toMatch(/рассчитал|заплат/)
    // «опять» — только у того, что уже было: премию выписывает утро Дня выплаты, болезнь у Бориса одна
    expect(JSON.stringify(MEMORY)).not.toMatch(/опять премию/)
    expect(JSON.stringify(MISC.RUDE_AGAIN)).not.toMatch(/опять заболел/)
    expect(NOTIF.find((n) => n.app === 'Госуслуги' && /угроза/.test(n.t))!.t).not.toMatch(/судом/)
  })

  it('цикл 9: решение Страсбурга объявляет ступень суда, а не воспоминание', () => {
    // реплики памяти — LineSpec: их условия проверяются тем же test(), а не isOpen из колоды
    const holds = (l: LineSpec, facts: Record<string, string | number | boolean>) => (l.when ?? []).every((c) => test(c, facts))
    const line = (needle: RegExp) => MEMORY.map(valueOf).filter((l): l is LineSpec => typeof l !== 'string' && needle.test(l.t))
    const pending = line(/Страсбург думает/)
    const decided = line(/решение Страсбурга/)
    expect(pending).toHaveLength(1)
    expect(decided).toHaveLength(1)
    // пока ступень не пройдена, письма нет: Страсбург думает
    expect(holds(pending[0], { 'ach.strasbourg': true, 'since.strasbourg': 3, court: 6 })).toBe(true)
    expect(holds(pending[0], { court: 7 })).toBe(false)
    // ступень пройдена — воспоминание продолжает, а не пересказывает решение
    expect(holds(decided[0], { court: 6, 'since.strasbourg': 9 })).toBe(false)
    expect(holds(decided[0], { court: 7 })).toBe(true)
    // и ни одно воспоминание не объявляет письмо с решением до ступени
    for (const l of line(/письмо|«Отстаньте»/)) expect(holds(l, { 'ach.strasbourg': true, 'since.strasbourg': 9, court: 6 })).toBe(false)
  })

  // пул реплик: открыт и гейт записи, и собственные условия LineSpec (isOpen видит только гейт)
  const spoken = (pool: readonly Entry<unknown>[], facts: Record<string, string | number | boolean>) => pool.filter((e) => isOpen(e, facts))
    .map((e) => valueOf(e)).map((v) => (typeof v === 'string' ? { t: v } : (v as LineSpec)))
    .filter((l) => (l.when ?? []).every((c) => test(c, facts))).map((l) => l.t).join(' ')

  it('цикл 10: Страсбург — до решения ступени письмо Дня выплаты первое, после — пересмотр', async () => {
    const say = (g: ReturnType<typeof makeGame>['game'], n: number) =>
      g.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : [])).join('\n')
    const threat = async (g: ReturnType<typeof makeGame>['game']) => { g.S.offlineDays = 0; const n = g.S.msgs.length; await g.send('Я подаю в суд. Серьёзно.'); return say(g, n) }
    const memo = (facts: Parameters<typeof test>[1]) => MEMORY.map(valueOf)
      .filter((l): l is LineSpec => typeof l !== 'string' && /Страсбург/.test(l.t) && (l.when ?? []).every((c) => test(c, facts))).map((l) => l.t)
    for (const decided of [false, true]) {
      const { game } = makeGame()
      Object.assign(game.S.mem, { court: 5, 'met.arsen': true, 'intro.arsen': true })
      expect(await threat(game)).toMatch(/ушло в Европейский суд/) // ступень 5: дело ушло, решения нет
      expect(game.S.ach.strasbourg).toBeDefined()
      if (decided) expect(await threat(game)).toMatch(/Страсбург вынес решение/)
      expect(game.S.mem.court).toBe(decided ? 7 : 6)
      const n = game.S.msgs.length
      expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_strasbourg')
      const letter = say(game, n)
      expect(letter).toMatch(/письмо из Страсбурга/)
      // пересмотр — только тому, кому ступень уже объявила решение
      if (decided) expect(letter).toMatch(/передумали/)
      else expect(letter).not.toMatch(/передумали|Разбирайтесь/)
      const b = game.S.msgs.length
      await game.fire('PaydayButton', { outcome: 'strasbourg' })
      expect(say(game, b)).toMatch(/ещё одно письмо/)
      // после письма воспоминание не говорит, что Страсбург думает
      game.S.day += 5 // воспоминание — о прошлом: не в день письма
      expect(memo(game.lineFacts()).join(' ')).not.toMatch(/думает/)
      if (!decided) {
        // решение ступени после письма — второе письмо, а не первая новость
        const verdict = await threat(game)
        expect(verdict).toMatch(/ещё одно письмо/)
        expect(verdict).not.toMatch(/вынес решение/)
        expect(game.S.mem.court).toBe(7)
      }
    }
    // звенья великой отмазки: ответ Страсбурга — только после ступени решения
    const verdict = spoken(GRAND.verdict, { 'ach.strasbourg': true, court: 6 })
    expect(verdict).not.toMatch(/Страсбург ответил/)
    expect(verdict).toMatch(/думает/)
    expect(spoken(GRAND.verdict, { 'ach.strasbourg': true, court: 7 })).toMatch(/Страсбург ответил: «Разбирайтесь сами/)
  })

  it('цикл 10: разморозку и премию объявляют один раз', () => {
    // счета разморозила легенда — утро Дня выплаты не объявляет разморозку второй раз
    const src = (f: Record<string, string | boolean>) => spoken(SOURCES, f)
    expect(src({ 'finale.boris': 'default' })).toMatch(/разморозила/)
    expect(src({ 'finale.boris': 'default', 'tax.thawed': true })).not.toMatch(/разморозила/)
    expect(src({ 'finale.boris': 'default', 'tax.thawed': true })).toMatch(/90 000/)
    // финал Бориса раздал зарплату; премию объявляет утро выплаты — воспоминание её не называет
    const boris = MEMORY.map(valueOf).filter((l): l is LineSpec => typeof l !== 'string' && /Борис-прораб/.test(l.t))
    expect(boris.length).toBeGreaterThan(0)
    for (const l of boris) expect(l.t).not.toMatch(/преми/)
  })
})
