import { STARTS } from '../content/quests'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeGame, memStorage, alikTexts, flush, setMoney, cards } from '../test/helpers'
import { ENDGAME_FORMALITIES, ENDGAME_JUBILEES } from '../content/endgame'
import { silentAudio } from './audio'
import { manualClock, realClock } from './clock'
import { Game } from './game'
import { seededRng } from './rng'
import { SAVE_KEY } from './state'
import { fmtTime } from './time'
import { ARCS } from '../content/arcs'
import { CLAIMS } from '../content/lies'
import { COLD_WAR } from '../content/rude'
import { HEAT } from '../content/memkeys'
import { valueOf } from './rules'
import { MENTION_RE } from '../content/world'
import { P_MONEY, P_DESPERATE } from '../content/topics'

describe('Game: начало и ход', () => {
  it('новая игра: одна из завязок, 184-й день, 3–4 варианта реплик', () => {
    const { game } = makeGame()
    expect(game.S.msgs.map((m) => m.kind).slice(0, 5)).toEqual(['sep', 'text', 'text', 'sys', 'sep'])
    const first = game.S.msgs[1]
    expect(STARTS.some((s) => first.kind === 'text' && first.text === s.intro)).toBe(true)
    expect(game.S.day).toBe(184)
    expect(game.choices.length).toBeGreaterThanOrEqual(3)
    expect(game.choices.length).toBeLessThanOrEqual(4)
    expect(game.choices.some((c) => c.tone === 'rude')).toBe(true)
  })
  it('завязки разные: за десять новых игр — хотя бы четыре разных начала', () => {
    const intros = new Set<string>()
    for (let seed = 1; seed <= 10; seed++) { const m = makeGame({ seed }).game.S.msgs[1]; if (m.kind === 'text') intros.add(m.text) }
    expect(intros.size).toBeGreaterThanOrEqual(4)
  })
  it('вежливая реплика: Алик отвечает, счётчики и сохранение обновляются', async () => {
    const { game, storage } = makeGame()
    const polite = game.choices.find((c) => c.tone === 'polite')!
    const n = game.S.msgs.length
    await game.send(polite)
    const fresh = game.S.msgs.slice(n)
    expect(fresh[0]).toMatchObject({ kind: 'text', from: 'me', text: polite.text })
    expect(fresh.some((m) => 'from' in m && m.from === 'alik') || game.S.ctx?.type === 'reactOnly').toBe(true)
    expect(game.S.stats.sent).toBe(1)
    expect(game.S.ach.first).toBeDefined()
    expect(game.ui.busy).toBe(false)
    expect(JSON.parse(storage.data[SAVE_KEY]).stats.sent).toBe(1)
  })
  it('ход игрока всегда двигает календарь на 1–3 дня (после ответа и хора)', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { game } = makeGame({ seed })
      game.S.offlineDays = 0
      const day = game.S.day
      await game.send(game.choices.find((c) => c.tone === 'polite') ?? game.choices[0])
      expect(game.S.day - day, `seed ${seed}`).toBeGreaterThanOrEqual(1)
      expect(game.S.day - day, `seed ${seed}`).toBeLessThanOrEqual(3)
    }
  })
  it('возврат из пропажи: прыжок на offlineDays, без доп. +1…3', async () => {
    const { game } = makeGame({ seed: 2 })
    game.S.offlineDays = 4
    const day = game.S.day
    await game.send({ text: 'Где вы?', tone: 'neutral' })
    expect(game.S.offlineDays).toBe(0)
    expect(game.S.day).toBe(day + 4)
  })
  it('свой текст классифицируется по тону', () => {
    const { game } = makeGame()
    expect(game.classify('СКОЛЬКО МОЖНО ЖДАТЬ!!!')).toBe('rude')
    expect(game.classify('АЛИК!!!')).toBe('neutral')
    expect(game.classify('Я иду в СУД!!!')).toBe('threat')
    expect(game.classify('Это корова мычит?')).toBe('cow')
    expect(game.classify('Здравствуйте, извините')).toBe('polite')
    expect(game.classify('ну что там')).toBe('neutral')
  })
  it('ввод встраивается в правила: просьба — отмазка, извинение — примирение', async () => {
    const { game } = makeGame({ debug: true })
    await game.send('Алик, пожалуйста, переведите деньги')
    expect(game.ui.trace.some((entry) => entry.event === 'PlayerSays' && entry.chosen.includes('Says_request'))).toBe(true)
    expect(game.S.ctx).toMatchObject({ when: expect.any(String) })

    game.S.mem['rude.heat'] = 2
    await game.send('Извини, я погорячился')
    expect(game.S.mem['rude.heat']).toBe(1)
    expect(game.S.mem['count.sorry']).toBe(1)
  })
  it('угроза и грубая просьба из поля ввода двигают разные ветки', async () => {
    const { game } = makeGame({ debug: true })
    await game.send('Если не заплатишь, подам в суд')
    expect(game.S.mem.court).toBe(1)
    expect(game.S.mem['count.threat']).toBe(1)
    game.S.offlineDays = 0
    await game.send('ВЕРНИ ДЕНЬГИ!!!')
    expect(game.S.mem['count.rude']).toBe(1)
    expect(game.S.mem['rude.heat']).toBe(1)
    expect(game.ui.trace.some((entry) => entry.event === 'PlayerSays' && entry.chosen.some((n) => n.startsWith('Says_request')))).toBe(true)
  })
  it('насилие и запугивание из поля ввода не попадают в судебную ветку', async () => {
    const violence = makeGame().game
    await violence.send('Я тебя убью')
    expect(violence.S.mem['count.violence']).toBe(1)
    expect(violence.S.mem['rude.heat']).toBe(2)
    expect(violence.S.mem.court).toBeUndefined()

    const intimidation = makeGame().game
    await intimidation.send('Знаю, где ты живёшь')
    expect(intimidation.S.mem['count.intimidation']).toBe(1)
    expect(intimidation.S.mem['rude.heat']).toBe(1)
    expect(intimidation.S.mem.court).toBeUndefined()
  })
  it('отклик на отправку различает смысл, не показывая категорию', async () => {
    const vibes: Array<number | number[]> = []
    const audio = { ...silentAudio, vibrate: (p: number | number[]) => { vibes.push(p) } }
    const request = makeGame({ audio }).game
    await request.send('Алик, пожалуйста, переведите деньги')
    expect(request.ui.feel).toBeNull()
    expect(request.ui.feelId).toBe(0)

    const shout = makeGame({ audio }).game
    await shout.send('СКОЛЬКО МОЖНО ЖДАТЬ!!!')
    expect(shout.ui.feel).toBe('shake')
    expect(shout.ui.feelId).toBe(1)
    expect(vibes).toContainEqual([80, 40, 80])

    const benign = makeGame({ audio }).game
    await benign.send('АЛИК!!!')
    expect(benign.ui.feel).toBeNull()

    const scare = makeGame({ audio }).game
    await scare.send('Знаю, где ты живёшь')
    expect(scare.ui.feel).toBe('intimidate')
    expect(vibes).toContainEqual([120, 50, 120, 50, 200])

    const sorry = makeGame({ audio }).game
    await sorry.send('Извини, я погорячился')
    expect(sorry.ui.feel).toBe('sorry')

    const moo = makeGame({ audio }).game
    await moo.send('Мууу')
    expect(moo.ui.feel).toBe('moo')
    expect(moo.feelFor({ text: 'Мууууу 🐄', tone: 'neutral', act: 'moo' })).toBe('moo')
  })
  it('свой текст посреди сцены прерывает её и продолжает обычный цикл', async () => {
    const { game } = makeGame({ debug: true })
    await game.enterNode('toast', 'ask')
    expect(game.S.scene).not.toBeNull()
    await game.send('Когда вы оплатите долг?')
    expect(game.S.scene).toBeNull()
    expect(game.ui.trace.some((entry) => entry.chosen.includes('Says_request'))).toBe(true)
    expect(game.ui.busy).toBe(false)
  })
  it('пустое сообщение и повторная отправка во время ответа игнорируются', async () => {
    const { game } = makeGame()
    await game.send('   ')
    expect(game.S.stats.sent).toBe(0)
    const p = game.send('Алик, привет')
    await game.send('Второе')
    await p
    expect(game.S.stats.sent).toBe(1)
  })
  it('ход, упавший на правиле, отпускает busy: следующий ход принимается, кнопки возвращаются', async () => {
    const { game } = makeGame()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    game.rules.add({ name: 'Test_Boom', event: 'PlayerMessage', when: [], specificity: 99, respond: () => { throw new Error('boom') } })
    await game.send('Ну как там?')
    expect(errors).toHaveBeenCalledWith('[alik] ход прерван ошибкой', expect.anything())
    expect(game.ui.busy).toBe(false)
    expect(game.choices.length).toBeGreaterThan(0)
    const sent = game.S.stats.sent
    await game.send('Алло')
    expect(game.S.stats.sent).toBe(sent + 1)
    errors.mockRestore()
  })
  it('сломанная сцена не остаётся в состоянии: кнопки собираются, ход принимается', async () => {
    const { game } = makeGame()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    game.rules.add({ name: 'Test_BadScene', event: 'PlayerMessage', when: [], specificity: 99, respond: ({ game: g }) => { g.S.scene = { id: 'toast', node: 'нет такого узла', vars: {} }; throw new Error('boom') } })
    await game.send('Ну как там?')
    expect(game.S.scene).toBeNull()
    expect(() => game.choices).not.toThrow()
    expect(game.choices.length).toBeGreaterThan(0)
    const sent = game.S.stats.sent
    await game.send('Алло')
    expect(game.S.stats.sent).toBe(sent + 1)
    errors.mockRestore()
  })
  it('если кнопки не собираются вовсе — пустой список, а не падение при каждой отрисовке', async () => {
    const { game } = makeGame()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    game.rules.add({ name: 'Test_BadOffer', event: 'BuildChoices', when: [], specificity: 99, offer: () => { throw new Error('boom') } })
    game.rules.add({ name: 'Test_Boom2', event: 'PlayerMessage', when: [], specificity: 99, respond: () => { throw new Error('boom') } })
    await game.send('Ну как там?')
    expect(game.ui.busy).toBe(false)
    expect(game.choices).toEqual([])
    errors.mockRestore()
  })
  it('падение в «Алик пишет сам» тоже отпускает busy', async () => {
    const { game } = makeGame()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    game.S.stats.sent = 6
    game.rules.add({ name: 'Test_IdleBoom', event: 'AlikIdle', when: [], specificity: 99, respond: () => { throw new Error('boom') } })
    await game.onIdle()
    expect(errors).toHaveBeenCalledWith('[alik] ход прерван ошибкой', expect.anything())
    expect(game.ui.busy).toBe(false)
    expect(game.choices.length).toBeGreaterThan(0)
    errors.mockRestore()
  })
  it('реплики игрока не повторяются', async () => {
    const { game } = makeGame({ seed: 3 })
    // пул бедности на дне исчерпывается за партию и дальше звучит редко по кругу (#184): повторы там
    // разрешены осознанно, их темп сторожит тест «бедность не смолкает» ниже
    const poor = new Set([...P_MONEY.low.polite, ...P_MONEY.low.neutral, ...P_MONEY.bottom.polite, ...P_MONEY.bottom.neutral, ...P_DESPERATE.low, ...P_DESPERATE.bottom].map(valueOf))
    const mine: string[] = []
    for (let i = 0; i < 80; i++) {
      const c = game.choices.find((x) => x.tone === 'polite' && !x.act) ?? game.choices[0]
      // короткие кнопки сцен («Сбер», «Алик…») по замыслу не перефразируются — их не считаем
      if (!(c.scene && c.text.length <= 8) && !poor.has(c.text)) mine.push(c.text)
      game.S.offlineDays = 0
      await game.send(c)
      if (game.battery.dead) await game.battery.charge()
    }
    expect(new Set(mine).size).toBe(mine.length)
  })
  it('исчерпанный пул вопросов к сериалу не повторяет уже показанный вариант', () => {
    const { game } = makeGame()
    game.S.arcs.tile = { i: 2, last: 0 }
    game.S.ctx = { arc: 'tile' }
    const offered = new Set<string>()
    for (let i = 0; i < 6; i++) {
      const choice = game.buildChoices().find((item) => item.act === 'arc' && item.arg === 'tile')
      if (choice) {
        expect(offered.has(choice.text)).toBe(false)
        offered.add(choice.text)
      }
    }
    expect(offered.size).toBe(4)
  })
  it('терпение кончается — «полежал на полу»', async () => {
    const { game } = makeGame()
    game.S.patience = 1
    await game.send('Алик, привет')
    expect(game.S.patience).toBe(5)
    expect(game.S.ach.floor).toBeDefined()
  })
  it('после 25 сообщений у Алика аватарка-баран', async () => {
    const { game } = makeGame()
    game.S.stats.sent = 24
    await game.send('Алик, привет')
    expect(game.S.ram).toBe(true)
  })
})

describe('Game: допработа', () => {
  it('согласие — долг растёт, кнопки исчезают; отказ — настроение падает', async () => {
    const { game } = makeGame()
    await game.job()
    const job = game.S.msgs.findLast((m) => m.kind === 'job')!
    const debt = game.S.debt
    await game.answerJob(job.id, true)
    expect(game.S.debt).toBeGreaterThan(debt)
    expect(game.S.msgs.find((m) => m.id === job.id)).toMatchObject({ kind: 'job', answered: true })
    await game.answerJob(job.id, true) // повторно — ничего
    expect(game.S.ach.fence).toBeDefined()
    await game.job()
    const job2 = game.S.msgs.findLast((m) => m.kind === 'job')!
    const mood = game.S.mood
    await game.answerJob(job2.id, false)
    expect(game.S.mood).toBe(mood - 1)
  })
})

describe('Game: батарея', () => {
  it('разряд — «телефон сел», отправка блокируется; зарядка — пачка непрочитанных', async () => {
    const { game } = makeGame()
    game.S.battery = 1
    game.S.stats.sent = 3
    await game.send('Алик, привет')
    expect(game.battery.dead).toBe(true)
    expect(game.S.ach.dead).toBeDefined()
    expect(game.S.msgs.at(-1)).toMatchObject({ kind: 'sys', text: 'Не доставлено: у вас сел телефон.' })
    await game.send('ещё')
    expect(game.S.stats.sent).toBe(4)
    const n = game.S.msgs.length
    await game.battery.charge()
    expect(game.battery.dead).toBe(false)
    expect(game.ui.busy).toBe(false)
    expect(game.S.battery).toBe(100)
    expect(game.S.msgs.slice(n).some((m) => m.kind === 'sys' && m.unread)).toBe(true)
    expect(game.ui.unread).toBeGreaterThan(0)
    await game.send('Алик, привет')
    expect(game.ui.unread).toBe(0)
  })
  it('на 15% — уведомление о низком заряде', () => {
    const { game } = makeGame()
    game.S.battery = 16
    game.battery.drain(1)
    expect(game.ui.notif?.text).toMatch(/Низкий заряд/)
  })
})

describe('Game: возвращение после паузы', () => {
  it('долгое отсутствие — непрочитанные, счётчик в заголовке, телефон заряжен', async () => {
    const storage = memStorage()
    const clock = manualClock()
    const g1 = new Game({ storage, clock, rng: seededRng(1), noTimers: true, hour: 14 })
    g1.S.stats.sent = 5
    g1.S.battery = 40
    g1.save()
    clock.advance(3 * 3600_000)
    const g2 = new Game({ storage, clock, rng: seededRng(2), noTimers: true, hour: 14 })
    await flush()
    expect(g2.ui.unread).toBeGreaterThan(0)
    expect(g2.ui.title).toMatch(/^\(\d\)/)
    expect(g2.S.battery).toBe(100)
    expect(g2.S.ach.away).toBeDefined()
  })
  it('«который час» в реплике — настоящий час переписки, а не зашитый', async () => {
    const { game } = makeGame({ hour: 2 })
    game.S.clock = 2 * 60 + 5
    const n = game.S.msgs.length
    await game.say(['{Night}, брат…'])
    expect(game.S.msgs.slice(n).map((m) => (m.kind === 'text' ? m.text : '')).join(' ')).toContain('Два часа ночи')
    game.S.clock = 3 * 60 + 40
    const n2 = game.S.msgs.length
    await game.say(['{night}, брат…'])
    expect(game.S.msgs.slice(n2).map((m) => (m.kind === 'text' ? m.text : '')).join(' ')).toContain('три часа ночи')
  })
  it('непрочитанные пришли до «сейчас»: время суток в репликах совпадает с часами переписки', async () => {
    const { game } = makeGame({ hour: 2 })
    await game.awayBurst(5, 1)
    const now = fmtTime(game.S.clock)
    expect(now.startsWith('02:')).toBe(true)
    expect(game.S.msgs.slice(-5).every((m) => m.time! <= now)).toBe(true)
    expect(game.period()).toBe('night')
    game.tick(9 * 60) // переписка дошла до 11 утра — уже не «почему не спишь»
    expect(game.period()).toBe('day')
  })
  it('короткая пауза и новая игра — без непрочитанных', () => {
    const { game } = makeGame({ away: 5 })
    expect(game.ui.unread).toBe(0)
  })
  it('скрытая вкладка 3+ минуты — пачка сообщений', async () => {
    const { game, clock } = makeGame()
    game.S.stats.sent = 2
    await game.onVisibility(true)
    clock.advance(5 * 60_000)
    await game.onVisibility(false)
    expect(game.ui.unread).toBeGreaterThan(0)
  })
})

describe('Game: пачка непрочитанных подчиняется миру', () => {
  /** То, что пришло: без разделителя дня и системных строк смены яруса — заголовок пачки и сообщения Алика. */
  const arrived = (game: Game, from: number) => game.S.msgs.slice(from).filter((m) => (m.kind === 'sys' ? m.unread : m.kind !== 'sep'))
  /** Тем же путём, что игрок: телефон сел, зарядили — пришла пачка. */
  const charged = async (setup: (g: Game) => void, seed: number) => {
    const { game } = makeGame({ seed })
    game.S.stats.sent = 6
    setup(game)
    game.battery.die()
    const from = game.S.msgs.length
    const debt = game.S.debt
    await game.battery.charge()
    return { game, msgs: arrived(game, from), debt }
  }
  it('обычный день — как раньше: заголовок, счётчик по числу пришедших, привычные виды', async () => {
    const kinds = new Set<string>()
    for (let seed = 1; seed <= 20; seed++) {
      const { game, msgs } = await charged(() => {}, seed)
      expect(msgs[0]).toMatchObject({ kind: 'sys', unread: true, text: 'Пока телефон заряжался — непрочитанные сообщения' })
      const body = msgs.slice(1)
      expect(body.length).toBeGreaterThanOrEqual(2)
      expect(game.ui.unread).toBe(body.length)
      expect(game.ui.title).toBe(`(${body.length}) Алик, где деньги?`)
      for (const m of body) kinds.add(m.kind)
    }
    expect([...kinds].sort()).toEqual(['fwd', 'sticker', 'text', 'transfer', 'voice'])
  })
  it('Алик умер — после зарядки от него ничего: ни заголовка, ни счётчика, долг прежний', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { game, msgs, debt } = await charged((g) => { g.S.mem.alik_dead = true }, seed)
      expect(msgs).toEqual([])
      expect(game.ui.unread).toBe(0)
      expect(game.S.debt).toBe(debt)
    }
  })
  it('Алик умер — возвращение после паузы тоже молчит', async () => {
    const storage = memStorage()
    const clock = manualClock()
    const g1 = new Game({ storage, clock, rng: seededRng(1), noTimers: true, hour: 14 })
    g1.S.stats.sent = 5
    g1.S.mem.alik_dead = true
    g1.save()
    clock.advance(3 * 3600_000)
    const g2 = new Game({ storage, clock, rng: seededRng(2), noTimers: true, hour: 14 })
    await flush()
    expect(g2.ui.unread).toBe(0)
    expect(g2.S.msgs.filter((m) => m.kind === 'sys' && m.unread)).toEqual([])
    expect(g2.S.msgs.filter((m) => m.kind !== 'sep' && m.kind !== 'sys').length).toBe(g1.S.msgs.filter((m) => m.kind !== 'sep' && m.kind !== 'sys').length)
  })
  it('выплата закрыта — в пачке только закрывающие акты, долг не меняется', async () => {
    const acts = new Set([...ENDGAME_FORMALITIES, ...Object.values(ENDGAME_JUBILEES)])
    let seen = 0
    for (let seed = 1; seed <= 30; seed++) {
      const { game, msgs, debt } = await charged((g) => { g.S.mem['endgame.active'] = true }, seed)
      const body = msgs.filter((m) => m.kind !== 'sys')
      expect(body.length).toBeGreaterThan(0)
      for (const m of body) expect(m.kind === 'text' && acts.has(m.text), JSON.stringify(m)).toBe(true)
      expect(game.S.debt).toBe(debt)
      expect(game.S.mem['endgame.forms']).toBe(body.length)
      seen += body.length
    }
    expect(seen).toBeGreaterThan(60)
  })
  it.each([['заблокировал', 'blocked'], ['телефон у Карине', 'phone.karine']])('%s — пачки нет', async (_, key) => {
    for (let seed = 1; seed <= 10; seed++) {
      const { game, msgs, debt } = await charged((g) => { g.S.mem[key] = true }, seed)
      expect(msgs).toEqual([])
      expect(game.ui.unread).toBe(0)
      expect(game.S.debt).toBe(debt)
    }
  })
  it('пропал — пачки нет', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { game, msgs } = await charged((g) => { g.S.offlineDays = 2 }, seed)
      expect(msgs).toEqual([])
      expect(game.ui.unread).toBe(0)
    }
  })
  // issue #188: путь игрока — первая грубость ставит «был давно» и ctx.offended; Away_ColdWar не перебивает Away_Offline
  it('после первой грубости пропавший Алик в пачке «пока тебя не было» молчит', async () => {
    const pool = new Set(COLD_WAR.map(valueOf))
    for (let seed = 1; seed <= 30; seed++) {
      const { game, clock } = makeGame({ seed })
      game.S.stats.sent = 6
      await game.send({ text: 'Ты вор и мошенник!!!', tone: 'rude' })
      expect(game.S.offlineDays).toBeGreaterThan(0)
      expect(game.S.ctx?.offended).toBe(true)
      const from = game.S.msgs.length
      await game.onVisibility(true)
      clock.advance(40 * 60_000)
      await game.onVisibility(false)
      const body = arrived(game, from)
      expect(body, `seed ${seed}`).toEqual([])
      expect(game.ui.unread).toBe(0)
      expect(body.some((m) => m.kind === 'text' && pool.has(m.text))).toBe(false)
    }
  })
  it('исход Дня выплаты определён, экран не закрыт: за ним тишина — ни пачки, ни простоя, ни обещаний, ни переводов', async () => {
    const { game, clock } = makeGame()
    // третий акт как в payday.test: партия с финалами, чтобы Beat_Payday и утро выплаты сложились
    game.S.day = 340
    Object.assign(game.S.mem, { 'finale.nune': 'default', 'finale.niva': 'chose', 'finale.boris': 'brigadir', 'met.samvel': true, 'met.karine': true, 'met.boris': true })
    Object.assign(game.S.arcs, { nune: { i: 6, last: 0 }, niva: { i: 7, last: 0 }, boris: { i: 10, last: 0 } })
    Object.assign(game.S.ach, { q_goat: 1, court: 1, q_hash: 1 })
    const choose = async (go: string) => { game.S.choices = null; const c = game.choices.find((x) => x.go === go); expect(c, go).toBeDefined(); await game.send(c!) }
    await game.enterNode('payday', 'announce')
    await choose('witness'); await choose('share'); await choose('catch')
    await game.fire('CheckEnding')
    expect(game.S.ending).toBe('payday_coins')
    expect(game.S.mem['endgame.active']).toBeUndefined()
    const from = game.S.msgs.length
    const [promises, debt, money] = [game.S.promises.length, game.S.debt, game.S.money]
    await game.onVisibility(true)
    clock.advance(40 * 60_000)
    await game.onVisibility(false)
    await game.onIdle()
    game.recordPromise({ text: 'завтра', d: 1 })
    game.nextDay(1)
    await game.afterTurn()
    expect(arrived(game, from)).toEqual([])
    expect(game.ui.unread).toBe(0)
    expect([game.S.promises.length, game.S.debt, game.S.money]).toEqual([promises + 1, debt, money])
    expect(game.S.ending).toBe('payday_coins')
    // без Quiet болтовня нашлась бы: обида + тепло → Idle/Away_ColdWar; срок обещания уже записан выше
    game.S.mem[HEAT] = 1
    game.S.ctx = { offended: true }
    game.S.offlineDays = 0
    // каждое Quiet_PaydayOpen_* глушит своё событие, пока экран концовки открыт (#259)
    for (const event of ['AlikAway', 'AlikIdle', 'StoryBeat', 'PeriodLine', 'PromiseDue', 'Mentioned'] as const) {
      const n = game.S.msgs.length
      expect((await game.fire(event))?.name, event).toBe('Quiet_PaydayOpen_' + event)
      expect(game.S.msgs.slice(n), event).toEqual([])
    }
    await game.closeEnding()
    expect(game.S.mem['endgame.active']).toBe(true)
  })
  it('обиженный Алик на связи: в пачке максимум одна колкость холодной войны, остальное — тишина', async () => {
    const pool = new Set(COLD_WAR.map(valueOf))
    const offendedPack = async (seed: number, n: number) => {
      const { game } = makeGame({ seed })
      game.S.stats.sent = 6
      game.S.mem[HEAT] = 1
      game.S.ctx = { offended: true }
      expect(game.S.offlineDays).toBe(0)
      const from = game.S.msgs.length
      await game.awayBurst(n, 1)
      const body = arrived(game, from).filter((m) => m.kind !== 'sys')
      expect(body.length).toBeLessThanOrEqual(1)
      for (const m of body) expect(m.kind === 'text' && pool.has(m.text), JSON.stringify(m)).toBe(true)
      return body.length
    }
    let jabs = 0
    for (let seed = 1; seed <= 20; seed++) jabs += await offendedPack(seed, 4)
    expect(jabs).toBeGreaterThan(0)
    // шанс колкости 0,7 — на пачке из одного сообщения тишина тоже случается
    let silent = 0
    for (let seed = 1; seed <= 30; seed++) silent += (await offendedPack(seed, 1)) === 0 ? 1 : 0
    expect(silent).toBeGreaterThan(0)
  })
  // негативный контроль #188: без ne(offline) Away_ColdWar снова перебивает пропажу
  it('Away_ColdWar не берёт AlikAway, пока Алик пропал', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { game } = makeGame({ seed })
      game.S.stats.sent = 6
      game.S.mem[HEAT] = 1
      game.S.ctx = { offended: true }
      game.S.offlineDays = 2
      expect(game.facts().offline).toBe(true)
      const r = game.rules.match({ event: 'AlikAway', facts: {} }, game.facts())
      expect(r?.name, `seed ${seed}`).not.toBe('Away_ColdWar')
      expect(['Away_Offline', 'Quiet_Offended_AlikAway']).toContain(r?.name)
    }
  })
  // #259: Idle_ColdWar — тот же гейт offline; путь игрока — onIdle после грубости
  it('после первой грубости пропавший Алик в простое не пишет холодную войну', async () => {
    const pool = new Set(COLD_WAR.map(valueOf))
    for (let seed = 1; seed <= 30; seed++) {
      const { game } = makeGame({ seed })
      game.S.stats.sent = 6
      await game.send({ text: 'Ты вор и мошенник!!!', tone: 'rude' })
      expect(game.S.offlineDays).toBeGreaterThan(0)
      expect(game.S.ctx?.offended).toBe(true)
      expect(game.facts().offline).toBe(true)
      const idle = game.rules.match({ event: 'AlikIdle', facts: {} }, game.facts())
      expect(idle?.name, `seed ${seed}`).not.toBe('Idle_ColdWar')
      const from = game.S.msgs.length
      await game.onIdle()
      const body = arrived(game, from)
      expect(body.some((m) => m.kind === 'text' && pool.has(m.text)), `seed ${seed}`).toBe(false)
    }
  })
  it('посреди сцены пачки нет — как и болтовни простоя; сцена продолжается', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { game, msgs } = await charged((g) => { g.S.scene = { id: 'deathbed', node: 'ask', vars: {} } }, seed)
      expect(msgs).toEqual([])
      expect(game.S.scene?.id).toBe('deathbed')
    }
  })
})

describe('Game: Алик пишет сам (таймеры)', () => {
  it('молчание игрока → Алик пишет первым: не в начале игры, не раньше 1,5 минут, не больше двух раз подряд', async () => {
    const clock = manualClock()
    const delays: number[] = []
    const set = clock.setTimeout.bind(clock)
    clock.setTimeout = (fn, ms) => { delays.push(ms); return set(fn, ms) }
    const game = new Game({ storage: memStorage(), clock, rng: seededRng(4), hour: 14 })
    const idle = () => delays.filter((d) => d >= 90000)
    game.armIdle()
    expect(idle()).toEqual([]) // первые 5 сообщений игрока — Алик сам не пишет
    game.S.stats.sent = 5
    let acted = 0
    for (let i = 0; i < 4; i++) {
      const before = game.S.msgs.length
      clock.runTimers()
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      if (game.S.msgs.length > before || game.ui.notif) acted++
      if (i === 0) game.armIdle()
    }
    expect(acted).toBeGreaterThan(0)
    expect(idle().length).toBe(2) // две попытки, потом ждёт игрока
    expect(Math.min(...idle())).toBeGreaterThanOrEqual(90000)
    game.dispose()
  })
  it('status «печатает…» и прочие статусы меняются сами', () => {
    const clock = manualClock()
    const game = new Game({ storage: memStorage(), clock, rng: seededRng(4), hour: 3 })
    expect(game.ui.status.text).toMatch(/был\(а\) в 03:/)
    game.dispose()
  })
})

describe('Game: сохранение', () => {
  it('перезагрузка продолжает игру и помнит показанные реплики', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage, seed: 8 })
    for (let i = 0; i < 15; i++) { game.S.offlineDays = 0; await game.send(game.choices[0]) ; if (game.battery.dead) await game.battery.charge() }
    const texts = alikTexts(game.S.msgs)
    const again = new Game({ storage, clock: manualClock(), rng: seededRng(8), noTimers: true, hour: 14 })
    expect(again.S.stats.sent).toBe(game.S.stats.sent)
    for (let i = 0; i < 15; i++) { again.S.offlineDays = 0; await again.send(again.choices[0]); if (again.battery.dead) await again.battery.charge() }
    const newTexts = alikTexts(again.S.msgs).slice(texts.length)
    for (const t of newTexts) if (!/^\*|\*$|автозамена|Телефон новый|^Не «/.test(t)) expect(texts).not.toContain(t)
  })
  it('сброс удаляет сохранение и больше не пишет его', () => {
    const { game, storage } = makeGame()
    game.save()
    expect(storage.data[SAVE_KEY]).toBeDefined()
    game.reset()
    game.save()
    expect(storage.data[SAVE_KEY]).toBeUndefined()
  })
  it('без storage игра работает', async () => {
    const game = new Game({ storage: null, clock: manualClock(), rng: seededRng(1), noTimers: true })
    await game.send('Алик, привет')
    expect(game.S.stats.sent).toBe(1)
  })
})

describe('Game: сцены целиком', () => {
  // свежая партия на узел: в одной партии сцены успевают познакомить игрока со всеми, и дыра в разметке не видна
  it('каждый узел каждой сцены проходится без ошибок в нетронутом мире', async () => {
    let visited = 0
    for (const [sid, sc] of Object.entries(makeGame({ seed: 11 }).game.scenes)) {
      for (const nid of Object.keys(sc.nodes)) {
        const { game } = makeGame({ seed: 11 })
        game.S.scene = null
        game.S.offlineDays = 0
        await game.enterNode(sid, sc.start) // инициализировать переменные сцены
        await game.enterNode(sid, nid)
        visited++
        if (game.S.scene) {
          const cs = game.buildChoices()
          expect(cs.length, `${sid}.${nid}`).toBeGreaterThan(0)
          for (const c of cs) expect(c.text, `${sid}.${nid}`).toMatch(/\S/)
        }
        expect(JSON.stringify(game.S.msgs), `${sid}.${nid}`).not.toMatch(/undefined|NaN/)
      }
    }
    expect(visited).toBeGreaterThan(80)
  })
  it('выбор в сцене ведёт по ветке; «null» закрывает сцену', async () => {
    const { game } = makeGame({ seed: 2 })
    await game.enterNode('toast', 'ask')
    const mom = game.buildChoices().find((c) => c.go === 'mom')!
    await game.send(mom)
    expect(game.S.ach.toast).toBeDefined()
    expect(game.S.scene).toBeNull()
  })
  it('акт взаимозачёта уменьшает долг ровно на сумму акта', async () => {
    const { game } = makeGame({ seed: 2 })
    const debt = game.S.debt
    await game.enterNode('invoice', 'ask')
    const doc = game.S.msgs.findLast((m) => m.kind === 'doc')!
    expect(doc.kind === 'doc' && debt - game.S.debt).toBe(doc.kind === 'doc' ? doc.total : -1)
  })
})

describe('Game: сериалы', () => {
  it('каждый сериал проигрывается до конца и даёт ачивку', async () => {
    const { game } = makeGame({ seed: 6 })
    for (const [id, a] of Object.entries(ARCS)) {
      for (let i = 0; i < a.eps.length; i++) await game.playArc(id)
      expect(game.S.arcs[id].i).toBe(a.eps.length)
      expect(game.S.ach[a.eps[a.eps.length - 1].fx!.ach!]).toBeDefined()
    }
    expect(game.availableArcs()).toEqual([])
  })
  it('поздние сериалы не начинаются раньше своего дня; серия не чаще раза в 6 дней', () => {
    const { game } = makeGame()
    expect(game.availableArcs()).not.toContain('alik_death')
    game.S.day = 300
    expect(game.availableArcs()).toContain('alik_death')
    game.S.arcs.boris = { i: 1, last: 298 }
    expect(game.availableArcs()).not.toContain('boris')
  })
})

describe('Game: мелочи', () => {
  it('касание разблокирует звук, не запуская таймер фоновых шумов', () => {
    const clock = manualClock()
    let unlocks = 0
    const audio = { ...silentAudio, unlock: () => { unlocks++ } }
    const game = new Game({ storage: memStorage(), clock, rng: seededRng(1), audio })
    const pending = clock.pending()

    game.gesture()
    game.gesture()

    expect(unlocks).toBe(2)
    expect(clock.pending()).toBe(pending)
    game.dispose()
  })
  it('эскалация отмазок объявляется в чате', () => {
    const { game } = makeGame()
    game.nextDay(70)
    expect(game.S.tier).toBe(1)
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /международный/.test(m.text))).toBe(true)
  })
  it('правка обещания меняет срок и в журнале', async () => {
    const { game } = makeGame()
    const m = game.push({ kind: 'text', from: 'alik', text: 'В среду утром — всё отдам.' })
    game.recordPromise({ text: 'в среду утром — всё отдам', d: 3 })
    await game.editLast(m, { text: 'в среду утром — всё отдам', t: 'в среду утром', d: 3 })
    const edited = game.S.msgs.find((x) => x.id === m.id)
    expect(edited?.kind === 'text' && edited.edited).toBe(true)
    expect(edited?.kind === 'text' && edited.text).not.toMatch(/среду утром/)
    expect(game.S.promises.at(-1)!.due).toBeNull()
  })
  it('«Мууу» появляется и исчезает, звук отключается', () => {
    const clock = manualClock()
    const game = new Game({ storage: memStorage(), clock, rng: seededRng(1), noTimers: true })
    game.moo()
    expect(game.ui.moos).toHaveLength(1)
    clock.runTimers()
    expect(game.ui.moos).toHaveLength(0)
    game.toggleMute()
    expect(game.S.muted).toBe(true)
  })
  it('голосовое: застолье, голос Алика или корова', () => {
    const { game } = makeGame()
    const v = game.push({ kind: 'voice', from: 'alik', len: 12 })
    for (let i = 0; i < 10; i++) game.playVoice(v)
    expect(game.S.stats.moo).toBeGreaterThan(0)
  })
  it('подписка React получает изменения', () => {
    const { game } = makeGame()
    let n = 0
    const off = game.subscribe(() => n++)
    game.sys('x')
    off()
    game.sys('y')
    expect(n).toBe(1)
  })
})

describe('Game: dispose отменяет async', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('dispose в покое идемпотентен и обнуляет таймеры', () => {
    const clock = manualClock()
    const game = new Game({ storage: memStorage(), clock, rng: seededRng(1), hour: 14 })
    game.S.stats.sent = 5
    game.armIdle()
    expect(game.pendingTimers()).toBeGreaterThan(0)
    game.dispose()
    expect(game.pendingTimers()).toBe(0)
    expect(clock.pending()).toBe(0)
    game.dispose()
    expect(game.pendingTimers()).toBe(0)
  })

  it('dispose во время send: нет emit/save/audio после отмены', async () => {
    vi.useFakeTimers()
    let saves = 0
    const storage = memStorage()
    const setItem = storage.setItem.bind(storage)
    storage.setItem = (k, v) => { saves++; setItem(k, v) }
    let beeps = 0
    const audio = { ...silentAudio, beep: () => { beeps++ }, vibrate: () => { beeps++ }, moo: () => { beeps++ } }
    const game = new Game({ storage, clock: realClock(), rng: seededRng(1), noTimers: true, hour: 14, audio })
    saves = 0
    beeps = 0
    let emits = 0
    game.subscribe(() => emits++)

    const turn = game.send('Алик, верни деньги')
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    const msgsAtDispose = game.S.msgs.length
    const emitsBefore = emits
    const savesBefore = saves
    game.dispose()
    expect(game.pendingTimers()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    await turn
    await vi.runAllTimersAsync()

    expect(emits).toBe(emitsBefore)
    expect(saves).toBe(savesBefore)
    expect(beeps).toBe(0)
    expect(game.S.msgs.length).toBe(msgsAtDispose)
  })

  it('отложенное Мууу не срабатывает после dispose', () => {
    const clock = manualClock()
    let moos = 0
    const audio = { ...silentAudio, moo: () => { moos++ } }
    const game = new Game({ storage: memStorage(), clock, rng: seededRng(1), noTimers: true, hour: 14, audio })
    game.moo()
    expect(game.ui.moos).toHaveLength(1)
    expect(moos).toBe(1)
    game.dispose()
    clock.runTimers()
    expect(game.ui.moos).toHaveLength(1)
    expect(moos).toBe(1)
    expect(game.pendingTimers()).toBe(0)
  })

  it('dispose во время зарядки останавливает последовательность', async () => {
    vi.useFakeTimers()
    const game = new Game({ storage: memStorage(), clock: realClock(), rng: seededRng(1), noTimers: true, hour: 14 })
    game.battery.die()
    const charge = game.battery.charge()
    expect(game.battery.charging).toBe(1)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    game.dispose()
    expect(game.pendingTimers()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    await charge
    expect(game.battery.charging).toBe(1)
    expect(game.battery.dead).toBe(true)
  })

  it('гонка: callback начался → dispose → следующий await без эффектов', async () => {
    vi.useFakeTimers()
    let emits = 0
    const game = new Game({ storage: memStorage(), clock: realClock(), rng: seededRng(1), noTimers: true, hour: 14 })
    game.subscribe(() => emits++)
    const turn = game.send('Алик, привет')
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    // один шаг typingFor — затем dispose до следующей паузы
    await vi.advanceTimersToNextTimerAsync()
    const emitsAfterFirst = emits
    game.dispose()
    expect(vi.getTimerCount()).toBe(0)
    await turn
    expect(emits).toBe(emitsAfterFirst)
    expect(game.pendingTimers()).toBe(0)
  })

  it('новая игра после dispose работает независимо', async () => {
    const storage = memStorage()
    const old = new Game({ storage, clock: manualClock(), rng: seededRng(1), noTimers: true, hour: 14 })
    old.dispose()
    const next = new Game({ storage, clock: manualClock(), rng: seededRng(2), noTimers: true, hour: 14 })
    await next.send('Алик, верните деньги')
    expect(next.S.stats.sent).toBe(1)
    expect(next.S.msgs.some((m) => m.kind === 'text' && m.from === 'me')).toBe(true)
  })

  it('dispose внутри say/typingFor отменяет физический sleep-таймер', async () => {
    vi.useFakeTimers()
    const game = new Game({ storage: memStorage(), clock: realClock(), rng: seededRng(1), noTimers: true, hour: 14 })
    const before = game.S.msgs.length
    const pending = game.say(['Позднее сообщение'])
    expect(vi.getTimerCount()).toBe(1)
    game.dispose()
    expect(game.pendingTimers()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    await expect(pending).rejects.toMatchObject({ name: 'GameDisposed' })
    expect(game.S.msgs.length).toBe(before)
  })

  it('audio.dispose отменяет отложенный callback после playVoice', async () => {
    vi.useFakeTimers()
    let moos = 0
    const pending = new Set<ReturnType<typeof setTimeout>>()
    const audio = {
      ...silentAudio,
      dispose() {
        for (const id of pending) clearTimeout(id)
        pending.clear()
      },
      moo: () => { moos++ },
      alikVoice(_pick?: (a: readonly string[]) => string) {
        const id = setTimeout(() => { pending.delete(id); audio.moo() }, 2500)
        pending.add(id)
      },
    }
    const game = new Game({ storage: memStorage(), clock: manualClock(), rng: seededRng(1), noTimers: true, hour: 14, audio })
    audio.alikVoice()
    game.dispose()
    await vi.advanceTimersByTimeAsync(3000)
    expect(moos).toBe(0)
    expect(pending.size).toBe(0)
  })
})

describe('Game: пачка непрочитанных записывает в мир то же, что обычное сообщение Алика', () => {
  /** Пачка из одних отмазок — тем же путём (правило AlikAway → awayMsg), но с заявлениями в каждом сообщении. */
  const excusePack = async (seed: number) => {
    const { game } = makeGame({ seed })
    game.S.stats.sent = 6
    game.rules.add({ name: 'Test_AwayExcuse', event: 'AlikAway', when: [], specificity: 50, respond: ({ game }) => game.awayMsg('excuse') })
    const from = game.S.msgs.length
    await game.awayBurst(4, 1)
    return { game, texts: alikTexts(game.S.msgs.slice(from)) }
  }
  it('заявление из пачки — на доске: «вы же говорили» видит и то, что пришло без игрока', async () => {
    let claims = 0
    for (let seed = 1; seed <= 40; seed++) {
      const { game, texts } = await excusePack(seed)
      for (const c of CLAIMS.filter((c) => texts.some((t) => c.re.test(t)))) {
        claims++
        expect(game.S.mem[`said.${c.key}`], c.key).toBe(game.S.day)
        expect(game.S.mem[`by.${c.key}`], c.key).toBe('alik')
      }
    }
    expect(claims).toBeGreaterThan(5)
  })
  it('день речи Алика — день пачки: после неё он не «молчал»', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { game } = await excusePack(seed)
      expect(game.S.mem['alik.day']).toBe(game.S.day)
      expect(game.facts().sinceAlik).toBe(0)
    }
  })
  it('упомянутый в пачке вклинивается после следующего ответа Алика — как после обычного упоминания', async () => {
    let mentioned = 0
    for (let seed = 1; seed <= 60; seed++) {
      const { game, texts } = await excusePack(seed)
      const who = Object.entries(MENTION_RE).filter(([, re]) => texts.some((t) => re.test(t))).map(([w]) => w)
      if (!who.length) continue
      const events: string[] = []
      game.rules.tracer = (t) => { events.push(`${t.event}:${t.target ?? ''}`) }
      await game.afterTurn()
      // хор — не больше одного персонажа за ход: прозвучавшие — непустое подмножество упомянутых
      const heard = events.filter((e) => e.startsWith('Mentioned:')).map((e) => e.slice('Mentioned:'.length))
      expect(heard.length, texts.join(' | ')).toBeGreaterThan(0)
      for (const w of heard) expect(who).toContain(w)
      mentioned++
    }
    expect(mentioned).toBeGreaterThan(0)
  })
})

describe('Game: деньги на карте', () => {
  it('adjustMoney: строка сводки, карточки уровня и факты; баннера нет (#287)', () => {
    const { game } = makeGame()
    setMoney(game, 12400) // уровень «мало»/«дно» проверяем от фиксированного баланса, а не от стартового
    expect(game.moneyLevel()).toBe('normal')
    expect(game.facts().moneyNormal).toBe(true)
    expect(game.adjustMoney(-4000, 'Продукты')).toBe(true)
    expect(game.S.money).toBe(8400)
    expect(game.moneyLevel()).toBe('low')
    expect(game.S.bank?.lines['-Продукты']).toEqual({ sum: 4000, n: 1 })
    expect(cards(game, 'Банк').map((c) => c.text)).toEqual([`Банк обеспокоен остатком: ${(8400).toLocaleString('ru-RU')} ₽. Рекомендуем не ждать Алика.`])
    expect(game.adjustMoney(-3000, 'Гречка')).toBe(true)
    expect(game.moneyLevel()).toBe('bottom')
    expect(game.facts().moneyBottom).toBe(true)
    expect(game.S.mem['credit.offer']).toBe(true)
    // «критический» и предложение — одна карточка: причина рядом с кредитом
    expect(cards(game, 'Банк').at(-1)?.text).toMatch(/^Остаток критический: 5\s400 ₽ после «Гречка»\. Вам одобрен/)
    expect(cards(game, 'Банк')).toHaveLength(2)
    expect(game.ui.notif).toBeNull()
  })
  it('дно без ступени лестницы: «критический» отдельной карточкой, дальше мама', () => {
    const { game } = makeGame()
    game.S.mem['credit.broke'] = true
    setMoney(game, 7000)
    game.adjustMoney(-6000, 'Гречка')
    expect(cards(game).map((c) => c.app)).toEqual(['Банк', 'Мама'])
    expect(cards(game, 'Банк')[0].text).toMatch(/^Остаток критический/)
  })
  it('баннер — только батарея и непрочитанные; банк, мама, Авито — карточки в ленте (#287)', () => {
    const { game } = makeGame()
    for (const [icon, app] of [['🏦', 'Банк'], ['🏦', 'МФО'], ['👩', 'Мама'], ['🛒', 'Авито']]) game.notify(icon, app, `${app}: текст`)
    expect(game.ui.notif).toBeNull()
    expect(cards(game).map((c) => c.app)).toEqual(['Банк', 'МФО', 'Мама', 'Авито'])
    game.S.battery = 16
    game.battery.drain(1)
    game.notify('💬', 'Алик Воздухонесян', '3 новых сообщения')
    const shown: string[] = []
    while (game.ui.notif) { shown.push(game.ui.notif.text); game.dismissNotif() }
    expect(shown).toEqual(['Низкий заряд батареи: 15%', '3 новых сообщения'])
    expect(cards(game)).toHaveLength(4)
  })
  it('очередь баннеров: предел — самое старое уходит (#272)', () => {
    const { game } = makeGame()
    const texts = ['раз', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь']
    for (const t of texts) game.notify('💬', 'Алик Воздухонесян', t)
    const shown: string[] = []
    while (game.ui.notif) { shown.push(game.ui.notif.text); game.dismissNotif() }
    expect(shown).toHaveLength(1 + Game.NOTIF_QUEUE_MAX)
    expect(shown).toEqual(['раз', 'четыре', 'пять', 'шесть', 'семь'])
  })
  it('бедность не смолкает: исчерпанный пул уровня звучит редко и по кругу (#184)', () => {
    const { game } = makeGame()
    setMoney(game, 1000)
    const at = (day: number): string | null => { game.S.day = day; return game.poorLine('P_DESPERATE_bottom', P_DESPERATE.bottom) }
    const fresh = [at(300), at(300), at(300), at(300)]
    expect(new Set(fresh).size).toBe(4) // весь пул уровня — без повторов
    const fallback = at(300)
    expect(fallback).not.toBeNull() // исчерпанный пул не молчит
    expect(at(301)).toBe(fallback) // внутри окна строка та же
    expect(at(300 + 14)).not.toBe(fallback) // следующее окно — другая строка
    expect(at(300 + 56)).toBe(fallback) // через полный круг — снова она: не чаще, чем раз в 14 дней
  })
  it('после выплаты и в эндгейме деньги не меняются', () => {
    const { game } = makeGame()
    game.S.mem.payday = 'default'
    expect(game.moneySealed()).toBe(true)
    const m = game.S.money
    expect(game.adjustMoney(-100, 'Продукты')).toBe(false)
    expect(game.S.money).toBe(m)
    delete game.S.mem.payday
    game.S.mem['endgame.active'] = true
    expect(game.adjustMoney(50, 'Перевод от Алика')).toBe(false)
    expect(game.S.money).toBe(m)
  })
  // одна точка записи денег — страж engine/money.test.ts: тип (readonly) + разбор исходников

  it('трата с карты без денег: отказ не молчит — строка «Не прошло» в сводке недели (#185/#287)', () => {
    const { game } = makeGame()
    setMoney(game, 50) // меньше самой мелкой траты (90) — отказ гарантирован
    const refusals = (): number => game.S.bank?.lines['!По мелочи']?.n ?? 0
    for (let i = 0; i < 200 && !refusals(); i++) game.randomNotif()
    expect(refusals(), 'пул NOTIF не выдал ни одной траты — проверка была бы пустой').toBeGreaterThan(0)
    expect(game.S.money).toBe(50)
    game.nextDay(7)
    game.flushBankWeek()
    expect(cards(game, 'Банк').at(-1)?.lines).toContainEqual(expect.stringMatching(/^Не прошло: По мелочи \d+ ₽/))
  })

  it('«займи 5000» без денег: долг не растёт, «Инвестор» не выдаётся, банк отказывает (#185)', async () => {
    const { game } = makeGame()
    setMoney(game, 1000)
    const debt = game.S.debt
    await game.enterNode('lend', 'yes')
    expect(game.S.debt).toBe(debt)
    expect(game.S.ach.lend).toBeUndefined()
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /Вы перевели Алику/.test(m.text))).toBe(false)
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.from === 'alik' && /святой|Вот это брат/i.test(m.text))).toBe(false)
    expect(cards(game, 'Банк').at(-1)?.text).toMatch(/^Не прошло/)

    // те же деньги есть — перевод идёт, и всё, что он обещает, случается
    const { game: paid } = makeGame()
    setMoney(paid, 20000)
    const before = paid.S.debt
    await paid.enterNode('lend', 'yes')
    expect(paid.S.debt).toBe(before + 5000)
    expect(paid.S.money).toBe(15000)
    expect(paid.S.ach.lend).toBe(paid.S.day) // unlock пишет день, а не «выдано»
    expect(paid.S.msgs.some((m) => m.kind === 'sys' && /Вы перевели Алику/.test(m.text))).toBe(true)
    expect(paid.S.msgs.some((m) => m.kind === 'text' && m.from === 'alik' && /святой|Вот это брат/i.test(m.text))).toBe(true)
  })

  it('после выплаты отказ в списании молчит: ни «недостаточно», ни мелочь (#252)', async () => {
    const { game } = makeGame()
    setMoney(game, 50_000)
    game.S.mem.payday = 'default'
    expect(game.moneySealed()).toBe(true)
    await game.enterNode('lend', 'yes')
    expect(cards(game, 'Банк')).toEqual([])
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.from === 'alik' && /святой/i.test(m.text))).toBe(false)
    for (let i = 0; i < 100; i++) game.randomNotif()
    expect(game.S.bank?.lines['!По мелочи']).toBeUndefined()
  })

  it('NC: без seal «займи» без денег пишет недостаточно (#252)', async () => {
    const { game } = makeGame()
    setMoney(game, 100)
    await game.enterNode('lend', 'yes')
    expect(cards(game, 'Банк').at(-1)?.text).toMatch(/недостаточно средств/)
  })
})

