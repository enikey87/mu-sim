// Ставка «сбрею усы» (docs/design/moustache.md): запись в журнале, исполнение в срок, факт ~40 дней.
import { describe, it, expect, vi } from 'vitest'
import { makeGame } from '../test/helpers'
import { spec, valueOf } from './fact'
import { OATH_FORMS } from './misc'
import { WORLD, meet, PROMISE_MET, PROMISE_SHAVE, PROMISE_SHAVE_KEPT } from './world'
import { alikDead, alikShaved, endgame, nuneKeyPassed } from './memkeys'
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
        saved = true
      }
    }
    expect(saved).toBe(true)
  })

  it('форма клятвы пишет stake и молчит без усов / в эндгейме', () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    expect(stakeForm().t).toMatch(/сбрею усы/)
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
    game.S.mem[alikShaved] = true
    expect(hasAsk()).toBe(true)
    const choice = game.buildChoices().find((c) => c.act === 'moustacheAsk')!
    expect(choice.text).toMatch(/ус/i)
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'moustacheAsk' })
    expect(alik(game, from).some((t) => /ус|отраст|без усов/i.test(t))).toBe(true)
    // cooldown: сразу снова не предлагаем
    expect(hasAsk()).toBe(false)
    game.S.day += 5
    expect(hasAsk()).toBe(true)
  })

  it('NC: без alik.shaved Opt_Moustache закрыт (#352)', () => {
    const { game } = makeGame()
    const rule = game.rules.all.find((r) => r.name === 'Opt_Moustache')!
    const onlyMine = { skip: new Set(game.rules.all.filter((r) => r.name !== 'Opt_Moustache').map((r) => r.name)) }
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
    const cases: Array<[string, readonly Entry<string>[], string, string, () => Game]> = []
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
        await rule.respond!(game.rules.ctx(game, rule, { event: event as 'PromiseDue' }, game.facts({ promise: 0 })))
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
