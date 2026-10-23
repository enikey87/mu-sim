// Ответы по теме, «Это корова?» только сразу после «Мууу», реплики по стадии игры.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { valueOf } from '../engine/rules'
import { Gated } from './fact'
import { needs } from './world'
import { wedding } from './memkeys'
import { TOPICS, P_RUDE_BLOCKED, P_RUDE_POLITE, TOPIC_OBSESSED, P_NIGHT, DESPERATE_PAIRS } from './topics'
import { NOTIF } from './life'
import { D, make, type DrawFn } from './excuses'
import type { Game } from '../engine/game'

/** Словарь цитат: регулярки rneed всех тем — то, что игра уже считает «словами Алика». Ведётся не руками: он и есть rneed. */
describe('подарочные деньги и конверты — только по введённой свадебной линии (#886)', () => {
  it('без свадьбы Ануш строк нет, с живой свадьбой — есть; общие строки свободны', () => {
    const { game } = makeGame()
    const p = () => game.open(TOPICS.wedding.p)
    const r = () => game.open(TOPICS.wedding.r)
    // триггер темы ловит любое «свадьба» (кортеж, водолаз) — подарочных денег в мире ещё нет
    expect(p(), 'без свадьбы — вопроса про подарочные нет').not.toContain('Может, из подарочных денег?')
    expect(r(), 'без свадьбы — конвертов нет').not.toContain('Свадьба к свадьбе! Конверты не бесконечные!')
    expect(r(), 'без свадьбы — подарков нет').not.toContain('Я приду на эту свадьбу и заберу подарки!!!')
    expect(p(), 'общая строка остаётся свободной').toContain('Сколько у вас родственников вообще?')
    // свадьба Ануш: подарочная линия идёт
    game.rules.applyOps([{ key: wedding('anush'), op: '=', value: true, forDays: 8, scope: 'world' }], {})
    expect(p(), 'живая свадьба — вопрос про подарочные есть').toContain('Может, из подарочных денег?')
    expect(r(), 'живая свадьба — конверты есть').toContain('Свадьба к свадьбе! Конверты не бесконечные!')
    expect(r(), 'живая свадьба — подарки есть').toContain('Я приду на эту свадьбу и заберу подарки!!!')
  })
})

describe('дядя Алика — только после знакомства (#1293)', () => {
  it('до введения Самвела строки нет, после — есть; остальные грубые строки свободны', () => {
    const { game } = makeGame()
    const r = () => game.open(TOPICS.relative.r)
    // тема ловит и «дядю заказчика» (стр. 44 раунда 120): Самвела мир ещё не знает
    expect(r(), 'строка зовёт родственника до его введения').not.toContain('Я сам позвоню твоему дяде!!!')
    expect(r(), 'тётя-то уже есть').toContain('Пусть тётя и платит!!!')
    game.S.mem['intro.samvel'] = true
    expect(r(), 'Самвел введён — строка уместна').toContain('Я сам позвоню твоему дяде!!!')
  })
})

const CITE_WORDS = Object.values(TOPICS).flatMap((t) => Object.values(t.rneed ?? {}))
/** Узкие исключения: слово матчит словарь цитат, но цитатой не является — причина у каждого (#739). */
const NOT_A_CITE: Record<string, string[]> = {
  // «Скинь перевод» — просьба игрока, а не цитата из отмазки: слово бытовое для темы банка
  'bank.r[1]': ['перевод'],
}
/** Все вхождения регулярки в текст (флаги регулярки сохраняются, g добавляется). */
const hits = (text: string, re: RegExp): string[] =>
  [...text.matchAll(new RegExp(re.source, [...new Set([...re.flags, 'g'])].join('')))].map((m) => m[0])

const fresh = (game: Game) => { game.S.choices = null; return game.choices }
const offered = (game: Game, pred: (c: ReturnType<Game['buildChoices']>[number]) => boolean, tries = 30) => {
  for (let i = 0; i < tries; i++) if (fresh(game).some(pred)) return true
  return false
}

describe('ответ по теме', () => {
  it('каждая тема узнаётся и у неё есть реплики игрока и ответы Алика', () => {
    for (const [k, t] of Object.entries(TOPICS)) {
      expect(t.p.length, k).toBeGreaterThanOrEqual(4)
      expect(t.a.length, k).toBeGreaterThanOrEqual(4)
    }
    const { game } = makeGame()
    const cases: Record<string, string> = {
      beton: 'Бетон обиделся.', niva: '«Нива» не заводится.', wedding: 'У Самвела свадьба.', bank: 'Банк на обеде.', ram: 'Баран заболел.',
      food: 'Ем хаш.', relative: 'Тётя приехала.', customs: 'Таможня не пропускает.', history: 'Это ещё Урарту решило.', cosmic: 'НАСА забрало деньги.',
    }
    for (const [k, text] of Object.entries(cases)) {
      game.alikMsg({ kind: 'text', from: 'alik', text, topical: true })
      expect(game.topicOfLast(), text).toBe(k)
    }
  })
  it('тема — только из последних реплик самого Алика после сообщения игрока', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся.', topical: true })
    game.push({ kind: 'text', from: 'me', text: 'Ясно.' })
    expect(game.topicOfLast()).toBeUndefined()
    game.alikMsg({ kind: 'text', from: 'alik', who: 'karine', text: 'Бетон, бетон…', topical: true })
    expect(game.topicOfLast()).toBeUndefined()
  })
  it('игроку предлагается реплика по теме, Алик отвечает из своего пула темы', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся и не застывает.', topical: true })
    let c
    for (let i = 0; i < 30 && !c; i++) c = fresh(game).find((x) => x.act === 'topic')
    expect(String(c!.arg)).toMatch(/^beton:\d$/)
    expect(TOPICS.beton.p.map(valueOf).some((p) => c!.text.includes(p.slice(0, 15)))).toBe(true)
    const from = game.S.msgs.length
    await game.send(c!)
    const said = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.from === 'alik').map((m) => (m.kind === 'text' ? m.text : ''))
    // ответ — парный именно этому вопросу
    const i = Number(String(c!.arg).split(':')[1])
    expect(said).toContain(TOPICS.beton.a[i])
  })
  it('третий вопрос про одну тему — Алик замечает (один раз)', async () => {
    const { game } = makeGame()
    const ask = async (i: number) => { const n = game.S.msgs.length; await game.fire('PlayerSays', { intent: 'topic', arg: `beton:${i}` }); return game.S.msgs.slice(n).map((m) => (m.kind === 'text' ? m.text : '')).join(' ') }
    await ask(0); await ask(1)
    expect(await ask(2)).toMatch(/бетон/)
    expect(game.S.mem['topic.beton']).toBe(0) // счётчик сброшен, тема заглушена на 20 дней
    expect(game.topicMuted('beton')).toBe(true)
    game.S.mem.topicRun = 0
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон опять не застывает.', topical: true })
    expect(game.topicOfLast()).toBeUndefined() // «больше не скажу» — и игроку не предлагается
    game.S.day += 20
    expect(game.topicOfLast()).toBe('beton')
    expect(TOPIC_OBSESSED.map(valueOf).some((t) => game.S.msgs.some((m) => m.kind === 'text' && m.text.includes(t.split('{n}')[1].slice(0, 12))))).toBe(true)
  })
  it('тема — только из отмазок, серий и ответов по теме, не из реакций на крик и извинения', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Прощаю. У нас с тобой как у меня с бетоном — ссоримся и миримся.' })
    expect(game.topicOfLast()).toBeUndefined()
  })
  it('конкретный вопрос — только если Алик это сказал: «Какой ещё ковчег?» не на археологов', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Нашли древний кувшин, приехали археологи.', topical: true })
    for (let i = 0; i < 40; i++) {
      const c = fresh(game).find((x) => x.act === 'topic')
      if (c) expect(c.text).not.toMatch(/ковчег|Урарту|Тигран/)
    }
  })
  it('грубые реплики с цитатой из отмазки закрыты rneed (#560): словарь цитат выводится из rneed, таблицы нет (#739)', () => {
    // Цитата без rneed звучит, будто Алик это говорил: «Хватит „перевод в пути“» без такой отмазки.
    // Корпус — кавычки и словарь цитат (а не ручная таблица CITED): слово, которое узнаёт rneed-регулярка.
    // У реплики с rneed словарь — свой, темы (свой гейт она уже объявила; «перевод» в history.r[4] — бытовое
    // слово, не цитата из банковской отмазки); у реплики без rneed — словарь всех тем: необъявленная цитата
    // любой темы в ней — находка. Факт-гейты (needs/gate) — своё условие на доске, а не на тексте — вне корпуса.
    const cited = (text: string, vocab: RegExp[]): string[] => [
      ...[...text.matchAll(/«([^»]+)»/g)].map((m) => m[1]),
      ...new Set(vocab.flatMap((re) => hits(text, re))),
    ]
    for (const [k, t] of Object.entries(TOPICS)) {
      t.r.forEach((entry, i) => {
        if (entry instanceof Gated) return
        const vocab = t.rneed?.[i] ? Object.values(t.rneed) : CITE_WORDS
        for (const c of cited(entry, vocab)) {
          if (NOT_A_CITE[`${k}.r[${i}]`]?.includes(c)) continue
          expect(t.rneed?.[i], `${k}.r[${i}] цитирует «${c}» без rneed`).toBeDefined()
          expect(t.rneed![i].test(c), `${k}.rneed[${i}] не узнаёт цитату «${c}»`).toBe(true)
        }
      })
    }
  })
  it('сверка узнаёт цитаты из отмазок — словарь не пуст и покрывает известные (#739)', () => {
    // Свидетели: сегодняшние цитаты (кавычки + слова) сверка обязана находить, иначе проверка выше пуста.
    const known: Array<[keyof typeof TOPICS, number, string]> = [
      ['bank', 4, 'перевод в пути'], ['history', 0, 'Урарту'], ['history', 3, 'Тигран'], ['history', 4, 'ковчег'],
    ]
    for (const [k, i, c] of known) {
      const text = valueOf(TOPICS[k].r[i])
      expect(text, `${k}.r[${i}] содержит цитату`).toContain(c)
      const found = [...text.matchAll(/«([^»]+)»/g)].map((m) => m[1]).concat(CITE_WORDS.flatMap((re) => hits(text, re)))
      expect(found.some((f) => f.includes(c) || c.includes(f)), `${k}.r[${i}]: сверка не находит «${c}»`).toBe(true)
    }
  })
  it('грубая цитата — только по сказанному: «перевод в пути» не на «Банк пусть капает» (#560)', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Банк пусть капает.', topical: true })
    expect(game.topicOfLast()).toBe('bank')
    for (let i = 0; i < 40; i++) {
      const c = fresh(game).find((x) => x.tone === 'rude')
      expect(c?.text ?? '').not.toMatch(/перевод в пути/)
    }
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Джан, я тебе отправил перевод. Банк спросил цель платежа.', topical: true })
    expect(game.topicOfLast()).toBe('bank')
    expect(offered(game, (c) => c.tone === 'rude' && /перевод в пути/.test(c.text))).toBe(true)
  })
  it('грубые цитаты истории — только по сказанному: Урарту, Тигран, ковчег (#560)', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Нашли древний кувшин, приехали археологи.', topical: true })
    expect(game.topicOfLast()).toBe('history')
    for (let i = 0; i < 40; i++) {
      const c = fresh(game).find((x) => x.tone === 'rude')
      expect(c?.text ?? '').not.toMatch(/Урарту|Тигран|ковчег/i)
    }
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Это ещё Урарту решило.', topical: true })
    expect(offered(game, (c) => c.tone === 'rude' && /Урарту/.test(c.text))).toBe(true)
  })
  it('дважды подряд про одну тему — третий раз не предлагается', async () => {
    const { game } = makeGame()
    for (const i of [0, 1]) await game.send({ text: 'q', tone: 'neutral', act: 'topic', arg: `food:${i}` })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Ем хаш.', topical: true })
    expect(game.topicOfLast()).toBeUndefined()
    await game.send({ text: 'Алик, привет', tone: 'polite' }) // другая реплика — серия прервалась
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Ем хаш.', topical: true })
    expect(game.topicOfLast()).toBe('food')
  })
  it('заглушенная ближайшая тема не проваливается к старой теме ленты (#564)', async () => {
    const { game } = makeGame()
    for (const i of [0, 1]) await game.send({ text: 'q', tone: 'neutral', act: 'topic', arg: `beton:${i}` })
    // ниже по ленте — реплика другой темы, ближайшая — бетон, но бетон исчерпан двумя вопросами
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Ем хаш.', topical: true })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон опять не застывает.', topical: true })
    expect(game.topicOfLast()).toBeUndefined()
    expect(offered(game, (c) => c.act === 'topic')).toBe(false)
    const foodRude = TOPICS.food.r.map(valueOf)
    expect(offered(game, (c) => c.tone === 'rude' && foodRude.includes(c.text))).toBe(false)
    await game.send({ text: 'Алик, привет', tone: 'polite' }) // серия вопросов прервалась — тема снова доступна
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон опять не застывает.', topical: true })
    expect(game.topicOfLast()).toBe('beton')
  })
  it('новая сцена сбрасывает старый контекст («что вы удалили?»)', async () => {
    const { game } = makeGame()
    game.S.ctx = { deleted: true }
    await game.enterNode('meet', game.scenes.meet.start)
    expect(game.S.ctx?.deleted).toBeUndefined()
  })
  it('слова Алика снимают «ответь на стикер»', async () => {
    const { game } = makeGame()
    game.S.ctx = { type: 'sticker' }
    expect(offered(game, (c) => c.act === 'stickerQ')).toBe(true)
    await game.say(['Все деньги ушли на свадьбу Бориса.'])
    expect(game.S.ctx?.type).toBeUndefined()
    expect(offered(game, (c) => c.act === 'stickerQ' || /стикер/i.test(c.text))).toBe(false)
  })
  it('ночью и вечером пятницы нейтральная реплика знает время', () => {
    const night = makeGame({ hour: 3 }).game
    let hit = false
    for (let i = 0; i < 20 && !hit; i++) hit = fresh(night).some((c) => c.tone === 'neutral' && P_NIGHT.some((p) => c.text.includes(p)))
    expect(hit).toBe(true)
  })
  it('клятвы и сроки — не тема: «Клянусь лавашом» не делает разговор про еду', () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'как бетон застынет', d: null })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Клянусь лавашом, как бетон застынет — всё отдам.', topical: true })
    expect(game.topicOfLast()).toBeUndefined()
  })
  it('клятва «хаш» внутри собранной отмазки не предлагает тему еды', async () => {
    const { game } = makeGame()
    let reasonHasFood = false
    const draw: DrawFn = (key, arr) => {
      if (key === 'LEGROLL') return 1 as never
      if (key === 'TPL') return valueOf(arr[2])
      if (key === 'OATH') return 'Чтоб мне хаш не есть' as never
      if (key === 'ABSURD' && reasonHasFood) return 'Телефон упал в хаш' as never
      return valueOf(arr[0])
    }
    game.X.excuse = make(draw).excuse
    await game.excuseTurn()
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.from === 'alik' && m.text.includes('Чтоб мне хаш не есть'))).toBe(true)
    expect(game.topicOfLast()).toBeUndefined()
    expect(offered(game, (c) => c.act === 'topic' && String(c.arg).startsWith('food:'))).toBe(false)
    reasonHasFood = true
    const foodGame = makeGame().game
    foodGame.X.excuse = make(draw).excuse
    await foodGame.excuseTurn()
    expect(foodGame.topicOfLast()).toBe('food')
  })
  it('срок целиком — не тема: «После обеда…» не предлагает поесть', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Санкции, брат. Против меня лично.', topical: true })
    game.recordPromise({ text: 'после обеда, но не сегодняшнего — рассчитаюсь до копейки', d: 1 })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'После обеда, но не сегодняшнего — рассчитаюсь до копейки.', topical: true })
    expect(game.topicOfLast()).toBe('customs')
    expect(offered(game, (c) => c.act === 'topic' && String(c.arg).startsWith('food:'))).toBe(false)
    expect(offered(game, (c) => /поесть\?|ЕШЬ МЕНЬШЕ|Приятного аппетита|Вы всё время едите/i.test(c.text))).toBe(false)
  })
  it('срок — не тема и при повторном вызове: шаблон срока кэширован, поиск не продолжается с прошлого места', () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'после обеда, но не сегодняшнего — рассчитаюсь до копейки', d: 1 })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'После обеда, но не сегодняшнего — рассчитаюсь до копейки.', topical: true })
    for (let i = 0; i < 3; i++) expect(game.topicOfLast(), `вызов ${i + 1}`).toBeUndefined()
  })
  it('поздравить — только если повод праздничный', () => {
    const { game } = makeGame()
    game.S.ctx = { rel: { n: 'тёща' } as never, festive: false }
    expect(offered(game, (c) => c.act === 'congrats')).toBe(false)
    game.S.ctx = { rel: { n: 'тёща' } as never, festive: true }
    expect(offered(game, (c) => c.act === 'congrats')).toBe(true)
  })
  it('реплика с требованием «Борис есть» не звучит до первой серии его сериала', () => {
    const { game } = makeGame()
    const pool = [needs('boris')('Передайте Борису привет.'), 'Все сыты.']
    for (let i = 0; i < 10; i++) expect(game.draw('T_BORIS', pool)).toBe('Все сыты.')
    game.S.arcs.boris = { i: 1, last: 0 }
    const seen = new Set<string>()
    for (let i = 0; i < 10; i++) seen.add(game.draw('T_BORIS', pool))
    expect(seen.size).toBe(2)
  })
  it('после серии сериала вопрос про сериал важнее темы', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Борис заболел. Съел смету.', topical: true })
    game.S.ctx = { arc: 'boris' }
    game.S.arcs.boris = { i: 2, last: game.S.day - 1 } // серия была вчера — сегодня по вопросу будет новая
    // вопрос про сериал — первым делом: пул follow мал, и окно повтора (#826) держит показанную
    // формулировку до конца хода — проверка порядка («важнее темы») от порядка проверок не зависит
    expect(offered(game, (c) => c.act === 'arc')).toBe(true)
    expect(offered(game, (c) => c.act === 'topic')).toBe(false)
  })
})

describe('«Мууу» и корова', () => {
  it('«Это корова?» — только сразу после «Мууу»; следующий ход — уже нет', async () => {
    const { game } = makeGame()
    const cow = (c: { tone: string; text: string }) => c.tone === 'cow' && D.P_COW.some((p: string) => c.text.includes(p.slice(0, 10)))
    expect(offered(game, cow)).toBe(false)
    game.moo()
    expect(offered(game, cow)).toBe(true)
    await game.send({ text: 'Алик, добрый день', tone: 'polite' })
    expect(offered(game, cow)).toBe(false)
  })
  it('новое «Мууу» не возвращает ту же коровью формулировку внутри окна повтора (#1291)', () => {
    // Пул приходит с каждым событием, а окно у «Мууу» своё — один ход. Окно события строку не держало:
    // партия 312117, «Алик, это у вас корова мычит?» на ходах 64→66 (остальные повторы — 314117/316117).
    // Пул долгоживущий: одна формулировка — не раньше окна повтора (#824), исчерпанный пул молчит.
    const { game } = makeGame({ seed: 5 })
    const shown: { t: string; at: number }[] = []
    for (let turn = 0; turn < 60; turn++) {
      game.S.stats.sent = turn
      game.moo()
      const c = (game.S.choices ?? []).find((x) => x.tone === 'cow')
      if (c) shown.push({ t: c.text, at: turn })
    }
    expect(shown.length, 'коровья кнопка ни разу не показана — проверка пустеет').toBeGreaterThan(D.P_COW.length)
    for (const s of shown) expect(D.P_COW, `строка вне пула: ${s.t}`).toContain(s.t)
    const last = new Map<string, number>()
    const bad: string[] = []
    for (const s of shown) {
      const prev = last.get(s.t)
      if (prev !== undefined && s.at - prev < 20) bad.push(`«${s.t}» ходы ${prev}→${s.at}`)
      last.set(s.t, s.at)
    }
    expect(bad.slice(0, 3), 'повтор строки пула внутри окна повтора').toEqual([])
    // и окно отпускает: за 60 ходов пул вернулся — иначе проверка выше доказывала бы только молчание
    expect(shown.length, 'за окном пул не вернулся — проверка пустеет').toBeGreaterThan(new Set(shown.map((s) => s.t)).size)
  })
  it('после «Нива выбрала тебя» нельзя продать «Ниву» Алика — она у игрока (#256)', () => {
    const { game } = makeGame()
    Object.assign(game.S.mem, { 'intro.niva': true, 'niva.away': false, 'niva.player': true, 'finale.niva': 'chose' })
    game.alikMsg({ kind: 'text', from: 'alik', text: '«Нива» у тебя сияет.', topical: true })
    expect(game.topicOfLast()).toBe('niva')
    const sell = /продать|Продай свою|Где сейчас «Нива»\? Я подъеду/i
    expect(offered(game, (c) => c.act === 'topic' && sell.test(c.text))).toBe(false)
    // без факта «у игрока» те же реплики открыты — иначе тест ничего не ловит
    delete game.S.mem['niva.player']
    game.S.choices = null
    expect(offered(game, (c) => c.act === 'topic' && sell.test(c.text))).toBe(true)
  })
  it('свадьба игрока: «А мне когда?» закрыта; «Ануш уже дома?» открыта (#256)', () => {
    const { game } = makeGame()
    game.S.mem['wedding.anush'] = true
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Свадьба — пятый день. Я уже не помню, чья.', topical: true })
    expect(game.topicOfLast()).toBe('wedding')
    // «Ануш» — первым делом: пул темы мал, и окно повтора (#826) держит показанный вопрос до конца хода
    expect(offered(game, (c) => /Ануш уже дома/.test(c.text))).toBe(true)
    expect(offered(game, (c) => /А мне когда\?|Меня позовёте/.test(c.text))).toBe(false)
  })
})

describe('общие реплики по стадии игры', () => {
  it('в блоке и в вежливом режиме — свои грубые реплики', () => {
    const { game } = makeGame()
    game.S.mem.blocked = true
    expect(P_RUDE_BLOCKED).toContain(fresh(game).find((c) => c.tone === 'rude')!.text)
    game.S.mem.blocked = false
    game.S.mem.polite = true
    expect(P_RUDE_POLITE).toContain(fresh(game).find((c) => c.tone === 'rude')!.text)
  })
})

describe('«соболезнования» — только от настоящей карточки банка (#970)', () => {
  it('фантомной карточки нет: списание вместо неё, и карточка повторяемая', () => {
    const { ask, answer } = DESPERATE_PAIRS.condolences
    expect(ask, 'банк не присылал соболезнований — такой карточки нет').not.toMatch(/прислал соболезнован/i)
    expect(ask, 'настоящее списание — карточка, которая есть в любой партии').toMatch(/списани/i)
    expect(answer).toMatch(/списани/i)
    const bank = NOTIF.filter((n) => n.app === 'Банк' && /списани/i.test(n.t))
    expect(bank.length, 'карточка «Списание» пропала — проверка пустеет').toBeGreaterThan(0)
    expect(bank.some((n) => n.repeat), 'без repeat она не «в любой партии»').toBe(true)
  })
})
