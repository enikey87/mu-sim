// «Займи 50» в эндгейме (docs/design/lend-50.md): просьба после вступления, три кнопки, честная ссылка.
// Деньги и долг не двигаются — это проверяет каждая ветка.
import { describe, it, expect } from 'vitest'
import { flush, makeGame, memStorage } from '../test/helpers'
import { valueOf } from '../engine/rules'
import { saidFriday } from './memkeys'
import type { Game } from '../engine/game'
import type { Msg } from '../engine/state'
import { uiOf, viewOf } from '../ui/view'
import {
  ENDGAME_CHOICES, ENDGAME_GROUP, ENDGAME_INTRO, ENDGAME_OPEN, EPILOGUE_BANNER, LEND50_ASK, LEND50_ASK_AGAIN, LEND50_LINK,
  LEND50_LOCKED, LEND50_NO, LEND50_NUNE, LEND50_RENAME, LEND50_SERIOUS, LEND50_SERIOUS_ELSE, LEND50_SYS, LEND50_YES,
} from './endgame'

const texts = (g: Game, from = 0) => g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
/** Карточка просьбы — отдельный вид сообщения, а не текст и не .sys (#616). */
const cards = (g: Game, from = 0) => g.S.msgs.slice(from).filter((m): m is Extract<Msg, { kind: 'lend50' }> => m.kind === 'lend50')
const atOf = (g: Game, pred: (m: Msg) => boolean, from = 0) => g.S.msgs.findIndex((m, i) => i >= from && pred(m))
/** Реплики Алика от начала просьбы до карточки: подводка, а не системные строки. */
const alikBeforeCard = (g: Game, from = 0) => {
  const at = atOf(g, (m) => m.kind === 'lend50', from)
  expect(at).toBeGreaterThan(0)
  const start = atOf(g, (m) => m.kind === 'text' && (m.text === LEND50_ASK[0] || m.text === LEND50_ASK_AGAIN[0]), from)
  expect(start).toBeGreaterThanOrEqual(0)
  return g.S.msgs.slice(start, at).flatMap((m) => (m.kind === 'text' ? [m.text] : []))
}
const sysTexts = (g: Game, from = 0) => g.S.msgs.slice(from).flatMap((m) => (m.kind === 'sys' ? [m.text] : []))

/** День выплаты закрыт — как игрок: экран итогов закрывает эндгейм. */
const enter = async (g: Game, outcome = 'default'): Promise<number> => {
  g.S.mem.payday = outcome
  g.S.ending = `payday_${outcome}`
  g.S.endings[`payday_${outcome}`] = g.S.day
  const from = g.S.msgs.length
  await g.closeEnding()
  await flush() // просьба идёт после паузы — цепочка дожидается
  return from
}
const pick = async (g: Game, act: string) => {
  const c = g.choices.find((x) => x.act === act)
  expect(c, act).toBeDefined()
  g.S.choices = null
  await g.send(c!)
}
const descOf = (g: Game, id: string) => viewOf(uiOf(g)).ach.find((a) => a.id === id)!.desc

describe('«Займи 50»', () => {
  it('просьба идёт за вступлением, подводка — ≤3 реплик, «Верну» последняя, карточка сразу за ней', async () => {
    const { game } = makeGame()
    const from = await enter(game)
    const t = texts(game, from)
    const intro = t.findIndex((x) => /Остаток выплачен|Французский оригинал|Деньги настоящие|Не хватает одной монеты/.test(x))
    const ask = t.indexOf('Брат. Слушай сюда. Только не смейся.')
    expect(ask).toBeGreaterThan(intro)
    const lead = alikBeforeCard(game)
    expect(lead.length).toBeLessThanOrEqual(3)
    expect(lead.length).toBeGreaterThan(0)
    expect(lead.at(-1)).toBe('Верну. Ты меня знаешь.')
    expect(lead).toEqual(['Брат. Слушай сюда. Только не смейся.', 'Займи 50 ₽.', 'Верну. Ты меня знаешь.'])
    expect(game.S.mem['lend50.asked']).toBe(true)
    // хвост просьбы — одна карточка вместо двух серых плашек .sys: фраза, сумма, ссылка-кнопка
    expect(cards(game, from)).toHaveLength(1)
    expect(cards(game, from)[0]).toMatchObject({ text: LEND50_SYS, link: LEND50_LINK })
    expect(t.at(-1)).toBe('Верну. Ты меня знаешь.')
    expect(sysTexts(game, from)).not.toContain(LEND50_SYS)
    expect(sysTexts(game, from)).not.toContain(LEND50_LINK)
    expect(game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
    // залитая кнопка ответа — только «Перевёл» (#616)
    expect(game.choices.filter((c) => c.primary).map((c) => c.act)).toEqual(['lend50Yes'])
  })
  it('вступление и формальности не перебиты: эпилог, группа и первая реплика вступления — до просьбы', async () => {
    const { game } = makeGame()
    const from = await enter(game)
    const t = texts(game, from)
    // «—— Эпилог ——» — первая строка вступления (#797), группа открывается сразу за ней
    expect(t[0]).toBe(EPILOGUE_BANNER)
    expect(t[1]).toMatch(/создал группу «ВЫПЛАТА ЗАКРЫТА/)
    expect(t[2]).toBe('Алик добавил вас')
    const ask = t.indexOf('Брат. Слушай сюда. Только не смейся.')
    expect(ask).toBeGreaterThan(t.indexOf('Алик добавил вас'))
    expect(ask).toBeGreaterThan(t.findIndex((x) => /Остаток выплачен|Французский оригинал|Деньги настоящие|Не хватает одной монеты/.test(x)))
  })
  it('вступление и просьба приходят цепочкой: системные строки разделены паузой, перед каждой репликой Алик печатает', async () => {
    const { game } = makeGame()
    const events: string[] = []
    const pausedAfter: string[] = []
    let count = game.S.msgs.length
    const sleep = game.sleep
    game.sleep = async (ms) => {
      const last = texts(game).at(-1)
      if (last) pausedAfter.push(last)
      await sleep(ms)
    }
    game.subscribe(() => {
      if (game.ui.typing === 'печатает…') events.push('typing')
      for (const m of game.S.msgs.slice(count)) {
        if (m.kind === 'text' || m.kind === 'sys') events.push(`msg:${m.text}`)
      }
      count = game.S.msgs.length
    })

    await enter(game)

    const created = `Алик создал группу «${ENDGAME_GROUP}»`
    expect(pausedAfter).toContain(created)
    const chain = [...ENDGAME_OPEN, ENDGAME_INTRO.default, ...LEND50_ASK]
    let previous = events.indexOf('msg:Алик добавил вас')
    for (const line of chain) {
      const message = events.indexOf(`msg:${line}`)
      expect(message, line).toBeGreaterThan(previous)
      expect(events.slice(previous + 1, message), line).toContain('typing')
      previous = message
    }
  })
  it('перезагрузка посреди вступления удаляет обрывок и воспроизводит полное вступление ровно один раз', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.S.mem.payday = 'default'
    game.S.mem['endgame.active'] = true
    game.S.mem['endgame.started'] = game.S.day
    game.sys(`Алик создал группу «${ENDGAME_GROUP}»`)
    game.alikMsg({ kind: 'text', from: 'alik', text: ENDGAME_OPEN[0] })
    game.save()

    const again = makeGame({ storage })
    await flush()
    const t = texts(again.game)
    const once = (line: string) => t.filter((x) => x === line).length
    expect(once(`Алик создал группу «${ENDGAME_GROUP}»`)).toBe(1)
    expect(once('Алик добавил вас')).toBe(1)
    expect(once(ENDGAME_OPEN[0])).toBe(1)
    expect(once(ENDGAME_INTRO.default)).toBe(1)
    expect(t.indexOf('Алик добавил вас')).toBeLessThan(t.indexOf(ENDGAME_OPEN[0]))
    expect(t.indexOf(ENDGAME_INTRO.default)).toBeLessThan(t.indexOf(LEND50_ASK[0]))
    expect(again.game.S.mem['lend50.asked']).toBe(true)
  })
  it('пока пауза и подводка — busy: ход игрока не вклинивается', async () => {
    const { game } = makeGame()
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const orig = game.sleep
    game.sleep = async (ms) => {
      if (ms === 1500) { await gate; return }
      return orig(ms)
    }
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    const done = game.closeEnding()
    await flush()
    expect(game.ui.busy).toBe(true)
    expect(game.S.mem['lend50.asked']).toBeUndefined()
    const before = game.S.msgs.length
    await game.send(ENDGAME_CHOICES[0])
    expect(game.S.msgs.length).toBe(before)
    release()
    await done
    await flush()
    expect(game.ui.busy).toBe(false)
    expect(game.S.mem['lend50.asked']).toBe(true)
    expect(game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
  })
  it('кнопки просьбы переживают «Мууу», простой и скрытие вкладки', async () => {
    const { game, clock } = makeGame()
    await enter(game)
    const acts = () => game.choices.map((c) => c.act)
    expect(acts()).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
    game.moo()
    expect(acts()).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
    game.S.choices = null
    expect(acts()).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
    await game.onVisibility(true)
    clock.advance(5 * 60_000)
    await game.onVisibility(false)
    expect(acts()).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
  })
  it('перезагрузка посреди просьбы доигрывает её: и реплики, и карточку', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    game.S.mem['endgame.active'] = true
    game.S.mem['endgame.started'] = game.S.day
    // сирота: одна реплика просьбы без карточки — как после закрытия вкладки посреди подводки
    game.S.msgs.push({ kind: 'text', from: 'alik', text: LEND50_ASK[0], id: game.S.nextId++, time: '12:00' })
    game.save()
    const again = makeGame({ storage })
    await flush()
    expect(again.game.S.mem['lend50.asked']).toBe(true)
    const t = texts(again.game)
    expect(t.filter((x) => x === LEND50_ASK[0]).length).toBe(1)
    expect(cards(again.game)).toHaveLength(1)
    expect(cards(again.game)[0]).toMatchObject({ text: LEND50_SYS, link: LEND50_LINK })
    expect(t.indexOf('Верну. Ты меня знаешь.')).toBeLessThan(atOf(again.game, (m) => m.kind === 'lend50'))
    expect(again.game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
  })
  it('обрыв на карточке без asked: карточка снимается и доигрывается ровно один раз (#616)', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    game.S.mem['endgame.active'] = true
    game.S.mem['endgame.started'] = game.S.day
    game.S.mem['endgame.intro'] = true
    game.S.msgs.push({ kind: 'text', from: 'alik', text: LEND50_ASK[0], id: game.S.nextId++, time: '12:00' })
    game.S.msgs.push({ kind: 'lend50', text: LEND50_SYS, link: LEND50_LINK, id: game.S.nextId++ })
    game.save()
    const { game: again } = makeGame({ storage })
    await flush()
    const t = texts(again)
    expect(t.filter((x) => x === LEND50_ASK[0]).length).toBe(1)
    expect(t).toContain('Верну. Ты меня знаешь.')
    expect(cards(again)).toHaveLength(1)
    expect(cards(again)[0]).toMatchObject({ text: LEND50_SYS, link: LEND50_LINK })
    expect(again.S.mem['lend50.asked']).toBe(true)
  })
  it('реплики просьбы без опечаток: текст «Верну» точный на многих сидах', async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { game } = makeGame({ seed, typos: true })
      await enter(game)
      expect(texts(game)).toContain('Верну. Ты меня знаешь.')
      expect(texts(game).some((x) => /Верн/.test(x) && x !== 'Верну. Ты меня знаешь.')).toBe(false)
    }
  })
  it('«Перевёл»: ответ, переименование группы, ачивка с описанием про портфель', async () => {
    const { game } = makeGame()
    await enter(game)
    const money = game.S.money
    const debt = game.S.debt
    const from = game.S.msgs.length
    await pick(game, 'lend50Yes')
    const t = texts(game, from)
    expect(t).toContain(LEND50_YES)
    expect(t).toContain(`Алик изменил название группы на «${LEND50_RENAME}»`)
    expect(game.S.mem['endgame.renames']).toBe(1)
    expect(game.S.mem['lend50.answer']).toBe('yes')
    expect(game.S.ach.lend50).toBeDefined()
    expect(descOf(game, 'lend50')).toMatch(/Одолжил Алику 50 ₽/)
    expect(t.join(' ')).not.toMatch(/Вам перевод|Возврат/) // перевод настоящий, и он не игровой
    expect([game.S.money, game.S.debt]).toEqual([money, debt])
    expect(cards(game)).toHaveLength(1) // карточка остаётся в ленте и второй раз не приходит
    expect(game.choices.map((c) => c.act)).toEqual(ENDGAME_CHOICES.map((c) => c.act))
  })
  it('«Не дам»: ответ, ачивка про первого человека, ни денег, ни переименования', async () => {
    const { game } = makeGame()
    await enter(game)
    const money = game.S.money
    const debt = game.S.debt
    const from = game.S.msgs.length
    await pick(game, 'lend50No')
    const t = texts(game, from)
    expect(t.some((x) => LEND50_NO.includes(x))).toBe(true)
    expect(t.join(' ')).not.toMatch(/изменил название группы/)
    expect(game.S.mem['endgame.renames']).toBe(0)
    expect(game.S.mem['lend50.answer']).toBe('no')
    expect(descOf(game, 'lend50')).toMatch(/Первый человек, у которого это получилось/)
    expect(t.join(' ')).not.toMatch(/Вам перевод|Возврат/)
    expect([game.S.money, game.S.debt]).toEqual([money, debt])
  })
  it('«Ты серьёзно?»: про пятницу только после обещания, иначе без чужой пятницы', async () => {
    const friday = 'Серьёзнее, чем про пятницу.'
    expect(valueOf(LEND50_SERIOUS)).toBe(friday)
    const { game } = makeGame()
    await enter(game)
    expect(game.choices.some((c) => c.act === 'lend50Serious' && c.text === 'Алик, ты серьёзно?')).toBe(true)
    const from = game.S.msgs.length
    await pick(game, 'lend50Serious')
    const before = texts(game, from)
    expect(before.join(' '), 'про пятницу до обещания').not.toMatch(/про пятницу/)
    expect(before).toContain(LEND50_SERIOUS_ELSE)
    expect(game.S.mem['lend50.answer']).toBe('serious')
    expect(descOf(game, 'lend50')).toMatch(/Спросил Алика, серьёзно ли он/)

    const { game: promised } = makeGame()
    await enter(promised)
    promised.S.mem[saidFriday] = true
    const fromP = promised.S.msgs.length
    await pick(promised, 'lend50Serious')
    const after = texts(promised, fromP)
    expect(after).toContain(friday)
    expect(after).not.toContain(LEND50_SERIOUS_ELSE)
  })
  it('до ответа описание нейтральное: ачивка ещё не получена', async () => {
    const { game } = makeGame()
    await enter(game)
    expect(game.S.ach.lend50).toBeUndefined()
    expect(descOf(game, 'lend50')).toBe(LEND50_LOCKED)
  })
  it('Нуне отвечает только знакомая: незнакомая — молчит, знакомая — по ведомости займ', async () => {
    const { game } = makeGame()
    await enter(game)
    const from = game.S.msgs.length
    await pick(game, 'lend50Yes')
    expect(texts(game, from)).not.toContain(LEND50_NUNE)
    const { game: g2 } = makeGame()
    Object.assign(g2.S.mem, { 'intro.nune': true, 'met.nune': true })
    await enter(g2)
    const f2 = g2.S.msgs.length
    await pick(g2, 'lend50Yes')
    expect(texts(g2, f2)).toContain(LEND50_NUNE)
  })
  it('вторая партия на том же устройстве просит другим текстом', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    await enter(game)
    expect(texts(game)).toContain('Брат. Слушай сюда. Только не смейся.')
    game.reset() // «Начать заново»: сохранение партии стёрто, отметка устройства — нет
    const { game: g2 } = makeGame({ storage })
    await enter(g2)
    const t = texts(g2)
    // #922: вторая просьба — явная заявка («займи 50, до четверга»), а не «опять я, опять 50»
    expect(t).toContain('Брат, займи 50. До четверга. Алик Воздухонесян, надёжный заёмщик, справки у мамы.')
    expect(t).not.toContain('Брат. Слушай сюда. Только не смейся.')
    expect(alikBeforeCard(g2).at(-1)).toBe('Верну. Ты меня знаешь.')
    expect(alikBeforeCard(g2).length).toBeLessThanOrEqual(3)
  })
  it('воспоминание требует фактов: без ответа молчит, после ответа звучит один раз', async () => {
    const { game } = makeGame()
    const mem = () => game.S.msgs.filter((m) => m.kind === 'text' && /50 давал/.test(m.text)).length
    await enter(game)
    await game.endgameFormality()
    expect(mem()).toBe(0)
    await pick(game, 'lend50No')
    await game.endgameFormality()
    expect(mem()).toBe(1)
    for (let i = 0; i < 3; i++) await game.endgameFormality()
    expect(mem()).toBe(1)
  })
  // негативный контроль #219: buildChoices без ветки asked снова стирает кнопки
  it('buildChoices отдаёт кнопки просьбы из факта asked, а не из залипшего S.choices', async () => {
    const { game } = makeGame()
    await enter(game)
    game.S.choices = ENDGAME_CHOICES.map((c) => ({ ...c })) // как после idle/away до фикса
    expect(game.buildChoices().map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
    game.S.choices = null
    expect(game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
  })

  it('возврат через 2 часа: просьба целиком до пачки непрочитанных (#248)', async () => {
    const storage = memStorage()
    const { game, clock } = makeGame({ storage })
    // незаконченная просьба в эндгейме + долгий уход — без готовой карточки из enter()
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    game.S.mem['endgame.active'] = true
    game.S.mem['endgame.started'] = game.S.day
    game.S.msgs.push({ kind: 'text', from: 'alik', text: LEND50_ASK[0], id: game.S.nextId++, time: '12:00' })
    game.S.stats.sent = 5
    game.S.lastSeen = clock.now() - 2 * 60 * 60 * 1000
    game.save()
    const { game: again } = makeGame({ storage, away: 120 })
    await flush()
    const t = texts(again)
    const ask0 = t.indexOf(LEND50_ASK[0])
    const cardAt = atOf(again, (m) => m.kind === 'lend50')
    const unreadAt = atOf(again, (m) => m.kind === 'sys' && /непрочитанные/.test(m.text))
    expect(ask0).toBeGreaterThanOrEqual(0)
    expect(again.S.msgs.slice(cardAt - 3, cardAt).flatMap((m) => (m.kind === 'text' ? [m.text] : []))).toEqual([...LEND50_ASK])
    expect(cards(again)).toHaveLength(1)
    expect(unreadAt).toBeGreaterThan(cardAt) // пачка away — строго после просьбы
  })

  it('формальности могут прийти при висящей просьбе — кнопки остаются (#321)', async () => {
    const { game } = makeGame()
    await enter(game)
    expect(game.S.mem['lend50.asked']).toBe(true)
    expect(game.S.mem['lend50.answer']).toBeUndefined()
    const before = game.choices.map((c) => c.act)
    expect(before).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
    game.awayMsg('formality')
    expect(game.S.mem['lend50.answer']).toBeUndefined()
    game.S.choices = null
    expect(game.choices.map((c) => c.act)).toEqual(before)
  })

  it('NC: без asked формальность не открывает кнопки займа (#321)', () => {
    const { game } = makeGame()
    game.S.mem['endgame.active'] = true
    game.S.mem['endgame.started'] = game.S.day
    game.S.choices = null
    expect(game.choices).toEqual([])
    game.awayMsg('formality')
    game.S.choices = null
    expect(game.choices).toEqual([])
  })

  it('на витрине карточки со ссылкой нет, в вебе она есть (#688)', async () => {
    const { game } = makeGame({ externalPay: false })
    const from = await enter(game)
    expect(cards(game, from)).toHaveLength(0)
    expect(JSON.stringify(game.S.msgs.slice(from))).not.toContain('donationalerts')
    expect(game.S.mem['lend50.asked']).toBe(true)
    expect(game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])

    const web = makeGame()
    const webFrom = await enter(web.game)
    expect(cards(web.game, webFrom)).toHaveLength(1)
    expect(cards(web.game, webFrom)[0]).toMatchObject({ text: LEND50_SYS, link: LEND50_LINK })
  })

  it('ответы Алика на кнопки без опечаток (#248)', async () => {
    const expectExact = (act: string, t: string[]) => {
      if (act === 'lend50Yes') expect(t).toContain(LEND50_YES)
      else if (act === 'lend50No') expect(LEND50_NO.some((x) => t.includes(x))).toBe(true)
      else expect(t).toContain(LEND50_SERIOUS_ELSE)
    }
    for (const act of ['lend50Yes', 'lend50No', 'lend50Serious'] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const { game } = makeGame({ seed, typos: true })
        await enter(game)
        const from = game.S.msgs.length
        await pick(game, act)
        expectExact(act, texts(game, from))
      }
    }
  })
})
