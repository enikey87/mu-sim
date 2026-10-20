// Ставка «сбрею усы» (docs/design/moustache.md): запись в журнале, исполнение в срок, факт ~40 дней.
import { describe, it, expect, vi } from 'vitest'
import { makeGame, respondCtx } from '../test/helpers'
import { spec, valueOf, isOpen, set, type Line } from './fact'
import { lineId } from '../engine/rules/lines'
import { OATH_FORMS } from './misc'
import { WORLD, meet, MOUSTACHE_PHOTO_B, PROMISE_MET, PROMISE_SHAVE, PROMISE_SHAVE_ASK, PROMISE_SHAVE_KEPT } from './world'
import { alikDead, alikShaved, endgame, moustacheKept, moustachePhotoAt, nuneKeyPassed, saidMoneyMoustache } from './memkeys'
import { P_MOUSTACHE, P_MOUSTACHE_PHOTO } from './rules/player-choice-pools'
import { D, low } from './excuses'
import { promiseRules } from './rules/world'
import type { Entry } from './fact'
import type { Game } from '../engine/game'

const sys = (g: ReturnType<typeof makeGame>['game'], from: number) =>
  g.S.msgs.slice(from).flatMap((m) => (m.kind === 'sys' ? [m.text] : []))
const alik = (g: ReturnType<typeof makeGame>['game'], from: number) =>
  g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
const oathOpen = (g: ReturnType<typeof makeGame>['game']) =>
  g.lines.eligible('OATH_FORMS', OATH_FORMS, g.lineFacts()).some((p) => p.id === 'oath_stake_moustache')
const oathUsamiOpen = (g: ReturnType<typeof makeGame>['game']) =>
  g.lines.eligible('OATH', D.OATH as Entry<string>[], g.lineFacts()).some((p) => /своими усами/.test(p.text))
const stakeForm = () => OATH_FORMS.map(spec).find((s) => s.id === 'oath_stake_moustache')!

describe('ставка «усы»', () => {
  it('сорванный срок: фото без усов, alik.shaved, ачивка; клятвы усами молчат', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'завтра — всё отдам', d: 1, stake: 'moustache' })
    expect(game.S.promises[0].stake).toBe('moustache')
    game.S.day += 1
    const from = game.S.msgs.length
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).toBe('Due_StakeShave')
    expect(sys(game, from)).toContain('Алик Воздухонесян сменил фото профиля. На фото — Алик без усов.')
    expect(alik(game, from).join(' ').toLowerCase()).toContain('ус')
    expect(alik(game, from).some((t) => /, С[А-Я]/.test(t))).toBe(false)
    expect(game.S.mem[alikShaved]).toBe(true)
    expect(game.S.ach.shaved).toBeDefined()
    expect(game.holds(WORLD.moustache)).toBe(false)
    expect(oathOpen(game)).toBe(false)
    expect(oathUsamiOpen(game)).toBe(false)
  })

  it('смена фото без усов открывает окно отклика: кнопка на ходу события, ответ его потребляет (#1013)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'завтра — всё отдам', d: 1, stake: 'moustache' })
    game.S.day += 1
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'moustachePhoto') }
    const has = () => Boolean(button())
    const fromPool = (t: string) => P_MOUSTACHE_PHOTO.map(valueOf).some((p) => {
      const low = p.charAt(0).toLowerCase() + p.slice(1)
      return t.includes(p) || t.includes(low)
    })
    expect(has(), 'до события кнопки нет').toBe(false)
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).toBe('Due_StakeShave')
    expect(sys(game, 0).join(' '), 'событие не прозвучало — проверка пустеет').toContain('На фото — Алик без усов')
    const at = Number(game.S.mem[moustachePhotoAt])
    expect(at, 'событие не штампануло ход').toBe(game.S.stats.sent)
    expect(button(), 'на ходу события кнопки нет').toBeDefined()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(); if (b) texts.add(b.text) }
    expect([...texts].length, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(fromPool(t), `кнопка не из пула окна ` + t).toBe(true)
    game.S.stats.sent = at + 3
    expect(has(), 'третий ход после события — ещё окно').toBe(true)
    game.S.stats.sent = at + 4
    expect(has(), 'вне окна — кнопки нет').toBe(false)
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'moustachePhoto' })
    const said = alik(game, n)
    const poolLines = MOUSTACHE_PHOTO_B.map((e) => { const v = valueOf(e); return typeof v === 'string' ? v : v.t })
    expect(said.some((t) => poolLines.some((p) => t.includes(p))), 'ответ не из пула события: ' + said.join(' | ')).toBe(true)
    expect(game.S.mem[moustachePhotoAt], 'ответ не потребил окно').toBeUndefined()
    expect(has(), 'после ответа окно закрыто').toBe(false)
  })

  it('вопрос «Ставка сыграла?» открывается, только когда Алик назвал ставку (#1029)', async () => {
    const { game } = makeGame()
    game.S.mood = 3
    game.recordPromise({ text: 'завтра — всё отдам', d: 1, stake: 'moustache' })
    game.S.day += 1
    const stakeQuestion = () => { game.S.choices = null; return game.buildChoices().some((c) => c.act === 'moustachePhoto' && /ставк/i.test(c.text)) }
    // строка сбривания, называющая ставку, в этой партии ещё не звучала: событие приходит без слова «ставка»
    game.lines.mark(lineId('DUE_SHAVE', 'Карине довольна: усы сбриты. Ты — тоже, надеюсь. Денег по-прежнему нет, но ставка сыграла.'))
    expect(game.holds(WORLD.stakeSaid), 'ставка сказана до события — проверка пустеет').toBe(false)
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).toBe('Due_StakeShave')
    expect(stakeQuestion(), 'на ходу события вопрос про ставку ссылается на невведённое слово').toBe(false)
    // Алик называет ставку настоящим ответом на «как усы?» (окно фото ещё живо: ход события и три после)
    for (let i = 0; i < 8 && !game.holds(WORLD.stakeSaid); i++) await game.fire('PlayerSays', { intent: 'moustacheAsk' })
    expect(game.holds(WORLD.stakeSaid), 'Алик так и не назвал ставку за восемь ответов — проверка пустеет').toBe(true)
    expect(stakeQuestion(), 'после слова «ставка» вопроса в блоке нет').toBe(true)
  })

  it('ответ окна, называющий ставку, ставит факт сам (#1029)', async () => {
    const { game } = makeGame()
    game.S.mood = 3
    game.recordPromise({ text: 'завтра — всё отдам', d: 1, stake: 'moustache' })
    game.S.day += 1
    // строки-объявители события уже сказаны: в окне остаётся только ответ, называющий ставку
    game.lines.mark(lineId('DUE_SHAVE', 'Карине довольна: усы сбриты. Ты — тоже, надеюсь. Денег по-прежнему нет, но ставка сыграла.'))
    for (const t of ['Без усов я тот же Алик, только честнее выгляжу. В банке меня теперь не узнают — это плюс.', 'Карине нравится. Мне тоже. Денег это, правда, не добавило.', 'Сбрил сам, никто не заставлял. Слово Алика — закон, усы — нет.']) {
      game.lines.mark(lineId('MOUSTACHE_PHOTO_B', t))
    }
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).toBe('Due_StakeShave')
    expect(game.holds(WORLD.stakeSaid), 'ставка сказана до ответа — проверка пустеет').toBe(false)
    await game.fire('PlayerSays', { intent: 'moustachePhoto' })
    expect(alik(game, 0).join(' '), 'ответ окна не назвал ставку — проверка пустеет').toContain('ставкой')
    expect(game.holds(WORLD.stakeSaid), 'строка-объявитель не поставила факт').toBe(true)
  })

  it('~40 дней спустя усы снова «на месте»', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    await game.fire('PromiseDue', { promise: 0 })
    const shavedAt = game.S.day
    expect(game.S.mem[alikShaved]).toBe(true)
    game.S.day = shavedAt + 40
    game.rules.settle()
    expect(game.S.mem[alikShaved]).toBeUndefined()
    expect(game.holds(WORLD.moustache)).toBe(true)
    expect(oathOpen(game)).toBe(true)
  })

  it('«когда-нибудь» ставку не исполняет', async () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'когда-нибудь', d: null, stake: 'moustache' })
    game.S.day += 5
    expect(game.facts({ promise: 0 }).promiseLive).toBe(false)
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).not.toBe('Due_StakeShave')
    expect(game.S.mem[alikShaved]).toBeUndefined()
  })

  it('сдержал слово — усы спасены, перевод 50', async () => {
    let saved = false
    for (let seed = 1; seed <= 40 && !saved; seed++) {
      const { game } = makeGame({ seed })
      game.S.mood = 9
      game.recordPromise({ text: 'послезавтра — переведу', d: 2, stake: 'moustache' })
      game.S.day += 2
      const from = game.S.msgs.length
      const rule = await game.fire('PromiseDue', { promise: 0 })
      if (rule?.name === 'Due_StakeKept') {
        expect(game.S.msgs.slice(from).some((m) => m.kind === 'transfer')).toBe(true)
        expect(alik(game, from).join(' ').toLowerCase()).toContain('ус')
        expect(game.S.mem[alikShaved]).toBeUndefined()
        expect(game.S.promises[0].kept).toBe(true)
        expect(game.S.mem[moustacheKept], 'факт спасённой ставки — на нём стоит архив дела (#608)').toBe(true)
        saved = true
      }
    }
    expect(saved).toBe(true)
  })

  it('форма клятвы пишет stake и молчит без усов / в эндгейме', () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    const forms = OATH_FORMS.map(spec)
    expect(stakeForm().t).toContain('Если не расплачусь — сбрею')
    expect(forms.some((s) => /Если нет — сбрею/.test(s.t))).toBe(false)
    expect(oathOpen(game)).toBe(true)
    game.S.mem[alikShaved] = true
    expect(oathOpen(game)).toBe(false)
    delete game.S.mem[alikShaved]
    game.S.mem[endgame.active] = true
    expect(oathOpen(game)).toBe(false)
  })

  it('легенда + форма ставки пишет stake (#307)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.setLegend('safe_baby', 'nune')
    const pick = game.linePicked.bind(game)
    game.linePicked = (key, pool, o) => {
      if (key === 'OATH_FORMS') {
        const s = stakeForm()
        return { text: s.t, spec: s, id: s.id ?? 'oath_stake_moustache' }
      }
      return pick(key, pool, o)
    }
    await game.promiseLine(undefined, true)
    const last = game.S.promises.at(-1)!
    expect(last.stake).toBe('moustache')
    expect(last.condition).toBe(nuneKeyPassed)
    expect(last.t).toMatch(/как ключ выйдет/)
  })

  it('срок «сегодня» планирует PromiseDue (#307)', () => {
    const { game } = makeGame()
    const day = game.S.day
    game.recordPromise({ text: 'сегодня вечером', d: 0, stake: 'moustache' })
    expect(game.S.promises[0].due).toBe(day)
    expect(game.S.rules.schedule.some((s) => s.kind === 'event' && s.event === 'PromiseDue' && s.at === day)).toBe(true)
  })

  it('событийный срок: условие без денег брит усы (#307)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'как ключ выйдет', d: null, condition: nuneKeyPassed, stake: 'moustache' })
    game.S.mem[nuneKeyPassed] = true
    game.S.promises[0].met = game.S.day
    const from = game.S.msgs.length
    expect((await game.fire('PromiseConditionMet', { promise: 0 }))?.name).toBe('Condition_StakeShave')
    expect(sys(game, from)).toContain('Алик Воздухонесян сменил фото профиля. На фото — Алик без усов.')
    expect(game.S.mem[alikShaved]).toBe(true)
  })

  it('уже сбритые усы: StakeKept/Shave молчат (#307)', async () => {
    const { game } = makeGame()
    game.S.mood = 3
    game.S.mem[alikShaved] = true
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    const from = game.S.msgs.length
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).not.toBe('Due_StakeShave')
    expect(sys(game, from)).toEqual([])
  })

  it('в эндгейме ставка не исполняется (#307)', async () => {
    const { game } = makeGame()
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    game.S.mem[endgame.active] = true
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).not.toBe('Due_StakeShave')
    expect(game.S.mem[alikShaved]).toBeUndefined()
  })

  it('NC: клятвы усами закрыты без WORLD.moustache', () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    expect(oathUsamiOpen(game)).toBe(true)
    game.S.mem[alikShaved] = true
    expect(game.holds(WORLD.moustache)).toBe(false)
    expect(oathUsamiOpen(game)).toBe(false)
    expect(oathOpen(game)).toBe(false)
  })

  const shaveSys = (g: Game) => g.S.msgs.some((m) => m.kind === 'sys' && /без усов/.test(m.text))

  it('срок «сегодня» и «завтра» исполняется настоящим ходом игрока, даже когда день перескочил срок (#327)', async () => {
    let skipped = 0
    for (const d of [0, 1]) {
      for (let seed = 1; seed <= 8; seed++) {
        const { game } = makeGame({ seed })
        game.rules.applyOps(meet('karine'), {})
        game.S.mood = 3
        game.recordPromise({ text: 'сегодня вечером', d, stake: 'moustache' })
        const due = game.S.promises[0].due!
        await game.send({ text: 'Алик, привет', tone: 'neutral' })
        if (game.S.day > due) skipped++
        expect(shaveSys(game), `d=${d}, seed=${seed}, день ${game.S.day}, срок ${due}`).toBe(true)
      }
    }
    expect(skipped, 'ни один ход не перескочил срок — проверка была бы пустой').toBeGreaterThan(3)
  })

  it('promisePassed: срок вышел, если он сегодня или позади; «когда-нибудь» и будущее — нет', () => {
    const { game } = makeGame()
    const day = game.S.day
    game.recordPromise({ text: 'через два дня', d: 2 })
    game.recordPromise({ text: 'когда-нибудь', d: null })
    game.recordPromise({ text: 'как ключ выйдет', d: null, condition: nuneKeyPassed })
    const passed = (i: number) => game.facts({ promise: i }).promisePassed
    expect([passed(0), passed(1), passed(2)]).toEqual([false, false, false])
    game.S.day = day + 2
    expect(passed(0)).toBe(true) // сегодня
    game.S.day = day + 3
    expect(passed(0)).toBe(true) // позади
    expect(game.facts({ promise: 0 }).promiseLive).toBe(false) // «живо» — по-прежнему только сегодня
    expect(passed(1)).toBe(false)
    game.S.promises[2].met = game.S.day
    expect(passed(2)).toBe(true)
  })

  const legendOath = async (game: Game, stake: boolean) => {
    const pick = game.linePicked.bind(game)
    game.linePicked = (key, pool, o) => {
      if (key !== 'OATH_FORMS') return pick(key, pool, o)
      const s = stake ? stakeForm() : OATH_FORMS.map(spec).find((x) => x.t === '{o}, {p}.')!
      return { text: s.t, spec: s, id: s.id ?? 'oath_plain' }
    }
    game.S.stats.sent += 20 // пауза между клятвами легенды прошла
    await game.promiseLine(undefined, true)
    game.linePicked = pick
  }

  it('повторная клятва легенды со ставкой не теряет её: ставка в записи, условие — и она исполнена (#327)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.setLegend('safe_baby', 'nune')
    await legendOath(game, false)
    expect(game.S.promises.map((p) => p.stake)).toEqual([undefined])
    await legendOath(game, true)
    expect(game.S.promises.map((p) => p.stake)).toEqual(['moustache']) // одна запись, ставка перенесена
    game.S.mem[nuneKeyPassed] = true
    const from = game.S.msgs.length
    await game.afterTurn()
    expect(sys(game, from)).toContain('Алик Воздухонесян сменил фото профиля. На фото — Алик без усов.')
  })

  it('повторная клятва со ставкой на срок в днях: пока срок не вышел — в ту же запись, вышел — новая запись (#327)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.setLegend('boris_receipts', 'boris')
    await legendOath(game, false)
    expect(game.S.promises).toHaveLength(1)
    expect(game.S.promises[0].due).toBe(game.S.day + 3) // «дня через три» — срок в днях у самой легенды
    await legendOath(game, true)
    expect(game.S.promises.map((p) => p.stake)).toEqual(['moustache'])
    game.S.day += 4 // срок вышел
    game.setLegend('boris_receipts', 'boris')
    await legendOath(game, true)
    expect(game.S.promises.map((p) => p.stake)).toEqual(['moustache', 'moustache'])
    expect(game.S.promises[1].due).toBe(game.S.day + 3)
  })

  it('два условных обещания с одним условием: событие условия достаётся и записи со ставкой (#327)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'как ключ выйдет', d: null, condition: nuneKeyPassed })
    game.recordPromise({ text: 'как ключ выйдет — сбрею усы', d: null, condition: nuneKeyPassed, stake: 'moustache' })
    game.S.mem[nuneKeyPassed] = true
    await game.afterTurn()
    expect(game.S.mem[alikShaved]).toBe(true)
  })

  it('срок вышел в сцене — ставка исполняется, когда сцена кончилась (#327)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    game.S.scene = { id: 'invoice', node: 'ask', vars: {} }
    expect(await game.fire('PromiseDue', { promise: 0 })).toBeNull() // пол сцены глотает событие: оно одноразовое
    await game.afterTurn()
    expect(game.S.mem[alikShaved]).toBeUndefined() // сцена ещё идёт
    game.S.scene = null
    await game.afterTurn()
    expect(game.S.mem[alikShaved]).toBe(true)
    expect(game.S.promises[0].stakeDone).toBe(true)
  })

  it('ставка, проглоченная сценой, играет и в конце обычного хода игрока (#327)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    game.S.scene = { id: 'invoice', node: 'ask', vars: {} }
    await game.rules.runDue(game, game.facts, { floor: game.floor() }) // событие срока проглочено сценой
    game.S.scene = null
    expect(shaveSys(game)).toBe(false)
    await game.send({ text: 'Алик, привет', tone: 'neutral' })
    expect(shaveSys(game)).toBe(true)
  })

  it('срок вышел, пока Алик «мёртв», — ставка исполняется после его возвращения (#327)', async () => {
    const { game } = makeGame()
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    game.S.mem[alikDead] = true
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).toBe('Quiet_Dead_PromiseDue')
    await game.afterTurn()
    expect(game.S.mem[alikShaved]).toBeUndefined()
    game.S.mem[alikDead] = false
    await game.afterTurn()
    expect(game.S.mem[alikShaved]).toBe(true)
  })

  it('условная ставка, пока Алик «мёртв» или в блоке, не играет — после возвращения играет (#327)', async () => {
    for (const key of [alikDead, 'blocked']) {
      const { game } = makeGame()
      game.S.mood = 3
      game.recordPromise({ text: 'как ключ выйдет', d: null, condition: nuneKeyPassed, stake: 'moustache' })
      game.S.promises[0].met = game.S.day // условие наступило, событие проглочено сценой
      game.S.mem[key] = true
      await game.afterTurn()
      expect(game.S.mem[alikShaved], key).toBeUndefined()
      game.S.mem[key] = false
      await game.afterTurn()
      expect(game.S.mem[alikShaved], key).toBe(true)
    }
  })

  it('ставка, чьё слово уже «сдержано» обычным Due_Kept на 50 ₽, не играет (#327)', async () => {
    const { game } = makeGame()
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    game.S.scene = { id: 'invoice', node: 'ask', vars: {} }
    await game.rules.runDue(game, game.facts, { floor: game.floor() }) // событие срока проглочено
    game.S.scene = null
    game.S.promises[0].kept = true // слово сдержано на 50 ₽ в другой ход
    await game.afterTurn()
    expect(shaveSys(game)).toBe(false)
  })

  it('ставка играет один раз; амнистированная и в эндгейме — не играет (#327)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    await game.afterTurn()
    expect(game.S.msgs.filter((m) => m.kind === 'sys' && /без усов/.test(m.text))).toHaveLength(1)
    game.S.day += 45 // усы отросли
    game.rules.settle()
    expect(game.S.mem[alikShaved]).toBeUndefined()
    await game.afterTurn()
    expect(game.S.msgs.filter((m) => m.kind === 'sys' && /без усов/.test(m.text))).toHaveLength(1) // второй раз — нет

    // срок вышел в сцене (событие проглочено), сцена — амнистия: упрекать больше нечем, и ставка не играет
    const other = makeGame().game
    other.S.mood = 3
    other.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    other.S.day += 2
    other.S.scene = { id: 'invoice', node: 'ask', vars: {} }
    await other.rules.runDue(other, other.facts, { floor: other.floor() })
    expect(other.amnesty()).toBe(1)
    other.S.scene = null
    await other.afterTurn()
    expect(shaveSys(other)).toBe(false)

    const inEndgame = makeGame().game
    inEndgame.S.mood = 3
    inEndgame.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    inEndgame.S.day += 1
    inEndgame.S.mem[endgame.active] = true
    await inEndgame.afterTurn()
    expect(shaveSys(inEndgame)).toBe(false)
  })

  it('повтор ставки не дёргает событие срока в эндгейме и пока усы отрастают: обычные Due_* не получают лишних бросков (#327)', async () => {
    const { game } = makeGame()
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    game.S.scene = { id: 'invoice', node: 'ask', vars: {} }
    await game.rules.runDue(game, game.facts, { floor: game.floor() }) // событие срока проглочено
    game.S.scene = null
    const fire = vi.spyOn(game, 'fire')
    const retried = () => fire.mock.calls.filter(([event]) => event === 'PromiseDue').length
    game.S.mem[alikShaved] = true
    await game.afterTurn()
    delete game.S.mem[alikShaved]
    game.S.mem[endgame.active] = true
    await game.afterTurn()
    expect(retried()).toBe(0)
    delete game.S.mem[endgame.active]
    await game.afterTurn()
    expect(retried()).toBe(1)
    expect(game.S.mem[alikShaved]).toBe(true)
  })

  it('«когда-нибудь» — формы ставки нет; с датой — есть (#327)', async () => {
    const said = async (d: number | null): Promise<number> => {
      const { game } = makeGame()
      game.rules.applyOps(meet('karine'), {})
      vi.spyOn(game.X, 'promise').mockImplementation(() => ({ text: d === null ? 'когда-нибудь — отдам' : 'через два дня — отдам', t: d === null ? 'когда-нибудь' : 'через два дня', d, kind: d === null ? 'never' : 'clear' }))
      let n = 0
      for (let i = 0; i < 60; i++) {
        game.S.stats.sent += 20
        game.S.day += 1
        await game.promiseLine()
        if (game.S.promises.at(-1)?.stake) n++
      }
      return n
    }
    expect(await said(2), 'ни одной ставки на дату за 60 клятв — проверка была бы пустой').toBeGreaterThan(0)
    expect(await said(null)).toBe(0)
  })

  it('пока усы отрастают — кнопка «как усы?»; без факта — нет; ответ из пула (#352)', async () => {
    const { game } = makeGame()
    const hasAsk = () => game.buildChoices().some((c) => c.act === 'moustacheAsk')
    expect(hasAsk()).toBe(false)
    // как настоящий производитель (Due_StakeShave): факт ставки + ачивка дня бритья — нить жива (#921)
    game.S.day = 10
    game.S.ach.shaved = 9
    game.S.mem[alikShaved] = true
    const block = game.buildChoices()
    expect(block.some((c) => c.act === 'moustacheAsk')).toBe(true)
    const choice = block.find((c) => c.act === 'moustacheAsk')!
    expect(choice.text).toMatch(/ус/i)
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'moustacheAsk' })
    // ответ — строка своего пула: в нём есть и строки без слова «усы» («Растут. Медленно…»)
    expect(alik(game, from).some((t) => PROMISE_SHAVE_ASK.map((e) => spec(e).t).includes(t))).toBe(true)
    // cooldown: сразу снова не предлагаем
    expect(hasAsk()).toBe(false)
    game.S.day += 5
    expect(hasAsk()).toBe(true)
  })

  it('строки кнопки «как усы?» сами якорят нить: в каждой и усы, и деньги (#921)', () => {
    expect(P_MOUSTACHE.length).toBeGreaterThan(0)
    for (const e of P_MOUSTACHE) {
      const t = spec(e).t
      expect(t, `«${t}» — без усов`).toMatch(/ус/i)
      expect(t, `«${t}» — без денег или долга`).toMatch(/долг|денег|деньг/i)
    }
  })

  it('цитата «деньги — как усы, говоришь?» ждёт прозвучавшей фразы (#1171)', () => {
    const quote = P_MOUSTACHE.map((l) => ({ l, t: spec(l).t })).find((x) => x.t.includes('говоришь'))!
    const { game } = makeGame()
    // нить жива (усы сбриты, окно 30 дней), но фразы «Деньги — как усы» ещё не было
    game.S.day = 10
    game.S.ach.shaved = 9
    game.S.mem[alikShaved] = true
    expect(isOpen(quote.l, game.lineFacts()), 'цитата открыта без фразы — снятый гейт краснит здесь').toBe(false)
    const pre = game.buildChoices().find((c) => c.act === 'moustacheAsk')
    expect(pre, 'без фразы кнопки нет — пул опустел').toBeDefined()
    expect(pre!.text.includes('говоришь'), 'цитата в кнопке без фразы').toBe(false)
    // фразу говорят сама строка сбривания и первый ответ на «как усы?» — их remember и есть объявитель
    expect(PROMISE_SHAVE.map(spec).some((s) => s.t.includes('Деньги — как усы') && (s.remember?.length ?? 0) > 0), 'строка сбривания не объявляет фразу').toBe(true)
    expect(PROMISE_SHAVE_ASK.map(spec).some((s) => s.t.includes('Деньги — как усы') && (s.remember?.length ?? 0) > 0), 'ответ на «как усы?» не объявляет фразу').toBe(true)
    game.rules.applyOps([set(saidMoneyMoustache, true)], {})
    expect(isOpen(quote.l, game.lineFacts()), 'цитата закрыта после фразы').toBe(true)
    let shown = false
    for (let i = 0; i < 4 && !shown; i++) { game.S.choices = null; shown = game.buildChoices().some((c) => c.act === 'moustacheAsk' && c.text.includes('говоришь')) }
    expect(shown, 'цитаты нет в кнопке после фразы').toBe(true)
  })

  it('нить выдыхается: до 30 дней после бритья кнопка есть, с 31-го — нет (#921)', () => {
    const { game } = makeGame()
    game.S.day = 100
    game.S.mem[alikShaved] = true
    const hasAsk = () => game.buildChoices().some((c) => c.act === 'moustacheAsk')
    // день бритья: нить ещё не началась — первый вопрос назавтра (счётчику нужен день события)
    game.S.ach.shaved = 100
    expect(hasAsk(), 'в день бритья кнопка ещё не звучит').toBe(false)
    game.S.ach.shaved = 70
    expect(hasAsk(), 'на 30-й день нить ещё жива').toBe(true)
    game.S.ach.shaved = 69
    expect(hasAsk(), 'нить выдохлась').toBe(false)
  })

  it('NC: без alik.shaved Opt_Moustache закрыт (#352)', () => {
    const { game } = makeGame()
    const rule = game.rules.all.find((r) => r.name === 'Opt_Moustache')!
    const onlyMine = { skip: new Set(game.rules.all.filter((r) => r.name !== 'Opt_Moustache').map((r) => r.name)) }
    game.S.day = 10
    game.S.ach.shaved = 9 // окно живо: без него правило закрыто и окном 30 дней (#921)
    delete game.S.mem[alikShaved]
    expect(game.rules.match({ event: 'BuildChoices' }, game.facts(), onlyMine)?.name).not.toBe('Opt_Moustache')
    game.S.mem[alikShaved] = true
    expect(game.rules.match({ event: 'BuildChoices' }, game.facts(), onlyMine)?.name).toBe('Opt_Moustache')
    const was = rule.when
    rule.when = []
    delete game.S.mem[alikShaved]
    expect(game.rules.match({ event: 'BuildChoices' }, game.facts(), onlyMine)?.name).toBe('Opt_Moustache')
    rule.when = was
  })

  it('строки пулов ставки и «условие наступило» после обращения — с маленькой буквы, имена остаются (#327)', async () => {
    const cases: Array<[string, readonly Line[], string, string, () => Game]> = []
    const staked = (): Game => {
      const { game } = makeGame()
      game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
      game.S.day += 1
      return game
    }
    cases.push(['Due_StakeShave', PROMISE_SHAVE, 'DUE_SHAVE', 'PromiseDue', staked])
    cases.push(['Due_StakeKept', PROMISE_SHAVE_KEPT, 'DUE_SHAVE_KEPT', 'PromiseDue', staked])
    cases.push(['Condition_Met', PROMISE_MET, 'MET', 'PromiseConditionMet', () => {
      const { game } = makeGame()
      game.recordPromise({ text: 'как ключ выйдет', d: null, condition: nuneKeyPassed })
      game.S.promises[0].met = game.S.day
      return game
    }])
    let checked = 0
    for (const [name, pool, key, event, make] of cases) {
      const rule = promiseRules.find((r) => r.name === name)!
      for (const entry of pool) {
        const game = make()
        // строка пула названа явно: перебираем каждую, а не ту, что выпала колоде
        const draw = game.draw
        vi.spyOn(game, 'draw').mockImplementation(((k: string, arr: readonly Entry<unknown>[]) => (k === key ? valueOf(entry) : draw(k, arr))) as Game['draw'])
        const from = game.S.msgs.length
        // контекст ответа собирает общий мостик тестов: контентные правила узкие (`ContentApi`), движок — широкий
        await rule.respond!(respondCtx(rule, game, { event: event as 'PromiseDue' }, game.facts({ promise: 0 })))
        const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))[0]
        const prefix = (D.ADDR as Entry<string>[]).map(valueOf).filter((a) => said.startsWith(a + ', ')).sort((a, b) => b.length - a.length)[0]
        expect(prefix, said).toBeDefined()
        const rest = said.slice(prefix.length + 2)
        expect(low(rest), `${name}: после обращения — «${said}»`).toBe(rest)
        checked++
      }
    }
    expect(checked).toBe(PROMISE_SHAVE.length + PROMISE_SHAVE_KEPT.length + PROMISE_MET.length)
  })
})
