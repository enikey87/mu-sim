// «Займи 50» в эндгейме (docs/design/lend-50.md): просьба после вступления, три кнопки, честная ссылка.
// Деньги и долг не двигаются — это проверяет каждая ветка.
import { describe, it, expect } from 'vitest'
import { flush, makeGame, memStorage } from '../test/helpers'
import type { Game } from '../engine/game'
import { uiOf, viewOf } from '../ui/view'
import {
  ENDGAME_CHOICES, LEND50_ASK, LEND50_ASK_AGAIN, LEND50_LINK, LEND50_LOCKED, LEND50_NO, LEND50_NUNE,
  LEND50_RENAME, LEND50_SERIOUS, LEND50_SYS, LEND50_YES,
} from './endgame'

const texts = (g: Game, from = 0) => g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
const alikBeforeSys = (t: string[]) => {
  const sys = t.indexOf(LEND50_SYS)
  expect(sys).toBeGreaterThan(0)
  const start = t.findIndex((y) => y === LEND50_ASK[0] || y === LEND50_ASK_AGAIN[0])
  expect(start).toBeGreaterThanOrEqual(0)
  return t.slice(start, sys)
}

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
  it('просьба идёт за вступлением, подводка — ≤3 реплик, «Верну» последняя, системное сразу за ней', async () => {
    const { game } = makeGame()
    const from = await enter(game)
    const t = texts(game, from)
    const intro = t.findIndex((x) => /Остаток выплачен|Французский оригинал|Деньги настоящие|Не хватает одной монеты/.test(x))
    const ask = t.indexOf('Брат. Слушай сюда. Только не смейся.')
    expect(ask).toBeGreaterThan(intro)
    const lead = alikBeforeSys(t)
    expect(lead.length).toBeLessThanOrEqual(3)
    expect(lead.length).toBeGreaterThan(0)
    expect(lead.at(-1)).toBe('Верну. Ты меня знаешь.')
    expect(lead).toEqual(['Брат. Слушай сюда. Только не смейся.', 'Займи 50 ₽.', 'Верну. Ты меня знаешь.'])
    expect(game.S.mem['lend50.asked']).toBe(true)
    expect(t.slice(-2)).toEqual([LEND50_SYS, LEND50_LINK])
    expect(game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
  })
  it('вступление и формальности не перебиты: группа и первая реплика вступления — до просьбы', async () => {
    const { game } = makeGame()
    const from = await enter(game)
    const t = texts(game, from)
    expect(t[0]).toMatch(/создал группу «ВЫПЛАТА ЗАКРЫТА/)
    expect(t[1]).toBe('Алик добавил вас')
    const ask = t.indexOf('Брат. Слушай сюда. Только не смейся.')
    expect(ask).toBeGreaterThan(t.indexOf('Алик добавил вас'))
    expect(ask).toBeGreaterThan(t.findIndex((x) => /Остаток выплачен|Французский оригинал|Деньги настоящие|Не хватает одной монеты/.test(x)))
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
  it('перезагрузка посреди просьбы доигрывает её: и реплики, и системная пометка', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    game.S.mem['endgame.active'] = true
    game.S.mem['endgame.started'] = game.S.day
    // сирота: одна реплика просьбы без SYS — как после закрытия вкладки посреди подводки
    game.S.msgs.push({ kind: 'text', from: 'alik', text: LEND50_ASK[0], id: game.S.nextId++, time: '12:00' })
    game.save()
    const again = makeGame({ storage })
    await flush()
    expect(again.game.S.mem['lend50.asked']).toBe(true)
    const t = texts(again.game)
    expect(t.filter((x) => x === LEND50_ASK[0]).length).toBe(1)
    expect(t).toContain(LEND50_SYS)
    expect(t).toContain(LEND50_LINK)
    expect(t.indexOf('Верну. Ты меня знаешь.')).toBeLessThan(t.indexOf(LEND50_SYS))
    expect(again.game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
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
  it('«Ты серьёзно?»: ответ и своё описание ачивки', async () => {
    const { game } = makeGame()
    await enter(game)
    const from = game.S.msgs.length
    await pick(game, 'lend50Serious')
    expect(texts(game, from)).toContain(LEND50_SERIOUS)
    expect(game.S.mem['lend50.answer']).toBe('serious')
    expect(descOf(game, 'lend50')).toMatch(/Спросил Алика, серьёзно ли он/)
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
    expect(t).toContain('Опять я. Опять 50. Это уже традиция, брат.')
    expect(t).not.toContain('Брат. Слушай сюда. Только не смейся.')
    expect(alikBeforeSys(t).at(-1)).toBe('Верну. Ты меня знаешь.')
    expect(alikBeforeSys(t).length).toBeLessThanOrEqual(3)
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
    // незаконченная просьба в эндгейме + долгий уход — без готового SYS из enter()
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
    const link = t.indexOf(LEND50_LINK)
    const unread = t.findIndex((x) => /непрочитанные/.test(x))
    expect(ask0).toBeGreaterThanOrEqual(0)
    expect(link).toBe(ask0 + 4) // ASK×3 + SYS + LINK
    expect(t.slice(ask0, link + 1)).toEqual([...LEND50_ASK, LEND50_SYS, LEND50_LINK])
    expect(unread).toBeGreaterThan(link) // пачка away — строго после просьбы
  })

  it('NC: checkAway до просьбы ставит формальность раньше (#248)', async () => {
    // механизм: void checkAway до deliver → первый AlikAway успевает до yield, просьба встаёт в середину
    // этот тест зелёный на фиксе; регресс ловит прогон с переставленным порядком в game.ts
    const storage = memStorage()
    const { game, clock } = makeGame({ storage })
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
    const unread = t.findIndex((x) => /непрочитанные/.test(x))
    expect(unread).toBeGreaterThan(ask0)
    expect(t.slice(ask0, ask0 + 5)).toEqual([...LEND50_ASK, LEND50_SYS, LEND50_LINK])
  })

  it('ответы Алика на кнопки без опечаток (#248)', async () => {
    const expectExact = (act: string, t: string[]) => {
      if (act === 'lend50Yes') expect(t).toContain(LEND50_YES)
      else if (act === 'lend50No') expect(LEND50_NO.some((x) => t.includes(x))).toBe(true)
      else expect(t).toContain(LEND50_SERIOUS)
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
