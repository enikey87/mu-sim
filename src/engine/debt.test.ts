import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeGame, memStorage } from '../test/helpers'
import { fieldWrites, inMethod, sources } from '../test/field'
import type { Game } from './game'
import { loadState, saveState, SAVE_KEY, type GameState, type Msg } from './state'

// Долг пишет только Game.adjustDebt: прямую запись `S.debt = …` не пропускает тип (readonly в GameState),
// а разбор `test/field.ts` ловит то, что тип пропускает (переменную, Object.assign, defineProperty, Reflect.set).
const game = join('src', 'engine', 'game.ts')
const debtWrites = (file: string, allowAdjust = true) => fieldWrites(file, 'debt', allowAdjust ? inMethod(game, 'adjustDebt') : undefined)

describe('долг: одна точка записи', () => {
  it('страж видит исходники и единственную законную запись', () => {
    const game = join('src', 'engine', 'game.ts')
    expect(sources).toContain(game)
    // без исключения страж находит ровно одну запись — ту, что в adjustDebt
    expect(debtWrites(game, false)).toHaveLength(1)
  })

  it('никто, кроме Game.adjustDebt, не пишет в debt', () => {
    expect(sources.flatMap((f) => debtWrites(f))).toEqual([])
  })

  it('после Дня выплаты: сообщение о долге — только если он изменился, работа не двигает календарь, перевода нет', async () => {
    const { ARCS } = await import('../content/arcs')
    const { game } = makeGame()
    game.S.mem.payday = 'default' // выплата состоялась: долг запечатан
    const debt = game.S.debt
    const sys = () => game.S.msgs.filter((m) => m.kind === 'sys').map((m) => m.text)
    // серия с fx.debt и sys «Алик вычел из долга 10 000 ₽»
    const ep = ARCS.tile.eps.find((e) => e.fx?.debt === -10000)!
    await game.playEpisode(ep, 'tile')
    expect(sys().join(' ')).not.toMatch(/вычел из долга/)
    // узел сцены с fx.debt и sys «Долг Алика вырос на 1 800 ₽»
    await game.enterNode('meet', 'cafe3')
    expect(sys().join(' ')).not.toMatch(/Долг Алика вырос/)
    game.S.scene = null
    // допработа: «Да» не двигает ни долг, ни календарь
    game.alikMsg({ kind: 'job', from: 'alik', text: 'Сделаешь забор?' })
    const job = game.S.msgs.find((m) => m.kind === 'job')!
    const day = game.S.day
    await game.answerJob(job.id, true)
    expect(game.S.day).toBe(day)
    // перевод: пузыря без денег нет
    const n = game.S.msgs.length
    await game.transfer()
    game.awayMsg('transfer') // перевод в пачке «пока тебя не было»
    expect(game.S.msgs.slice(n).some((m) => m.kind === 'transfer')).toBe(false)
    expect(game.S.debt).toBe(debt)
  })

  it('до Дня выплаты те же пути двигают долг и объявляют это', async () => {
    const { ARCS } = await import('../content/arcs')
    const { game } = makeGame()
    const debt = game.S.debt
    await game.playEpisode(ARCS.tile.eps.find((e) => e.fx?.debt === -10000)!, 'tile')
    expect(game.S.debt).toBe(debt - 10000)
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /вычел из долга 10 000/.test(m.text))).toBe(true)
    await game.enterNode('meet', 'cafe3')
    expect(game.S.debt).toBe(debt - 10000 + 1800)
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /Долг Алика вырос на 1 800/.test(m.text))).toBe(true)
  })
})

// Аудит #142, п. 2: флаг «долг сдвинулся» охранялся на двух видах эффекта из пяти. Каждый вид —
// выплата серии, бартер, счёт — объявляет движение долга ровно тогда, когда оно случилось.
describe('долг: объявление звучит ровно тогда, когда долг сдвинулся', () => {
  const sys = (g: Game): string => g.S.msgs.filter((m) => m.kind === 'sys').map((m) => m.text).join(' ')
  /** Реплики Алика: он объявляет счёт не только через sys, но и словами. */
  const said = (g: Game): string => g.S.msgs.filter((m) => m.kind === 'text').map((m) => m.text).join(' ')
  const sealed = (g: Game): Game => { g.S.mem.payday = 'default'; return g }

  it('выплата серии: до выплаты — перевод и объявление, после — ни того, ни другого', async () => {
    const { FINALES } = await import('../content/finales')
    const pay = FINALES.boris.find((f) => f.fx?.pay === 500)!
    const { game } = makeGame()
    const debt = game.S.debt
    await game.playEpisode(pay, 'boris')
    expect(game.S.debt).toBe(debt - 500)
    expect(sys(game)).toMatch(/перевёл 500/)

    const { game: after } = makeGame()
    const sealedDebt = sealed(after).S.debt
    await after.playEpisode(pay, 'boris')
    expect(after.S.debt).toBe(sealedDebt)
    expect(sys(after)).not.toMatch(/перевёл/)
  })

  it('финал Рубика после Дня выплаты не объявляет несостоявшийся вычет', async () => {
    const { ARCS } = await import('../content/arcs')
    const { game } = makeGame()
    sealed(game)
    game.S.ach.redo = game.S.day
    game.S.arcs.rubik = { i: ARCS.rubik.eps.length - 1, last: -99 }

    await game.playArc('rubik')

    expect(game.S.mem['finale.rubik']).toBe('bribe')
    expect(said(game)).not.toMatch(/Из долга вычел/)
  })

  it('все серии с debt/pay объявляют сдвиг только когда adjustDebt его принял', async () => {
    const { ARCS } = await import('../content/arcs')
    const { FINALES } = await import('../content/finales')
    const cases = [
      ['arc.tile.3', ARCS.tile.eps[3], /из твоего долга вычту/i],
      ['finale.boris.brigadir', FINALES.boris.find((f) => f.id === 'brigadir')!, /Тебе тоже/],
      ['finale.boris.toyou', FINALES.boris.find((f) => f.id === 'toyou')!, /Алименты на барана/],
      ['finale.beton.opened', FINALES.beton.find((f) => f.id === 'opened')!, /Внутри — 50 рублей/],
      ['finale.niva.chose', FINALES.niva.find((f) => f.id === 'chose')!, /В бардачке — 50 рублей/],
      ['finale.nune.ledger', FINALES.nune.find((f) => f.id === 'ledger')!, /должен не 240 000, а больше/],
      ['finale.grant.ally', FINALES.grant.find((f) => f.id === 'ally')!, /Держите — за моральный ущерб/],
      ['finale.alik_death.will', FINALES.alik_death.find((f) => f.id === 'will')!, /Мой кредит в банке/],
      ['finale.garik.cutter', FINALES.garik.find((f) => f.id === 'cutter')!, /Неделя работы/],
      ['finale.tile.lost', FINALES.tile.find((f) => f.id === 'lost')!, /плиточник мне должен 8 000/],
      ['finale.rubik.bribe', FINALES.rubik.find((f) => f.id === 'bribe')!, /Из долга вычел/],
      ['finale.razmik.union', FINALES.razmik.find((f) => f.id === 'union')!, /Тебе — 500/],
      ['finale.razmik.shift', FINALES.razmik.find((f) => f.id === 'shift')!, /Оплата потом/],
    ] as const
    const everyDebtEpisode = [
      ...Object.entries(ARCS).flatMap(([arc, a]) => a.eps.map((ep, i) => [`arc.${arc}.${i}`, ep] as const)),
      ...Object.entries(FINALES).flatMap(([arc, fs]) => fs.map((ep) => [`finale.${arc}.${ep.id}`, ep] as const)),
    ].filter(([, ep]) => ep.fx?.debt || ep.fx?.pay).map(([name]) => name).sort()
    expect(everyDebtEpisode).toEqual(cases.map(([name]) => name).sort())

    for (const [name, ep, claim] of cases) {
      const { game } = makeGame()
      game.S.mem['intro.grant'] = true
      const debt = game.S.debt
      await game.playEpisode(ep)
      expect(game.S.debt, name).not.toBe(debt)
      expect(said(game), `${name}: до выплаты`).toMatch(claim)

      const { game: after } = makeGame()
      after.S.mem['intro.grant'] = true
      const sealedDebt = sealed(after).S.debt
      await after.playEpisode(ep)
      expect(after.S.debt, name).toBe(sealedDebt)
      expect(said(after), `${name}: после выплаты`).not.toMatch(claim)
      expect(after.facts()['ctx.debtMoved'], `${name}: временный факт не утёк`).toBeUndefined()
    }
  })

  it('бартер: до выплаты объявляет зачтённую сумму, после — молчит и долг не двигает', async () => {
    const { game } = makeGame()
    const debt = game.S.debt
    await game.enterNode('barter', 'take')
    const moved = debt - game.S.debt
    expect(moved).toBeGreaterThan(0)
    // сообщение называет ту же сумму, что вычлась из долга: число закрывается числом
    expect(sys(game)).toContain(`Долг уменьшился на ${moved.toLocaleString('ru-RU')} ₽`)

    const { game: after } = makeGame()
    const sealedDebt = sealed(after).S.debt
    await after.enterNode('barter', 'take')
    expect(after.S.debt).toBe(sealedDebt)
    expect(sys(after)).not.toMatch(/Долг уменьшился/)
  })

  it('взаимозачёт: до выплаты списывает итог акта и объявляет ту же сумму, после — ни долга, ни объявления', async () => {
    const { game } = makeGame()
    const debt = game.S.debt
    await game.enterNode('invoice', 'ask')
    const doc = game.S.msgs.find((m): m is Extract<Msg, { kind: 'doc' }> => m.kind === 'doc')
    expect(doc?.total).toBeGreaterThan(0)
    const moved = debt - game.S.debt
    expect(moved).toBe(doc!.total) // списали ровно то, что стоит в акте
    // число в сообщении = вычет: иначе «вычел X» при другом долге — дыра (#259)
    expect(sys(game)).toContain(`Алик вычел из долга ${moved.toLocaleString('ru-RU')} ₽ по акту.`)

    const { game: after } = makeGame()
    const sealedDebt = sealed(after).S.debt
    await after.enterNode('invoice', 'ask')
    expect(after.S.debt).toBe(sealedDebt)
    expect(sys(after)).not.toMatch(/вычел из долга/)
  })

  it('отказ после выплаты не двигает и календарь (#189): неделя финала идёт только с долгом', async () => {
    const { FINALES } = await import('../content/finales')
    const cutter = FINALES.garik.find((f) => f.id === 'cutter')!
    const { game } = makeGame()
    const day = game.S.day
    await game.playEpisode(cutter, 'garik')
    expect(game.S.day).toBe(day + 7)
    expect(sys(game)).toMatch(/Неделя на выковыривании/)

    const { game: after } = makeGame()
    const sealedDay = sealed(after).S.day
    await after.playEpisode(cutter, 'garik')
    expect(after.S.day).toBe(sealedDay)
    expect(sys(after)).not.toMatch(/Неделя на выковыривании/)
  })

  // узел сцены (тамада): те же правила отказа, что у серии — календарь/долг/sys глушатся; ach/mood/set остаются (#237/#259)
  it('отказ в узле сцены: день и долг стоят, ачивка и настроение — работа без сдвига суток', async () => {
    const { game } = makeGame()
    const day = game.S.day
    const debt = game.S.debt
    await game.enterNode('q_tamada', 'yes')
    expect(game.S.day).toBe(day + 1)
    expect(game.S.debt).toBe(debt - 1000)
    expect(game.S.ach.q_tamada).toBeDefined()
    expect(sys(game)).toMatch(/долг Алика уменьшился на 1 000/)
    // реплика Алика — то же объявление, что sys: «Бухгалтерия уже посчитала» (#266)
    expect(said(game)).toMatch(/Бухгалтерия уже посчитала/)

    const { game: after } = makeGame()
    const sealedDay = sealed(after).S.day
    const sealedDebt = after.S.debt
    const sealedMood = after.S.mood
    await after.enterNode('q_tamada', 'yes')
    expect(after.S.day).toBe(sealedDay)
    expect(after.S.debt).toBe(sealedDebt)
    expect(sys(after)).not.toMatch(/долг Алика уменьшился/)
    expect(said(after)).not.toMatch(/Бухгалтерия уже посчитала/)
    // решение (#259): отказ — про долг и календарь, не про «узел целиком»
    expect(after.S.ach.q_tamada).toBeDefined()
    expect(after.S.mood).toBe(sealedMood + 3)
    expect(after.S.mem['intro.goar']).toBe(true)
  })
})

// Обходы, которые аудит #142 нашёл у прежнего стража («все семь проходят и компилятор, и тест»).
// Теперь у счёта геттер без сеттера (state.ts), а состояние игры — readonly: форма либо не компилируется,
// либо бросает, не меняя долг. Контроль на каждую форму — этот блок.
describe('долг: геттер без сеттера', () => {
  it('шесть форм записи бросают и долг не меняют', () => {
    const { game } = makeGame()
    const debt = game.S.debt
    const S = game.S as unknown as Record<string, unknown>
    const patch = { debt: 0 }
    const asg = Object.assign
    const tries: Array<[string, () => void]> = [
      ['Object.assign с патчем-переменной', () => { Object.assign(S, patch) }],
      ['Object.assign с вычисляемым ключом', () => { Object.assign(S, { ['debt']: 0 }) }],
      ['запись по ключу-переменной', () => { const k = 'debt'; (S as Record<string, number>)[k] = 0 }],
      ['переименованный Object.assign', () => { asg(S, { debt: 0 }) }],
      ['Object.entries/forEach по состоянию', () => { Object.entries(S).forEach(([k, v]) => { S[k] = v }) }],
    ]
    for (const [name, run] of tries) expect(run, name).toThrow(TypeError)
    // Reflect.set не бросает — возвращает false и не пишет
    expect(Reflect.set(S, 'debt', 0)).toBe(false)
    expect(Reflect.set(S, 'de' + 'bt', 0)).toBe(false)
    expect(game.S.debt).toBe(debt)
  })

  it('сохранение: счёт переживает запись и загрузку и остаётся только на чтение', () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.adjustDebt(-1000)
    saveState(storage, game.S)
    expect(storage.data[SAVE_KEY]).toContain('"debt"') // геттер enumerable: значение уезжает в сейв
    const loaded = loadState(storage)!
    expect(loaded.debt).toBe(game.S.debt)
    expect(Object.getOwnPropertyDescriptor(loaded, 'debt')!.set).toBeUndefined()
    expect(() => { (loaded as { debt: number }).debt = 0 }).toThrow(TypeError)
  })

  it('замена состояния на новое не компилируется', () => {
    // @ts-expect-error S readonly: подменить состояние целиком — не выражение языка
    const replace = (g: Game, s: GameState): void => { g.S = { ...s, debt: 0 } }
    expect(replace).toBeTypeOf('function')
  })
})
