// Несостыковки из партии пользователя (docs/PLAYTEST_ISSUES.md): каждая — тестом, чтобы не вернулась.
import { describe, it, expect } from 'vitest'
import type { GameEvent } from './rules/events'
import { makeGame , setMoney} from '../test/helpers'
import { ARCS, GROUP } from './arcs'
import { D } from './excuses'
import { ENDGAME_RETURNERS } from './endgame'
import { CONDOLE_REVIVED, GREET_A, FLOOR } from './misc'
import { SPEND } from './life'
import { WORLD, needs } from './world'
import { turnRules } from './rules/turn'
import { valueOf, type Entry } from '../engine/rules'
import type { Game } from '../engine/game'

const texts = (g: Game, n = 0) => g.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' ? [m.text] : []))

describe('несостыковки из партии пользователя', () => {
  it('Борис не звучит до своего сериала: ни в генераторе отмазок, ни в семейном чате, ни в хоре на слово «баран»', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 300; i++) expect(game.X.prev().text).not.toMatch(/Борис/)
    for (let i = 0; i < 20; i++) { await game.groupChat() }
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.who === 'boris')).toBe(false)
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Закину на карту, как баран поправится.' })
    for (let i = 0; i < 20; i++) await game.afterTurn()
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.who === 'boris')).toBe(false)
    expect(GROUP.boris.length).toBeGreaterThan(0)
  })
  it('«Опять» на отправке номера карты звучит только со второго раза', async () => {
    const { game } = makeGame()
    const sysTexts = (n: number) => game.S.msgs.slice(n).flatMap((m) => (m.kind === 'sys' ? [m.text] : []))
    let n = game.S.msgs.length
    await game.enterNode('card', 'sent')
    expect(sysTexts(n).some((t) => t.includes('Опять'))).toBe(false)
    expect(sysTexts(n)).toContain('Вы отправили номер карты.')
    await game.enterNode('card', 'bank')
    game.S.scene = null
    n = game.S.msgs.length
    await game.enterNode('card', 'sent')
    expect(sysTexts(n).some((t) => t.includes('Опять'))).toBe(true)
  })
  it('после выселения квартплата с карты не списывается', () => {
    const { game } = makeGame()
    game.S.mem.evicted = true
    const spends = Array.from({ length: 200 }, () => game.draw('SPEND', SPEND))
    expect(spends).not.toContain('Квартплата')
    expect(new Set(spends).size).toBeGreaterThan(3)
  })
  it('Алик вспоминает подаренное словами, а не ярлыком из досье', async () => {
    const { game } = makeGame()
    game.S.items.push('Место на кране (40 м)')
    game.S.stats.sent = 20
    const n = game.S.msgs.length
    // само правило, а не розыгрыш хода: Turn_Memory — редкий гость среди ходов Алика (вес в розыгрыше), и цикл AlikTurn
    // с лимитом держал тест на удаче сида: p90≈45 ходов, max 88, лимит 60 не покрывал 3 сида из 100 (#327)
    const rule = turnRules.find((r) => r.name === 'Turn_Memory')!
    await rule.respond!(game.rules.ctx(game, rule, { event: 'AlikTurn' }, game.facts()))
    const line = texts(game, n).find((t) => /отдал тебе/.test(t))!
    expect(line).toContain('«Место на кране»')
    expect(line).not.toContain('(40 м)')
  })
  it('акт взаимозачёта не вычитает одну позицию дважды', async () => {
    const { game } = makeGame()
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      game.S.scene = null
      await game.enterNode('invoice', 'ask')
      const doc = game.S.msgs.findLast((m) => m.kind === 'doc')
      if (doc?.kind === 'doc') seen.push(...doc.rows.map(([t]) => t.replace(/\s*\([^)]*\)\s*$/, '')))
    }
    expect(seen.length).toBeGreaterThan(8)
    expect(new Set(seen).size).toBe(seen.length)
  })
  it('срок-условие не выдаётся после того, как событие уже случилось', async () => {
    const { game } = makeGame()
    game.setLegend('boris_wedding', 'boris')
    const n0 = game.S.msgs.length
    await game.promiseLine(undefined, true)
    expect(texts(game, n0).join(' ')).toMatch(/свадьбы Бориса/)
    game.S.mem['boris.married'] = true // свадьба сыграна
    const n1 = game.S.msgs.length
    for (let i = 0; i < 10; i++) await game.promiseLine(undefined, true)
    expect(texts(game, n1).join(' ')).not.toMatch(/свадьбы Бориса/)
  })
  it('«Кто это? А, …» — только если Алик не писал со вчера', () => {
    const { game } = makeGame()
    const excuses = () => Array.from({ length: 200 }, () => game.X.excuse().texts.join(' ')).join('\n')
    game.S.mem['alik.day'] = game.S.day
    expect(excuses()).not.toMatch(/Кто это\?/)
    game.S.mem['alik.day'] = game.S.day - 1
    expect(excuses()).toMatch(/Кто это\?/)
  })
  it('«терпение восстановлено»: память о микроволновке — после продажи; занятия — повторяются', () => {
    const { game } = makeGame()
    game.S.mem['sold.microwave'] = true
    const floor = (turns: number) => { game.S.stats.sent += turns; return game.line('FLOOR', FLOOR) ?? 'Вы полежали на полу. Терпение восстановлено.' }
    const got = Array.from({ length: 40 }, () => floor(20))
    expect(got.filter((t) => /микроволновку/.test(t))).toHaveLength(1)
    // пул исчерпан (перерыв не прошёл) — системное сообщение всё равно от лица игры, без обращений Алика
    const dry = Array.from({ length: 30 }, () => floor(0))
    expect(dry.every((t) => t.startsWith('Вы '))).toBe(true)
  })
  it('микроволновка в FLOOR без sold.microwave не появляется', () => {
    const { game } = makeGame()
    setMoney(game, 1000)
    const floor = () => { game.S.stats.sent += 20; return game.line('FLOOR', FLOOR) ?? '' }
    const got = Array.from({ length: 40 }, floor)
    expect(got.some((t) => /микроволновку/.test(t))).toBe(false)
  })
  it('займ 5000: деньги уходят с карты; нет 5000 на карте — Алик не просит', async () => {
    const { game } = makeGame()
    setMoney(game, 3000)
    game.S.mood = 8
    for (let i = 0; i < 30; i++) expect((await game.fire('PickScene'))?.name).not.toBe('Scene_lend')
    setMoney(game, 9000)
    await game.enterNode('lend', 'yes')
    expect(game.S.money).toBe(4000)
  })
  it('после семейного чата игрок цитирует только то, что в нём сказали', async () => {
    const { game } = makeGame()
    // без знакомства группа пуста — заводим часть родни, иначе groupChat() никого не зовёт
    Object.assign(game.S.mem, { 'intro.arsen': true, 'intro.karine': true, 'intro.samvel': true, 'intro.nune': true, 'intro.mkrtich': true })
    const quotes = new Set<string>()
    for (let i = 0; i < 15; i++) {
      const n = game.S.msgs.length
      await game.groupChat()
      const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.who ? [m.text] : []))
      for (let k = 0; k < 10; k++) {
        const q = game.choices.find((c) => c.act === 'group' && c.text.startsWith('«'))
        if (q) { quotes.add(q.text); expect(said.some((t) => t.startsWith(q.text.slice(1, -3))), q.text).toBe(true) }
        game.S.choices = null
      }
    }
    expect(quotes.size).toBeGreaterThan(2)
  })
  it('бартер и акт до сериала «Баран Борис»: баран без имени, корма для Бориса нет', () => {
    const { game } = makeGame()
    game.S.mem['intro.baran'] = true
    const open = <T,>(a: readonly Parameters<typeof game.open<T>>[0][number][]) => game.open<T>(a)
    const barter = () => Array.from({ length: 80 }, () => String(game.scenes.barter.init!(game.rng, open, game.S.day).n))
    const rows = () => Array.from({ length: 40 }, () => (game.scenes.invoice.init!(game.rng, open, game.S.day).rows as Array<[string, number]>).map(([t]) => t)).flat()
    expect(barter()).toContain('баран без имени')
    expect(barter().join(' ')).not.toMatch(/Борис/)
    expect(rows().join(' ')).not.toMatch(/Борис/)
    game.S.arcs.boris = { i: 1, last: 0 }
    expect(barter()).toContain('баран Борис')
    expect(barter()).not.toContain('баран без имени')
    expect(rows().join(' ')).toMatch(/Корм для Бориса/)
  })
  it('срок из легенды — условие: он не «наступает сегодня» и не бывает «просрочен»', async () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    await game.promiseLine(undefined, true)
    const p = game.S.promises.at(-1)!
    expect(p.t).toMatch(/как ключ выйдет/)
    expect(p.due).toBeNull()
    game.S.day += 30
    expect(game.lateCount()).toBe(0)
  })
  it('«это когда?» про срок-условие — ответ про само условие, без повторов', async () => {
    const { game } = makeGame()
    const got = new Set<string>()
    for (let i = 0; i < 20; i++) {
      game.S.ctx = { when: 'как ключ выйдет', whenNever: true }
      const n = game.S.msgs.length
      await game.fire('PlayerSays', { intent: 'promiseCheck', arg: 'как ключ выйдет' })
      for (const t of texts(game, n)) { expect(got.has(t), t).toBe(false); got.add(t) }
    }
  })
  it('вопрос про сериал — только если будет новая серия (второй раз в тот же день не предлагается)', async () => {
    const { game } = makeGame()
    game.S.arcs.nune = { i: 3, last: -99 }
    await game.playArc('nune')
    game.S.choices = null
    // серия только что была — в тот же день новой не будет, вопрос не предлагается
    expect(game.choices.some((c) => c.act === 'arc' && c.arg === 'nune')).toBe(false)
    game.S.day++
    game.S.ctx = { arc: 'nune' }
    game.S.choices = null
    expect(game.choices.some((c) => c.act === 'arc' && c.arg === 'nune')).toBe(true)
    await game.fire('PlayerSays', { intent: 'arc', arg: 'nune' }) // следующая серия по вопросу
    game.S.choices = null
    expect(game.choices.some((c) => c.act === 'arc' && c.arg === 'nune')).toBe(false)
  })
  it('«Передавайте привет Борису» без новостей — «Передам», а не «пока без новостей»', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 2, last: game.S.day, byAsk: true }
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'arc', arg: 'boris', greet: true })
    expect(GREET_A.some((g) => texts(game, n).some((t) => t.includes(g.slice(0, 12))))).toBe(true)
  })
  it('реакция, а потом Алик написал словами — «А ответить словами?» уже не предлагается', async () => {
    const { game } = makeGame()
    game.S.ctx = { type: 'reactOnly' }
    await game.say(['Ключ ещё не вышел. Врач говорит: терпение.'])
    game.S.choices = null
    expect(game.choices.some((c) => c.act === 'reactQ')).toBe(false)
  })
  it('«толкни „Ниву“» — только внутри сериала «Нива»; once ставит takeQuest, не questAllowed', async () => {
    const { game } = makeGame()
    expect(game.questAllowed('q_niva')).toBe(false)
    game.setLegend('niva_stuck', 'niva')
    expect(game.questAllowed('q_niva')).toBe(true)
    expect(game.questAllowed('q_niva')).toBe(true) // проверка не списывает once
    await game.enterNode('q_niva', game.scenes.q_niva.start)
    game.takeQuest('q_niva')
    expect(game.questAllowed('q_niva')).toBe(false)
    expect(game.questAllowed('q_hash')).toBe(true)
  })
  it('срыв до takeQuest — квест снова доступен', () => {
    const { game } = makeGame()
    game.setLegend('niva_stuck', 'niva')
    expect(game.questAllowed('q_niva')).toBe(true)
    // enterNode не вызвали / takeQuest не вызвали — once пуст
    expect(game.S.rules.once['Quest_q_niva']).toBeUndefined()
    expect(game.questAllowed('q_niva')).toBe(true)
  })
  it('«вернулся» без рода: подходит и тёще, и дедушке', () => {
    for (const t of CONDOLE_REVIVED) expect(t).not.toMatch(/\bон\b|\bона\b/)
  })
})

// Несостыковки из плейтеста ботами (PR #11): 4 партии по 320 ходов, разбор — docs/PLAYTEST_ISSUES.md
describe('несостыковки из плейтеста ботами', () => {
  it('кран, Арсен, близнец — в мире с серии или ступени суда, а не со слова в переписке', async () => {
    const { game } = makeGame()
    for (const k of ['crane', 'arsen', 'twin'] as const) expect(game.holds(WORLD[k]), k).toBe(false)
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Здравствуйте, это Арсен, юрист Алика. Кран уехал. Грант — близнец.' })
    for (const k of ['crane', 'arsen', 'twin'] as const) expect(game.holds(WORLD[k]), k).toBe(false)
    const fwd = [needs('crane')({ f: 'Самвел', t: 'Кто взял мой кран?' }), { f: 'Мама', t: 'Сынок, поешь.' }]
    for (let i = 0; i < 10; i++) expect(game.draw('T_FWD', fwd).f).toBe('Мама')
    await game.playArc('razmik')
    expect(game.holds(WORLD.crane)).toBe(true)
    expect(Array.from({ length: 10 }, () => game.draw('T_FWD', fwd).f)).toContain('Самвел')
    game.S.mem.court = 1
    await game.fire('PlayerMessage', { tone: 'threat' })
    expect(game.holds(WORLD.arsen)).toBe(true)
  })
  it('вариант — не эхо только что отправленного («Эм… <то же самое>»)', async () => {
    const { game } = makeGame()
    game.S.msgs.push({ id: 999, kind: 'text', from: 'me', text: 'Так вы мне платить не собираетесь?!', time: '12:00' } as never)
    const gen = () => 'Так вы мне платить не собираетесь?!'
    game.seen.mark(gen())
    expect(game.playerLine(gen)).not.toMatch(/.+Так вы мне платить не собираетесь/)
  })
  it('срок-событие («как баран поправится», «после Навасарда») — без даты', async () => {
    const { D } = await import('./excuses')
    for (const w of D.WHEN as Array<{ t: string; d: number | null }>) if (/баран|Навасард|Вардавар|кран|Пасх|зим/.test(w.t)) expect(w.d, w.t).toBeNull()
  })
  it('«я в горы», «жена сказала не отвечать» — по разу за игру', () => {
    const { game } = makeGame()
    const got = Array.from({ length: 200 }, () => game.X.offended())
    for (const t of ['Всё, я в горы', 'Жена сказала тебе больше не отвечать']) expect(got.filter((x) => x.includes(t)).length, t).toBeLessThanOrEqual(1)
  })
  it('«Алик умер»: ни простоя, ни сюжетных ходов, на слова — Карине или «с того света»', async () => {
    const { game } = makeGame()
    game.S.mem.alik_dead = true
    for (const ev of ['AlikIdle', 'AlikAway', 'StoryBeat', 'PeriodLine', 'PromiseDue'] as GameEvent[]) expect((await game.fire(ev))?.name).toBe('Quiet_Dead_' + ev)
    expect((await game.fire('PlayerSays', { intent: 'photo' }))?.name).toBe('Says_WhileDead')
  })
  it('в чёрном списке — легенды, «обед — святое» и пачка непрочитанных не приходят', async () => {
    const { game } = makeGame()
    game.S.mem.blocked = true
    for (const ev of ['AlikAway', 'StoryBeat', 'PeriodLine', 'PromiseDue'] as GameEvent[]) expect((await game.fire(ev))?.name).toBe('Quiet_Blocked_' + ev)
  })
  it('где деньги — меняется по сюжету: «Нива» полгода назад не ловится как ложь', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в банке с огурцами.' })
    game.forgetLie()
    game.S.day += 60
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в фундаменте, брат.' })
    expect(game.lie()).toBeNull()
  })
  it('серия по вопросу — не в тот же день, что предыдущая; сама — не больше одной в день', async () => {
    const { game } = makeGame()
    game.S.arcs.samvel = { i: 0, last: -99 }
    await game.playArc('samvel')
    expect(game.arcCanAdvance('samvel', true)).toBe(false)
    expect(game.facts().arcAvailable).toBe(false)
    game.S.day++
    expect(game.arcCanAdvance('samvel', true)).toBe(true)
  })
  it('Размик слез — «как там наверху?» уже не спрашивают', () => {
    const { game } = makeGame()
    game.S.ctx = { chorus: 'razmik' }
    game.S.arcs.razmik = { i: 99, last: 0 }
    for (let i = 0; i < 20; i++) expect(game.buildChoices().some((c) => /наверху/.test(c.text))).toBe(false)
  })
})

describe('несостыковки из плейтеста ботами, раунд 2', () => {
  it('пока Гарик в фундаменте — не «в шашлычной у Гарика»; пока «Нива» в бегах — не «пишу с „Нивы“»', async () => {
    const { game } = makeGame()
    const lines = [needs('garikFree')('Я в шашлычной у Гарика.'), needs('nivaHome')('Пишу с «Нивы», у неё своя симка.'), 'Гарик передаёт привет из фундамента.']
    expect(game.open(lines)).toHaveLength(3)
    await game.playArc('garik') // «застыл в фундаменте»
    await game.playArc('niva')
    await game.playArc('niva') // «завелась и уехала»
    expect(game.open(lines)).toEqual(['Гарик передаёт привет из фундамента.'])
    for (let i = 0; i < 5; i++) { game.S.day += 5; await game.playArc('garik') } // до «Гарика достали!»
    expect(game.open(lines)).toContain('Я в шашлычной у Гарика.')
  })
  it('«Алик умер» — и на крик отвечает не Алик', async () => {
    const { game } = makeGame()
    game.S.mem.alik_dead = true
    expect((await game.fire('PlayerMessage', { tone: 'rude' }))?.name).toBe('Tone_WhileDead')
  })
  it('Арсен не кричит в ответ, пока не появился', async () => {
    const { game } = makeGame()
    game.S.mem['rude.heat'] = 1
    for (let i = 0; i < 30; i++) expect((await game.fire('PlayerMessage', { tone: 'rude' }))?.name).not.toBe('Rude_Family_arsen')
  })
  it('«при чём тут ваш шофёр Гриша?», а не «мой»: у родни, названной словами Алика, есть форма для игрока', async () => {
    const { D } = await import('./excuses')
    for (const r of (D.REL as Entry<string>[]).map(valueOf)) if (/(^|\s|\()(мой|моего|моей|я)(\s|$)/.test(r.split('|')[0])) expect(r.split('|')[2], r).toBeDefined()
    const { game } = makeGame()
    const [n, g, you] = (D.REL as Entry<string>[]).map(valueOf).find((r) => r.startsWith('мой шофёр'))!.split('|')
    game.S.ctx = { rel: { n, g, you } }
    for (let i = 0; i < 20; i++) expect(game.buildChoices().map((c) => c.text).join(' ')).not.toMatch(/мой шофёр/)
  })
  it('срок-условие в ответе на «это когда?» — без «Как только как…»', async () => {
    const { WHEN_COND } = await import('./misc')
    for (const w of WHEN_COND.map(valueOf)) expect(w).not.toMatch(/^(Как только|Когда) \{t\}/)
  })
})

describe('несостыковки из плейтеста ботами, раунд 3', () => {
  it('«держу слово» — обещание закрыто, «вы обещали…» по нему не предлагается', async () => {
    let kept = false
    for (let seed = 1; seed <= 30 && !kept; seed++) {
      const { game } = makeGame({ seed })
      game.S.mood = 9
      game.recordPromise({ text: 'послезавтра — переведу', d: 2 })
      game.S.day += 2
      await game.afterTurn()
      kept = game.S.msgs.some((m) => m.kind === 'transfer')
      if (kept) { game.S.day += 5; expect(game.lateCount()).toBe(0) }
    }
    expect(kept).toBe(true)
  })
  it('Карине ушла к Рубику — не пишет в чат Алика и не «свидетель»', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Приехал инспектор Рубик.' })
    game.S.mem['finale.rubik'] = 'karine'
    expect(game.canSpeak('karine')).toBe(false)
    expect(game.open([needs('karineHome')('Карине свидетель: отдам.'), 'Карине ушла к Рубику.'])).toEqual(['Карине ушла к Рубику.'])
  })
  it('декрет Нуне — только с её сериала', async () => {
    const { game } = makeGame()
    expect(game.holds(WORLD.dekret)).toBe(false)
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бухгалтер Нуне ушла в декрет.' })
    expect(game.holds(WORLD.dekret)).toBe(false)
    await game.playArc('nune')
    expect(game.holds(WORLD.dekret)).toBe(true)
  })
})

describe('несостыковки из плейтеста ботами, раунд 4', () => {
  it('после Дня выплаты — новых легенд нет, «Лаваш-коин» продан', () => {
    const { game } = makeGame()
    game.S.mem['payday.chain'] = 'x'
    game.setLegend('niva_stuck', 'niva')
    expect(game.legend()).toBeFalsy()
    game.S.mem['crypto.hodl'] = true
    expect(game.holds(WORLD.lavashHeld)).toBe(false)
    delete game.S.mem['payday.chain']
    expect(game.holds(WORLD.lavashHeld)).toBe(true)
  })
  it('Размик слез — «с крана» про него больше не звучит', async () => {
    const { game } = makeGame()
    await game.playArc('razmik')
    expect(game.holds(WORLD.razmikUp)).toBe(true)
    game.S.mem['finale.razmik'] = 'default'
    expect(game.open([needs('razmikUp')('Размик передаёт привет с крана.'), 'Размик слез и уволился.'])).toEqual(['Размик слез и уволился.'])
  })
  it('Карине уже писала — «Вы кто такой?» не бывает', async () => {
    const { game } = makeGame()
    game.S.mem['count.rude'] = 1
    game.S.mem['met.karine'] = true
    for (let i = 0; i < 30; i++) expect((await game.rules.match({ event: 'PickScene', facts: {} }, game.facts()))?.name).not.toBe('Scene_wife')
  })
  it('«три дня» в оправдании за пропажу — только после трёх дней молчания', () => {
    const { game } = makeGame()
    const excused = () => game.open(D.BACK_B as Entry<string>[]).some((t) => /три дня/.test(t))
    expect(excused()).toBe(false)
    game.S.mem['alik.day'] = game.S.day - 3
    expect(excused()).toBe(true)
  })
  it('в траур игроку предлагают соболезнование', async () => {
    const { game } = makeGame()
    const offered = () => game.rules.collect({ event: 'BuildChoices' }, game.facts()).some((r) => r.name === 'Opt_Mourn')
    expect(Array.from({ length: 30 }, offered).some(Boolean)).toBe(false)
    await game.playArc('grandpa')
    expect(Array.from({ length: 30 }, offered).some(Boolean)).toBe(true)
  })
  it('на «завтра» ссылаются только после того, как Алик его назвал сроком', () => {
    const { game } = makeGame()
    const pool = (k: string) => game.open(D[k] as Entry<string>[])
    const quoted = () => ['P_POL_B', 'P_RUDE_B', 'VOICE_A'].flatMap(pool).filter((t) => /«завтра»/.test(t))
    expect(quoted()).toEqual([])
    game.recordPromise({ text: 'завтра — закину', d: 1, tomorrow: true })
    expect(quoted().length).toBe(3)
  })
  it('обратно в группу добавляет только тот, кто уже писал сам', () => {
    const { game } = makeGame()
    expect(game.open(ENDGAME_RETURNERS)).toEqual([])
    game.S.mem['met.samvel'] = true
    expect(game.open(ENDGAME_RETURNERS).map((r) => r.who)).toEqual(['samvel'])
  })
  it('свадьбу и похороны своим героям устраивает их сериал, а не генератор отмазок', async () => {
    const { game } = makeGame()
    await game.playArc('grandpa')
    for (const id of ['goar', 'mkrtich', 'gagik', 'samvel', 'garik']) game.S.mem['intro.' + id] = true
    const own = /(Самвела(?!-)|Гарика|Гоар|Мкртича|Гагика|Грачика)[^.!?]*?(похорон|поминк|умер|свадьб|женил|крестин|юбилей|обручен|родила|роды)/i
    const said: string[] = []
    for (let i = 0; i < 600; i++) said.push(game.X.excuse({}).texts.join(' '))
    expect(said.filter((t) => own.test(t))).toEqual([])
    expect(said.some((t) => /Самвела|Гарика|Гоар|Мкртича|Гагика|Грачика/.test(t))).toBe(true)
  }, 60_000) // 600 отмазок генератора: время растёт с корпусом
  it('пока в семье прощаются, застолья и смертного одра не бывает', async () => {
    const { game } = makeGame()
    game.S.day = 250
    game.S.mood = 5
    await game.playArc('grandpa') // «дедушка умирает»
    expect(game.holds(WORLD.mourning)).toBe(true)
    const offered = async () => {
      const names = new Set<string>()
      for (let i = 0; i < 60; i++) {
        names.add((await game.rules.match({ event: 'PickScene', facts: {} }, game.facts()))?.name ?? '')
        names.add((await game.rules.match({ event: 'PickQuest', facts: {} }, game.facts()))?.name ?? '')
      }
      return names
    }
    const mourned = await offered()
    expect([...mourned].filter((n) => /toast|deathbed|tamada/.test(n))).toEqual([])
    await game.playArc('grandpa') // «дедушка опять не умер» — траур снят
    expect(game.holds(WORLD.mourning)).toBe(false)
    const after = await offered()
    expect([...after].some((n) => /toast|deathbed|tamada/.test(n))).toBe(true)
  })
  it('«дедушка ещё умирает?» спрашивают, только пока он умирает', async () => {
    const { game } = makeGame()
    const dying = () => game.open(ARCS.grandpa.follow).includes('Алик, дедушка ещё умирает?')
    expect(dying()).toBe(false)
    await game.playArc('grandpa')
    expect(dying()).toBe(true)
    await game.playArc('grandpa')
    expect(dying()).toBe(false)
  })
  it('имя после приставки — с большой буквы', async () => {
    const { low } = await import('./excuses')
    expect(low('Гарика достали?')).toBe('Гарика достали?')
    expect(low('Как там с оплатой?')).toBe('как там с оплатой?')
  })
})
