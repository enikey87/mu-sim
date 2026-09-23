import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import { ARCS } from './arcs'
import { D, type When } from './excuses'
import { CHORUS_LEGEND, LEGENDS } from './legends'
import { QUESTS } from './quests'
import { turnRules } from './rules/turn'
import { dateOf } from '../engine/time'
import { isOpen, test, valueOf, type Entry, type LineSpec } from '../engine/rules'
import { playtest, transcript } from '../tools/playtest'
import { CHORUS, PROMISE_DUE_KEPT, PROMISE_MET } from './world'
import { ENDGAME_FORMALITIES, ENDGAME_RETURNERS } from './endgame'
import { P_FRIDAY, TOPICS } from './topics'
import { CLAIMS, GRAND, ROLL, SOURCES } from './payday'
import { FWD, NOTIF, PERIOD } from './life'
import { ARC_DONE } from './arcs'

describe('регрессии первоначального аудита', () => {
  it('активная легенда не допускает независимую денежную отмазку', async () => {
    const { game } = makeGame()
    game.setLegend('grant', 'grant')
    const before = game.S.msgs.length
    await game.excuseTurn()
    const text = game.S.msgs.slice(before).flatMap((m) => m.kind === 'text' ? [m.text] : []).join(' ')
    expect(text).toContain(LEGENDS.grant.until)
  })

  it('непрочитанные отмазки тоже остаются внутри активной легенды', () => {
    let promiseSeen = false
    for (let seed = 1; seed <= 80; seed++) {
      const { game } = makeGame({ seed })
      game.setLegend('grant', 'grant')
      const promises = game.S.promises.length
      game.awayBurst(1, 0)
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
    const la = CHORUS_LEGEND.grant.map(valueOf).find((l) => typeof l !== 'string' && /Лос-Андж/.test(l.t)) as LineSpec
    expect(la.when?.some((c) => c.key === 'grant.paid' && c.op === '!exist')).toBe(true)
    expect(texts(ARCS.beton.follow, { 'arc.beton': 2 })).not.toContain('Фундамент вскрыли?')
    expect(texts(PERIOD.evening, { 'wedding.samvel': true }).join(' ')).not.toMatch(/дома|футбол/)
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

  it('группа выплаты — не семейная, и последние 50 ₽ в ней уже не лежат', () => {
    expect(texts(ENDGAME_RETURNERS, { 'met.samvel': true }).join(' ')).not.toMatch(/семейн/)
    expect(ENDGAME_FORMALITIES.join(' ')).not.toMatch(/хранит последние 50/)
  })
})
