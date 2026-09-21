// Несостыковки из партии пользователя (docs/PLAYTEST_ISSUES.md): каждая — тестом, чтобы не вернулась.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { GROUP } from './arcs'
import { CONDOLE_REVIVED, GREET_A, FLOOR } from './misc'
import { SPEND } from './life'
import { WORLD, needs } from './world'
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
  it('после выселения квартплата с карты не списывается', () => {
    const { game } = makeGame()
    game.S.mem.evicted = true
    const spends = Array.from({ length: 200 }, () => game.draw('SPEND', SPEND))
    expect(spends).not.toContain('Квартплата')
    expect(new Set(spends).size).toBeGreaterThan(3)
  })
  it('«Кто это? А, …» — только если Алик не писал со вчера', () => {
    const { game } = makeGame()
    const excuses = () => Array.from({ length: 200 }, () => game.X.excuse().texts.join(' ')).join('\n')
    game.S.mem['alik.day'] = game.S.day
    expect(excuses()).not.toMatch(/Кто это\?/)
    game.S.mem['alik.day'] = game.S.day - 1
    expect(excuses()).toMatch(/Кто это\?/)
  })
  it('«терпение восстановлено»: событие вроде «продали микроволновку» — один раз, занятия — повторяются', () => {
    const { game } = makeGame()
    const floor = () => { game.S.patience = 0; game.S.stats.sent += 20; return game.line('FLOOR', FLOOR) }
    const got = Array.from({ length: 40 }, floor)
    expect(got.every(Boolean)).toBe(true)
    expect(got.filter((t) => /микроволновку/.test(t!))).toHaveLength(1)
  })
  it('займ 5000: деньги уходят с карты; нет 5000 на карте — Алик не просит', async () => {
    const { game } = makeGame()
    game.S.money = 3000
    game.S.mood = 8
    for (let i = 0; i < 30; i++) expect((await game.fire('PickScene'))?.name).not.toBe('Scene_lend')
    game.S.money = 9000
    await game.enterNode('lend', 'yes')
    expect(game.S.money).toBe(4000)
  })
  it('после семейного чата игрок цитирует только то, что в нём сказали', async () => {
    const { game } = makeGame()
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
    const barter = () => Array.from({ length: 80 }, () => String(game.scenes.barter.init!(game.rng, open).n))
    const rows = () => Array.from({ length: 40 }, () => (game.scenes.invoice.init!(game.rng, open).rows as Array<[string, number]>).map(([t]) => t)).flat()
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
  it('«толкни „Ниву“» — только внутри сериала «Нива», и из разговора квест не повторяется', () => {
    const { game } = makeGame()
    expect(game.questAllowed('q_niva')).toBe(false)
    game.setLegend('niva_stuck', 'niva')
    expect(game.questAllowed('q_niva')).toBe(true)
    expect(game.questAllowed('q_niva')).toBe(false) // уже был
    expect(game.questAllowed('q_hash')).toBe(true)
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
    for (const ev of ['AlikIdle', 'StoryBeat', 'PeriodLine', 'PromiseDue']) expect((await game.fire(ev))?.name).toBe('Quiet_Dead_' + ev)
    expect((await game.fire('PlayerSays', { intent: 'photo' }))?.name).toBe('Says_WhileDead')
  })
  it('в чёрном списке — легенды и «обед — святое» не приходят', async () => {
    const { game } = makeGame()
    game.S.mem.blocked = true
    for (const ev of ['StoryBeat', 'PeriodLine', 'PromiseDue']) expect((await game.fire(ev))?.name).toBe('Quiet_Blocked_' + ev)
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
  it('имя после приставки — с большой буквы', async () => {
    const { low } = await import('./excuses')
    expect(low('Гарика достали?')).toBe('Гарика достали?')
    expect(low('Как там с оплатой?')).toBe('как там с оплатой?')
  })
})
