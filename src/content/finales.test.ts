// Разные финалы сериалов и концовки игры: выбор по поведению игрока, память, эффекты.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { ARCS, ARC_DONE, CAST } from './arcs'
import { ACH } from './achievements'
import { FINALES, ENDINGS, DEFAULT_FINALE, ENDING_MIN_DAY } from './finales'
import type { Game } from '../engine/game'
import { valueOf } from '../engine/rules'
import { NOTIF } from './life'
import type { Episode } from './arcs'

const lines = (ep: Pick<Episode, 'm'>) => ep.m.map(valueOf).map((m) => (typeof m === 'string' ? m : m.t))
/** Реплики серии, уместные в этой партии. */
const fitting = (g: Game, ep: Pick<Episode, 'm'>) => g.open(ep.m).map((m) => (typeof m === 'string' ? m : m.t))
const toLast = (game: Game, id: string) => { game.S.arcs[id] = { i: ARCS[id].eps.length - 1, last: -99 } }
const said = (game: Game, from: number) => game.S.msgs.slice(from).filter((m) => m.kind === 'text').map((m) => (m.kind === 'text' ? m.text : ''))

// условия каждого частного финала — как их выполнил бы игрок
const SETUP: Record<string, (g: Game) => void> = {
  'boris.brigadir': (g) => { g.S.mem['asked.boris'] = 6 },
  'boris.toyou': (g) => { g.S.items.push('баран Борис') },
  'beton.opened': (g) => { g.S.mem['count.rude'] = 6; g.S.mem['rude.heat'] = 2 },
  'beton.corner': (g) => { g.S.ach.redo = 190 },
  'beton.ledger': (g) => { g.S.mem.caught = 2 },
  'samvel.tamada': (g) => { g.S.ach.toast = 190 },
  'samvel.groom': (g) => { g.S.ach.saint = 190 },
  'niva.chose': (g) => { g.S.items.push('«Нива» 1987 года') },
  'nune.ledger': (g) => { g.S.mem.caught = 2 },
  'grant.ally': (g) => { g.S.ach.customer = 190 },
  'alik_death.will': (g) => { g.S.ach.forgive = 190; g.S.mem['asked.alik_death'] = 1 },
  'alik_death.sulk': () => {},
  'garik.cutter': (g) => { g.S.ach.newjob = 190 },
  'tile.lost': (g) => { g.S.mem.court = 6 },
  'grandpa.revoke': (g) => { g.S.ach.heir = 190; g.S.arcs.boris = { i: 1, last: 0 } }, // наследство — Борису: он уже есть
  'rubik.bribe': (g) => { g.S.ach.redo = 190 },
  'rubik.karine': (g) => { g.S.ach.wife = 190 },
  'razmik.union': (g) => { g.S.ach.customer = 190 },
  'razmik.swap': (g) => { g.S.mem['count.rude'] = 10; g.S.mem['rude.heat'] = 3 },
  'razmik.shift': (g) => { g.S.ach.fence = 190 },
  'collectors.intern': (g) => { g.S.mem['count.rude'] = 6 },
}

describe('финалы сериалов: контент', () => {
  it('у каждого сериала есть название обычного финала; частные финалы — к существующим сериалам', () => {
    for (const id of Object.keys(ARCS)) expect(DEFAULT_FINALE[id], id).toBeTruthy()
    for (const [arc, fs] of Object.entries(FINALES)) {
      expect(ARCS[arc], arc).toBeDefined()
      expect(new Set(fs.map((f) => f.id)).size).toBe(fs.length)
      for (const f of fs) {
        expect(f.done.length, `${arc}.${f.id}`).toBeGreaterThanOrEqual(2)
        expect(ACH[f.fx?.ach ?? ''], `${arc}.${f.id} ach`).toBeDefined()
        expect(ACH[`fin_${arc}_${f.id}`]).toBeDefined()
        expect(SETUP[`${arc}.${f.id}`], `нет теста на ${arc}.${f.id}`).toBeDefined()
        for (const m of f.m.map(valueOf)) if (typeof m !== 'string' && 'w' in m) expect(CAST[m.w], m.w).toBeDefined()
      }
    }
  })
  it('у каждой концовки есть текст, условия и ачивка', () => {
    for (const e of ENDINGS) {
      expect(e.when.length, e.id).toBeGreaterThan(0)
      expect(e.text.length).toBeGreaterThan(40)
      expect(ACH['end_' + e.id]).toBeDefined()
    }
  })
})

describe('финалы сериалов: выбор', () => {
  it('без особых условий — обычный финал (последняя серия), как раньше', async () => {
    for (const id of Object.keys(ARCS)) {
      const { game } = makeGame()
      game.S.day = 300
      game.S.mem['asked.alik_death'] = 1 // иначе у похорон «Обиделся»
      toLast(game, id)
      const expected = fitting(game, ARCS[id].eps.at(-1)!)
      if (id !== 'alik_death') expect(expected.length, `${id}: нет уместной строки`).toBeGreaterThan(0)
      const from = game.S.msgs.length
      await game.playArc(id)
      expect(said(game, from), id).toEqual(expect.arrayContaining(expected))
      expect(game.S.mem['finale.' + id]).toBe('default')
      expect(game.finaleTitle(id)).toBe(DEFAULT_FINALE[id])
      expect(game.arcDoneLines(id)).toBe(ARC_DONE[id])
      expect(game.S.arcs[id].i).toBe(ARCS[id].eps.length)
    }
  })
  it('условия выполнены — частный финал: свои реплики, память, ачивка, ответы «Как там…?»', async () => {
    for (const [arc, fs] of Object.entries(FINALES)) {
      for (const f of fs) {
        const { game } = makeGame()
        game.S.day = 300
        SETUP[`${arc}.${f.id}`](game)
        toLast(game, arc)
        const expected = fitting(game, f)
        const from = game.S.msgs.length
        await game.playArc(arc)
        expect(game.S.mem['finale.' + arc], `${arc}.${f.id}`).toBe(f.id)
        expect(said(game, from).length, `${arc}.${f.id}: финал промолчал`).toBeGreaterThan(0)
        expect(said(game, from)).toEqual(expect.arrayContaining(expected))
        expect(game.S.ach[`fin_${arc}_${f.id}`]).toBeDefined()
        expect(game.S.ach[f.fx!.ach!]).toBeDefined()
        expect(game.finaleTitle(arc)).toBe(f.title)
        expect(game.arcDoneLines(arc)).toBe(f.done)
      }
    }
  })
  it('частные финалы не случаются раньше последней серии', async () => {
    const { game } = makeGame()
    SETUP['boris.brigadir'](game)
    await game.playArc('boris')
    expect(game.S.mem['finale.boris']).toBeUndefined()
    expect(alikTexts(game.S.msgs).join(' ')).toContain(lines(ARCS.boris.eps[0])[0])
  })
  it('эффекты: Борис платит по-настоящему, «Нива» приезжает трофеем, обиженный Алик пропадает', async () => {
    const { game } = makeGame()
    SETUP['boris.brigadir'](game)
    toLast(game, 'boris')
    const [debt, money] = [game.S.debt, game.S.money]
    await game.playArc('boris')
    expect(game.S.debt).toBe(debt - 500)
    expect(game.S.money).toBe(money + 500)

    const b = makeGame().game
    SETUP['niva.chose'](b)
    toLast(b, 'niva')
    await b.playArc('niva')
    expect(b.S.items).toContain('«Нива» (сама приехала)')
    expect(b.S.mem['niva.player']).toBe(true)
    expect(b.S.mem['niva.away']).toBe(false)
    const { WORLD } = await import('./world')
    expect(b.holds(WORLD.nivaHome)).toBe(false)
    expect(b.holds(WORLD.nivaPlayer)).toBe(true)

    const c = makeGame().game
    c.S.day = 300
    toLast(c, 'alik_death')
    await c.playArc('alik_death')
    expect(c.S.mem['finale.alik_death']).toBe('sulk')
    expect(c.S.offlineDays).toBe(20)
  })
  it('два финала подходят — побеждает более специфичный («Жених» перекрывает «Тамаду»)', async () => {
    // приоритет обязан быть не случайностью равной специфичности: прогоняем разные сиды
    for (const seed of [1, 2, 3, 4, 5]) {
      const { game } = makeGame({ seed })
      SETUP['samvel.tamada'](game)
      SETUP['samvel.groom'](game)
      toLast(game, 'samvel')
      await game.playArc('samvel')
      expect(game.S.mem['finale.samvel'], `сид ${seed}`).toBe('groom')
      expect(game.S.mem['wedding.anush']).toBe(true)
      expect(game.S.mem['wedding.samvel']).toBeUndefined()
    }
    // свадьба игрока окрашивает ходы своим правилом, не Самвела (#256)
    const { game } = makeGame()
    SETUP['samvel.groom'](game)
    toLast(game, 'samvel')
    await game.playArc('samvel')
    game.S.arcs.beton = { i: 1, last: 0 }
    let noise = 0
    for (let i = 0; i < 150; i++) {
      game.S.stats.sent += 4
      if (game.rules.match({ event: 'AlikTurn' }, game.facts())?.name === 'Turn_Wedding_Anush') noise++
    }
    expect(noise).toBeGreaterThan(3)
  })
  it('«Борис уходит к тебе» важнее «Бригадира»: предмет бьёт шесть вопросов (#759)', async () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { game } = makeGame({ seed })
      SETUP['boris.toyou'](game)
      SETUP['boris.brigadir'](game)
      toLast(game, 'boris')
      await game.playArc('boris')
      expect(game.S.mem['finale.boris'], `сид ${seed}`).toBe('toyou')
    }
    const { game } = makeGame({ seed: 1 })
    SETUP['boris.brigadir'](game)
    toLast(game, 'boris')
    await game.playArc('boris')
    expect(game.S.mem['finale.boris']).toBe('brigadir')
  })
  it('жених: wedding.anush навсегда — через 8 дней свадебный ход жив (#328)', async () => {
    const { game } = makeGame()
    SETUP['samvel.groom'](game)
    toLast(game, 'samvel')
    await game.playArc('samvel')
    expect(game.S.mem['wedding.anush']).toBe(true)
    expect(game.S.rules.schedule.some((it) => it.kind === 'restore' && it.key === 'wedding.anush')).toBe(false)
    game.S.day += 9
    game.rules.settle()
    expect(game.S.mem['wedding.anush']).toBe(true)
    game.S.arcs.beton = { i: 1, last: 0 }
    let noise = 0
    for (let i = 0; i < 150; i++) {
      game.S.stats.sent += 4
      if (game.rules.match({ event: 'AlikTurn' }, game.facts())?.name === 'Turn_Wedding_Anush') noise++
    }
    expect(noise).toBeGreaterThan(3)
  })
  it('NC: forDays:8 снимает wedding.anush через 8 дней (#328)', () => {
    const { game } = makeGame()
    game.rules.applyOps([{ key: 'wedding.anush', op: '=', value: true, forDays: 8 }], {})
    expect(game.S.mem['wedding.anush']).toBe(true)
    game.S.day += 8
    game.rules.settle()
    expect(game.S.mem['wedding.anush']).toBeUndefined()
  })
  it('грубил хоть раз — одного Святого хватает: «Жених» не требует ни одного крика', async () => {
    const { game } = makeGame()
    SETUP['samvel.groom'](game)
    game.S.mem['count.rude'] = 1
    toLast(game, 'samvel')
    await game.playArc('samvel')
    expect(game.S.mem['finale.samvel']).toBe('groom')
  })
  it('без Святого женихом не стать — частный финал уступает место обычному', async () => {
    const { game } = makeGame()
    toLast(game, 'samvel')
    await game.playArc('samvel')
    expect(game.S.mem['finale.samvel']).toBe('default')
  })
  // #730: условие «Жениха» — только «Святой» (10 вежливых подряд), крики ему не мешают:
  // реплика не утверждает отсутствия криков — этого условия больше нет
  it('реплика «Жениха» называет вежливость, а не «ни разу не крикнул»', () => {
    const groom = FINALES.samvel.find((f) => f.id === 'groom')!
    const text = [...lines(groom), ...lines({ m: groom.done })].join('\n')
    expect(text, 'утверждение об отсутствии криков без факта').not.toMatch(/ни разу|ни одного раза|не кричал|не крикнул|не грубил/i)
    expect(text, 'называет факт, на котором стоит условие').toMatch(/свят/i)
  })
  it('НС: без bonus приоретет «Жениха» над «Тамадой» теряется', () => {
    const groom = FINALES.samvel.find((f) => f.id === 'groom')!
    expect(groom.bonus).toBe(1)
    // когда оба условия выполнены, у «Жениха» and «Тамады» по одному условию — разводит только bonus
    expect(groom.when).toHaveLength(1)
    expect(FINALES.samvel.find((f) => f.id === 'tamada')!.bonus).toBeUndefined()
  })
  it('финал с fx.pay: paid растёт, fifty — только при 50 ₽', async () => {
    const { game } = makeGame()
    SETUP['razmik.union'](game)
    toLast(game, 'razmik')
    const beforeFifty = game.S.stats.fifty
    const beforePaid = game.S.stats.paid
    await game.playArc('razmik')
    expect(game.S.mem['finale.razmik']).toBe('union')
    expect(game.S.stats.paid).toBe(beforePaid + 1) // 500 ₽ — «спасибо» видит перевод
    expect(game.S.stats.fifty).toBe(beforeFifty) // не 50 ₽ — ачивка не считает
  })
  it('финал с fx.pay 50 ₽ увеличивает и paid, и fifty', async () => {
    const { game } = makeGame()
    SETUP['beton.opened'](game)
    toLast(game, 'beton')
    const beforeFifty = game.S.stats.fifty
    const beforePaid = game.S.stats.paid
    await game.playArc('beton')
    expect(game.S.mem['finale.beton']).toBe('opened')
    expect(game.S.stats.paid).toBe(beforePaid + 1)
    expect(game.S.stats.fifty).toBe(beforeFifty + 1)
  })
  it('вопрос «Как там…?» считается и после финала отвечает репликами этого финала', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 1, last: -99 }
    for (let i = 0; i < 6; i++) await game.fire('PlayerSays', { intent: 'arc', arg: 'boris' })
    expect(game.S.mem['asked.boris']).toBe(6)
    expect(game.S.arcs.boris.i).toBe(2) // подряд — одна новая серия, дальше «пока без новостей»
    toLast(game, 'boris')
    await game.playArc('boris')
    expect(game.S.mem['finale.boris']).toBe('brigadir')
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'arc', arg: 'boris', argArcDone: true })
    expect(FINALES.boris[0].done).toContain(said(game, from).at(-1))
  })
})

describe('новые сериалы: фундамент, Рубик, Размик', () => {
  // серия → легенда после неё (цепочка «где деньги и что мешает»)
  const CHAIN: Record<string, Array<string | undefined>> = {
    beton: ['beton_money', 'beton_money', 'beton_money', 'beton_law', 'beton_law', 'beton_goar', 'beton_goar', undefined],
    rubik: ['inspect', 'inspect', 'inspect', 'inspect', 'inspect', 'inspect_karine', 'inspect_karine', 'frozen'],
    razmik: ['crane_queue', 'crane_queue', 'crane_queue', 'crane_queue', 'crane_queue', 'crane_wedding', 'crane_wedding', undefined],
  }
  it('каждый проигрывается до конца: легенды по цепочке, обычный финал, ачивка', async () => {
    for (const [id, chain] of Object.entries(CHAIN)) {
      const { game } = makeGame()
      game.S.day = 300
      expect(chain.length, id).toBe(ARCS[id].eps.length)
      for (const want of chain) {
        await game.playArc(id)
        expect(game.legend(), `${id} серия ${game.S.arcs[id].i}`).toBe(want)
      }
      expect(game.S.mem['finale.' + id]).toBe('default')
      expect(game.S.ach[ARCS[id].eps.at(-1)!.fx!.ach!]).toBeDefined()
    }
  })
  it('Рубик и Размик — с середины игры, не раньше', () => {
    const { game } = makeGame()
    game.S.day = 200
    expect(game.availableArcs()).not.toContain('rubik')
    expect(game.availableArcs()).not.toContain('razmik')
    game.S.day = 230
    expect(game.availableArcs()).toEqual(expect.arrayContaining(['rubik', 'razmik']))
  })
  it('свадьба на кране — состояние мира «свадьба»', async () => {
    const { game } = makeGame()
    game.S.arcs.razmik = { i: 5, last: -99 }
    await game.playArc('razmik')
    expect(game.S.mem['wedding.razmik']).toBe(true)
  })
  it('запасные условия: суд до Страсбурга вскрывает фундамент, новый объект сажает в кабину крана', async () => {
    const a = makeGame().game
    a.S.mem.court = 5
    toLast(a, 'beton')
    await a.playArc('beton')
    expect(a.S.mem['finale.beton']).toBe('opened')
    expect(a.S.items).toContain('Записка «остальное потом»')

    const b = makeGame().game
    b.S.ach.newjob = 190
    toLast(b, 'razmik')
    const debt = b.S.debt
    await b.playArc('razmik')
    expect(b.S.mem['finale.razmik']).toBe('shift')
    expect(b.S.debt).toBe(debt + 6000)
  })
  it('рассказ о конверте объясняет переход из банки в фундамент', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в банке с огурцами.' }, ['money_jar'])
    await game.playEpisode(ARCS.beton.eps[0], 'beton')
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ subject: 'money.location', from: 'bank', to: 'foundation' }))
    expect(game.lie()).toBeNull()
    expect(game.facts().lieOpen).toBe(false)
  })
})

describe('концовки игры', () => {
  const check = async (game: Game) => { await game.fire('CheckEnding'); return game.S.ending }
  const late = () => { const t = makeGame(); t.game.S.day = ENDING_MIN_DAY; return t }
  it('нет финалов — нет концовки', async () => {
    const { game } = makeGame()
    expect(await check(game)).toBeNull()
  })
  it('финал «Жених» → концовка «Породнились»: экран, запись, ачивка — один раз', async () => {
    const { game } = late()
    game.S.mem['finale.samvel'] = 'groom'
    expect(await check(game)).toBe('family')
    expect(game.S.endings.family).toBe(game.S.day)
    expect(game.S.ach.end_family).toBeDefined()
    await game.closeEnding()
    expect(game.S.ending).toBeNull()
    expect(await check(game)).toBeNull()
  })
  it('до границы третьего акта концовок нет: это развязка, а не начало (#1254)', async () => {
    const { game } = makeGame()
    game.S.mem['finale.samvel'] = 'groom'
    game.S.day = ENDING_MIN_DAY - 1
    expect(await check(game)).toBeNull()
    // НК: вернуть `gte('day', 300)` — на 329-й день концовка снова срабатывает, тест краснеет на «ранней концовке»
    game.S.day = ENDING_MIN_DAY
    expect(await check(game)).toBe('family')
  })
  it('финал, сыгранный в конце второго акта, не врывается концовкой назавтра (#1254)', async () => {
    // партия №5: Борис ушёл к игроку 4 января (день 292), концовка «Бараном» выстрелила ровно на 300-й,
    // первый день готовности — «играл играл и резко конец». Теперь развязка ждёт третьего акта.
    const { game } = makeGame()
    game.S.day = 292
    game.S.mem['finale.boris'] = 'toyou'
    game.nextDay(300 - 292)
    expect(game.S.day).toBe(300)
    expect(await check(game), 'концовка на первом дне готовности').toBeNull()
    game.nextDay(ENDING_MIN_DAY - 1 - game.S.day)
    expect(await check(game), 'концовка до третьего акта').toBeNull()
    game.nextDay(1)
    expect(await check(game), 'третий акт начался — развязка ждать больше нечего').toBe('ram')
  })
  it('«Честные деньги» — один факт Гранта: ни Бориса, ни «Нивы»; сумма — из финала', async () => {
    const { game } = late()
    game.S.mem['finale.grant'] = 'ally'
    expect(await check(game)).toBe('honest')
    const e = ENDINGS.find((x) => x.id === 'honest')!
    const texts = [...lines(e), e.text].join(' ').replace(/\u00A0/g, ' ')
    expect(texts).toContain('Грант')
    expect(texts).not.toMatch(/Борис|Нива/) // концовка больше не требует их финалов — текст не опирается на них
    const pay = (FINALES.grant.find((f) => f.id === 'ally')!.fx!.pay as number).toLocaleString('ru-RU').replace(/\u00A0/g, ' ')
    expect(texts).toContain(`${pay} ₽`)
  })
  // #729: условие «Настоящих денег» — вежливость и суд (#713); в экран вернулись поимки на лжи и квесты:
  // правку #722 отменило слияние ветки #723
  it('экран «Настоящих денег» не называет убранных условий', () => {
    const e = ENDINGS.find((x) => x.id === 'payday_real')!
    const texts = [...lines(e), e.text].join(' ')
    expect(texts, 'убранные условия — поимки и квесты — в тексте').not.toMatch(/поимк|ловил|квест|quests/i)
    expect(texts, 'называет действующие условия').toMatch(/вежлив/)
    expect(texts).toMatch(/суд/)
  })
  it('каждую концовку можно получить', async () => {
    const setups: Record<string, (g: Game) => void | Record<string, unknown>> = {
      family: (g) => { g.S.mem['finale.samvel'] = 'groom' },
      heir: (g) => { g.S.mem['finale.alik_death'] = 'will' },
      ram: (g) => { g.S.mem['finale.boris'] = 'toyou' },
      alik: (g) => { g.S.mem['finale.garik'] = 'cutter' },
      honest: (g) => { g.S.mem['finale.grant'] = 'ally' },
      multiverse: (g) => { g.S.day = 800; g.S.stats.sent = 300; g.S.mem['endgame.active'] = true },
      vendetta: (g) => { g.S.mem.vendetta = true },
    }
    // исходы Дня выплаты: концовка по факту payday = id
    for (const e of ENDINGS) if (e.id.startsWith('payday_')) setups[e.id] = (g) => { g.S.mem.payday = e.id.slice(7) }
    expect(Object.keys(setups).sort()).toEqual(ENDINGS.map((e) => e.id).sort())
    for (const [id, setup] of Object.entries(setups)) {
      const { game } = late()
      setup(game)
      expect(await check(game), id).toBe(id)
    }
  })
  // Достижимость. Входы — факты игрока, заданные напрямую (SETUP финалов, счётчики, ачивки квестов); дальше —
  // настоящие производители: финал сериала (playArc), лестница грубости (send), сцена выплаты (узлы).
  // После Дня выплаты эндгейм концовок не даёт (Endgame_NoEnding), кроме «Параллельной вселенной». Поэтому сюжетная концовка проверяется на
  // самой выгодной траектории: с первого дня, который допускает её собственное условие, шаг за шагом — и
  // перед каждым шагом, кроме последнего, ни одно правило, вынуждающее выплату (Beat_Payday*), не открыто.
  // Последний шаг и концовка — один ход: CheckEnding идёт в том же ходу, что и сюжетный ход.
  it('каждая концовка складывается из своих финалов и счётчиков, а сюжетная — раньше, чем выплату вынудит любое правило', async () => {
    const finale = (key: string) => async (g: Game) => { const arc = key.split('.')[0]; SETUP[key](g); toLast(g, arc); await g.playArc(arc); expect(g.S.mem['finale.' + arc], key).toBe(key.split('.')[1]) }
    const choose = async (g: Game, go: string) => { g.S.choices = null; const c = g.choices.find((x) => x.go === go); expect(c, go).toBeDefined(); await g.send(c!) }
    const payday = (catches: boolean) => async (g: Game) => {
      await g.enterNode('payday', 'announce')
      await choose(g, 'bag')
      await choose(g, 'share')
      await choose(g, catches ? 'catch' : 'accept')
    }
    // противоречие утра и отмазки — есть что поймать (утром «Сейф открыли», в отмазке — сейф)
    const contra = async (g: Game) => { g.S.mem['finale.nune'] = 'default'; g.S.arcs.nune = { i: ARCS.nune.eps.length, last: 0 } }
    const threat = async (g: Game) => { g.S.offlineDays = 0; await g.send('Я подаю в суд. Серьёзно.') }
    type Step = (g: Game) => Promise<void>
    const SCENARIO: Record<string, Step[]> = {
      family: [finale('samvel.groom')],
      heir: [finale('alik_death.will')],
      ram: [finale('boris.toyou')],
      alik: [finale('garik.cutter')],
      honest: [finale('grant.ally')],
      vendetta: [async (g) => { Object.assign(g.S.mem, { 'count.rude': 25, 'rude.heat': 5 }); await g.send({ text: 'АЛИК!!! ТЫ ВРЁШЬ!!!', tone: 'rude' }); expect(g.S.mem.vendetta).toBe(true) }],
      // единственная концовка эндгейма: группа открылась выплатой и живёт до 800-го дня
      multiverse: [async (g) => { await payday(false)(g); g.closeEnding(); expect(g.S.mem['endgame.active']).toBe(true) }],
      payday_default: [payday(false)],
      payday_coins: [contra, payday(true)],
      payday_lavash: [contra, async (g) => { g.S.mem['crypto.hodl'] = true }, payday(true)],
      payday_niva: [async (g) => { g.S.mem['asked.niva'] = 4; toLast(g, 'niva'); await g.playArc('niva') }, payday(false)],
      payday_strasbourg: [async (g) => { g.S.mem.court = 5; await threat(g); expect(g.S.ach.strasbourg).toBeDefined() }, payday(false)],
      payday_notyou: [async (g) => { toLast(g, 'razmik'); await g.playArc('razmik'); g.S.mem['count.rude'] = 8 }, payday(false)],
      payday_real: [async (g) => { Object.assign(g.S.ach, { saint: 190, court: 200, q_hash: 1, q_mama: 1, q_goat: 1, q_parking: 1, q_photo: 1 }); g.S.mem.caught = 3 }, payday(false)],
    }
    expect(Object.keys(SCENARIO).sort()).toEqual(ENDINGS.map((e) => e.id).sort())
    /** Нижняя граница, которую ставит условие концовки: gte(key, n) → n. */
    const floor = (e: (typeof ENDINGS)[number], key: string) => Math.max(0, ...e.when.filter((c) => c.key === key && c.op === '>=').map((c) => Number(c.value)))
    const forcing = (g: Game) => g.rules.all.filter((r) => r.event === 'StoryBeat' && r.name.startsWith('Beat_Payday')).map((r) => r.name)
    // #893: подводка (Lead) тоже вынуждает выплату — она в семье Beat_Payday* наравне с анонсом
    expect(forcing(makeGame().game)).toEqual(['Beat_PaydayLead_First', 'Beat_PaydayLead_Late', 'Beat_PaydayLead_Deadline', 'Beat_PaydayLead_Second', 'Beat_Payday', 'Beat_Payday_Late', 'Beat_Payday_Deadline']) // пустой список сторожил бы вакуум
    for (const [id, steps] of Object.entries(SCENARIO)) {
      const e = ENDINGS.find((x) => x.id === id)!
      const { game } = makeGame()
      game.S.day = floor(e, 'day')
      game.S.stats.sent = floor(e, 'sent')
      // концовка эндгейма рождается выплатой — требование «выплата не вынуждена раньше» к ней не относится
      const story = !id.startsWith('payday_') && !e.inEndgame
      for (const [i, step] of steps.entries()) {
        if (story) expect(game.rules.collect({ event: 'StoryBeat' }, game.facts()).filter((r) => forcing(game).includes(r.name)).map((r) => r.name), `${id}, шаг ${i + 1}: выплата вынуждена раньше концовки`).toEqual([])
        await step(game)
      }
      if (game.S.ending !== id) await game.fire('CheckEnding')
      expect(game.S.ending, id).toBe(id)
    }
  })
  it('концовка проверяется после каждого хода игрока', async () => {
    const { game } = late()
    game.S.mem['finale.alik_death'] = 'will'
    await game.send({ text: 'Алик, добрый день', tone: 'polite' })
    expect(game.S.ending).toBe('heir')
  })
})

describe('ответы «Как там…?» против фактов финала (#786)', () => {
  // Свип класса «ретроспективная реплика утверждает то, чего не было в партии»: done-ответ обычного
  // финала не может claim'ить факт чужого финала — «ты не пришёл» это `sulk` (asked ≤ 0).
  it('обычный финал похорон: ответ не утверждает, что игрок не пришёл', async () => {
    const { game } = makeGame()
    game.S.day = 300
    game.S.mem['asked.alik_death'] = 1 // иначе «Обиделся»: sulk требует asked ≤ 0
    toLast(game, 'alik_death')
    await game.playArc('alik_death')
    expect(game.S.mem['finale.alik_death']).toBe('default')
    const texts = game.arcDoneLines('alik_death').map((l) => valueOf(l)).map((x) => (typeof x === 'string' ? x : x.t))
    expect(texts.join(' '), 'не приход игрока — факт только финала sulk').not.toMatch(/не пришёл/)
    expect(texts.join(' ')).toMatch(/не видел/)
  })
})

describe('«Бараном»: баран Бориса — путём игрока, а не лотереей (#752)', () => {
  // Единственный производитель `has.boris` — товар барахолки. Он брался равным розыгрышем из ~13
  // товаров, а барахолка при перерыве 25 дней и конкуренции с другими сценами открывалась 0–2 раза
  // за партию: концовка не собиралась ни разу. Теперь при открытых воротах барана предлагают первым.
  const choose = async (g: Game, go: string) => { g.S.choices = null; const c = g.choices.find((x) => x.go === go); expect(c, go).toBeDefined(); await g.send(c!) }

  /** Дожить до барахолки и забрать барана: игрок жмёт «Беру!» в сцене обмена. */
  async function buyBaran(game: Game): Promise<boolean> {
    for (let t = 0; t < 200; t++) {
      if (game.S.scene?.id === 'barter') {
        const n = String((game.S.scene.vars as { n?: string } | undefined)?.n ?? '')
        if (/Борис/.test(n)) { await choose(game, 'take'); return true }
        await choose(game, 'refuse') // чужой товар — отказ; барахолка откроется снова
      } else await game.send({ text: 'Алик, когда деньги?', tone: 'neutral' })
      game.S.offlineDays = 0
    }
    return false
  }

  it('баран предлагается первым и обмен даёт концовку «Бараном»', async () => {
    const { game } = makeGame({ seed: 6 })
    await game.playArc('boris') // линия Бориса началась — ворота открыты
    expect(await buyBaran(game)).toBe(true)
    expect(game.facts()['has.boris'], 'факт «Борис у игрока»').toBe(true)
    toLast(game, 'boris')
    await game.playArc('boris')
    expect(game.S.mem['finale.boris']).toBe('toyou')
    game.nextDay(Math.max(0, ENDING_MIN_DAY - game.day))
    await game.fire('CheckEnding')
    expect(game.S.ending).toBe('ram')
  })

  it('НС: ворота закрыты (линия Бориса не начата) — барана в обмене нет', () => {
    const { game } = makeGame()
    game.S.mem['intro.baran'] = true // про барана слышали, но линии Бориса нет
    const open = <T,>(a: readonly Parameters<typeof game.open<T>>[0][number][]) => game.open<T>(a)
    const offered = new Set<string>()
    for (let i = 0; i < 60; i++) offered.add(String(game.scenes.barter.init!(game.rng, open, game.S.day).n))
    expect(offered).not.toContain('баран Борис')
  })

  it('НС: купленного барана обмен не предлагает снова', () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 1, last: 0 }
    game.S.mem['intro.baran'] = true
    const open = <T,>(a: readonly Parameters<typeof game.open<T>>[0][number][]) => game.open<T>(a)
    expect(String(game.scenes.barter.init!(game.rng, open, game.S.day).n)).toBe('баран Борис')
    game.S.items.push('баран Борис') // куплен
    const offered = new Set<string>()
    for (let i = 0; i < 60; i++) offered.add(String(game.scenes.barter.init!(game.rng, open, game.S.day).n))
    expect(offered).not.toContain('баран Борис')
  })
})

describe('финалы по числу вопросов достижимы игроком (#753)', () => {
  // Финалы вида «спрашивал 4/6 раз» упирались в размер пула `follow` (4 строки): вопрос про сериал
  // переставал предлагаться после четырёх формулировок, и `asked.*` не дотягивал до порога.
  // Здесь порог набирается настоящими нажатиями кнопки «как там X?».
  const askLine = async (game: Game, arc: string, need: number) => {
    let asks = 0
    // 240, а не 120: после #824 дословный повтор follow-строки отстоит от показа на окно в ходах,
    // поэтому пороги «спрашивал 4/6 раз» набираются дольше — но по-прежнему набираются
    for (let t = 0; t < 300 && Number(game.S.mem[`asked.${arc}`] ?? 0) < need; t++) {
      const q = game.choices.find((c) => c.act === 'arc' && c.arg === arc)
      if (q) { asks++; await game.send(q) } else await game.send({ text: 'Алик, что с деньгами?', tone: 'neutral' })
      game.S.offlineDays = 0 // ждём не «пропажи», а вопросов игрока
    }
    return asks
  }

  it('«Нива выбрала тебя»: 4 вопроса кнопкой — порог шпаргалки набран, а не подставлен тестом (#763)', async () => {
    const { game } = makeGame()
    await game.playArc('niva') // линия началась
    expect(await askLine(game, 'niva', 4)).toBeGreaterThanOrEqual(4)
    expect(Number(game.S.mem['asked.niva'])).toBeGreaterThanOrEqual(4)
    toLast(game, 'niva')
    await game.playArc('niva')
    expect(game.S.mem['finale.niva'], 'частный финал, а не обычный «Не ищи»').toBe('chose')
  })

  it('НС: 3 вопроса кнопкой — порога 4 ещё нет, обычный финал «Не ищи» (#763)', async () => {
    const { game } = makeGame()
    await game.playArc('niva') // линия началась
    expect(await askLine(game, 'niva', 3)).toBeGreaterThanOrEqual(3)
    expect(Number(game.S.mem['asked.niva'])).toBe(3) // ровно три: четвёртый вопрос не задан
    toLast(game, 'niva')
    await game.playArc('niva')
    expect(game.S.mem['finale.niva']).toBe('default')
  })

  it('«Бригадир»: 6 вопросов кнопкой — тот же класс условия', async () => {
    // сид подобран замером после #824: с окном повтора вопрос возвращается реже, и партия должна
    // успеть набрать шесть вопросов, пока контекст Бориса в розыгрыше (без окна хватало любого)
    // сид перемерен после #826, #882 и #887 (дедуп тем в блоке сдвинул розыгрыш):
    // 4 даёт шесть вопросов (замер 1–10: 4, 5, 6, 9 — шесть; 1–3, 8, 10 — пять)
    const { game } = makeGame({ seed: 4 })
    await game.playArc('boris')
    expect(await askLine(game, 'boris', 6)).toBeGreaterThanOrEqual(6)
    expect(Number(game.S.mem['asked.boris'])).toBeGreaterThanOrEqual(6)
    toLast(game, 'boris')
    await game.playArc('boris')
    expect(game.S.mem['finale.boris']).toBe('brigadir')
  })

  it('повторный вопрос в тот же день по-прежнему отвечает «пока без новостей» и не глотает серию', async () => {
    const { game } = makeGame()
    await game.playArc('niva')
    await game.fire('PlayerSays', { intent: 'arc', arg: 'niva' }) // серия по вопросу
    const i = game.S.arcs.niva.i
    await game.fire('PlayerSays', { intent: 'arc', arg: 'niva' }) // второй раз в тот же день
    expect(game.S.arcs.niva.i, 'серия не проглочена').toBe(i)
    expect(Number(game.S.mem['asked.niva'])).toBe(2) // счётчик копится, серия — нет
  })
})

describe('«Бараном»: барахолка доходит до игрока до Дня выплаты (#762)', () => {
  // При весе 1 (как у прочих сцен) и перерыве 25 дней барахолка открывалась до Дня выплаты лишь
  // в 13 из 40 направленных партий «за Бориса» (в 10–14 сидах из 24 — ни разу), и товарный приоритет
  // из #752 не успевал сработать. Вес 5 и перерыв 12 дней (src/content/rules/world.ts) — по тому же замеру.
  // Здесь сам путь игрока: направленные партии до Дня выплаты и обмен бараном до экрана «Бараном».

  /** Живая партия длиннее одного заряда телефона — иначе ходы после разряда молча не отправляются. */
  const recharge = async (game: Game): Promise<boolean> => {
    if (!game.battery.dead) return false
    await game.battery.charge()
    return true
  }

  /** Направленный игрок «за Бориса»: спрашивает про Бориса кнопкой, проходит сцены, играет до Дня выплаты. */
  async function playToPayday(game: Game, maxTurns = 200): Promise<{ barter: number; payday: number | null }> {
    await game.playArc('boris') // линия Бориса началась — ворота барана открыты
    let barter = 0
    game.rules.tracer = (t) => { if (t.chosen.length && t.event === 'PickScene' && t.chosen[0] === 'Scene_barter') barter++ }
    let payday: number | null = null
    for (let t = 0; t < maxTurns; t++) {
      if (await recharge(game)) continue
      if (game.S.mem.payday !== undefined || game.S.scene?.id === 'payday' || game.S.mem['payday.at'] !== undefined) { payday = game.S.day; break }
      const opts = game.choices
      if (game.S.scene) {
        const sid = game.S.scene.id
        const good = String((game.S.scene.vars as { n?: string }).n ?? '')
        const go = sid === 'barter' ? (good.includes('Борис') ? 'take' : 'refuse') : opts[0]?.go
        const c = go ? opts.find((x) => x.go === go) : undefined
        if (c) await game.send(c)
        else if (opts[0]) await game.send(opts[0])
      } else {
        const q = opts.find((c) => c.act === 'arc' && c.arg === 'boris')
        await game.send(q ?? { text: 'Алик, ну как там?', tone: 'neutral' })
      }
      game.S.offlineDays = 0
    }
    return { barter, payday }
  }

  it('барахолка открывается до Дня выплаты: сиды подобраны замером на текущем розыгрыше', async () => {
    // Сиды пересняты после #890 (пулы срока сдвинули розыгрыш; замер 1–16): 1, 6 и 7 доходят
    // до Дня выплаты, и барахолка в них показана. 3 и 5 с прошлого замера больше не сходятся.
    // #907 (арка Гарика выросла на серию) сдвинула розыгрыш снова — замер 1–16: 1, 3 и 7 доходят
    // до выплаты, барахолка показана; 6 с прошлого замера барахолку больше не показывает.
    // #926 (гейты follow Бориса + две безгейтные формулировки ёмкости пула) — замер 1–16:
    // не доходят только 4 и 10; 3, 6 и 7 доходят до выплаты, барахолка показана.
    // #920 (кнопки предложения и козы, доля дома) вместе с #927 (реакции на системные
    // события) на слитом состоянии — замер 1–24: не доходят 8, 13 и 18–21; 1, 3 и 7
    // доходят до выплаты, барахолка показана.
    // #919 (гейты денежного вопроса «Нивы») на слитом с #920/#927 состоянии — замер 1–24:
    // до выплаты не дошли 2, 9, 12, 20 и 21; 1, 3 и 7 доходят, барахолка показана.
    // #918 («Лет двадцать?» ждёт сравнения с коньяком) вместе с #919/#946 — замер 1–24:
    // до выплаты не дошёл 11; барахолка не показана в 2, 8, 12, 13, 15, 16 и 21;
    // 1, 3 и 7 доходят до выплаты, барахолка показана.
    // #953 (окна вопроса Рубика и чайника) — замер 1–24: не доходят 1, 2, 8, 16 и 21;
    // 3, 6 и 7 доходят до выплаты, барахолка показана.
    // #962 (окна объявлений места денег) сдвинула розыгрыш — замер 1–24: до выплаты не дошёл 11,
    // барахолка не показана в 6, 10 и 16; 1, 3 и 7 доходят до выплаты, барахолка показана.
    // #973 (окна дебютов участников) сдвинула розыгрыш — замер 1–24: не доходят 7, 9, 11, 12 и 18–21;
    // 1, 3 и 6 доходят до выплаты, барахолка показана.
    // #981 (окна follow-пула бетона и штампы легенды места) сдвинула розыгрыш — замер 1–24: не доходят
    // 1, 7, 9, 11, 12 и 21; 2, 3 и 6 доходят до выплаты, барахолка показана.
    // #983 (окно первого «Би-бип» «Нивы») поверх #981 — замер 1–24: не доходят 7, 9, 11, 12, 21 и 24;
    // барахолка не показана в 3, 4 и 8; 1, 2 и 6 доходят до выплаты, барахолка показана.
    // #995 (окно свежести follow-пулов банка) сдвинула розыгрыш — замер 1–24: не доходят 1, 2, 6, 8 и 21,
    // барахолка не показана в 3 и 14; 4, 5 и 7 доходят до выплаты, барахолка показана.
    // #1003 (окно отклика на перевод 50 ₽) сдвинуло розыгрыш — замер 1–24: не доходят 1, 5, 8, 10, 15, 18, 22 и 24,
    // барахолка не показана в 6 и 21; 2, 3 и 4 доходят до выплаты, барахолка показана.
    // #1002 (разметка плавающих сроков) сдвинула розыгрыш — замер 1–24: не доходят 3, 8, 10, 12, 13 и 22,
    // барахолка не показана в 6, 21 и 23; 1, 2 и 4 доходят до выплаты, барахолка показана.
    // #1001 (место Бориса в формулировках) поверх #1002 — замер 1–24: не доходят 3, 8, 10 и 12,
    // барахолка не показана в 9 и 16; 1, 2 и 4 доходят до выплаты, барахолка показана.
    // #1030 (окно конца квеста «мама на рынке») сдвинуло розыгрыш — замер 1–24: не доходят 2 и 5,
    // барахолка не показана в 7, 15, 17 и 21; 1, 3 и 4 доходят до выплаты, барахолка показана.
    // #1071 (окно дебюта Нуне) сдвинуло розыгрыш — замер 1–24: не доходят 1, 7, 18, 19 и 24;
    // 2, 3 и 4 доходят до выплаты, барахолка показана.
    // #1082 (гейт «Тогда и долги его живы?» и безгейтный вопрос «как там» у дедушки) сдвинул розыгрыш —
    // замер 1–24: до выплаты не доходят 1, 18, 19 и 24; 2, 3 и 4 доходят, барахолка показана.
    // #1118 (хвост «не помню» по рекорду журнала обещаний — пул P_WHEN_FAR вырос на строку) сдвинул розыгрыш;
    // #1122 (расширение нейтральных пулов) поверх #1118 — замер 1–24: до выплаты не доходят 1, 9, 13, 15, 17,
    // 20, 22 и 23; барахолка не показана в 4 и 16; 2, 3 и 5 доходят до выплаты, барахолка показана.
    // #1148 (цитата «не пишите Алику» в дебюте Нуне ждёт услышанной фразы) сдвинул розыгрыш — замер 1–24:
    // до выплаты не доходят 1, 3, 4, 14, 15, 17, 20, 21, 22 и 23; барахолка не показана в 24;
    // 2, 5 и 6 доходят до выплаты, барахолка показана.
    // #1171 (цитата «деньги — как усы» ждёт прозвучавшей фразы — гейт в P_MOUSTACHE) сдвинул розыгрыш —
    // замер 1–24: до выплаты не доходят 1, 6, 13, 15, 17, 18, 20 и 22; барахолка не показана в 24;
    // 2, 3 и 5 доходят до выплаты, барахолка показана.
    // #1216 (окно кражи плиточной рекламы после q_photo) сдвинул розыгрыш — замер 1–24: до выплаты
    // не доходят 4, 10, 11, 15 и 22; барахолка не показана в 5, 15, 19 и 22; 1, 2 и 3 доходят до выплаты,
    // барахолка показана.
    // #1255 (карандашом без числа дней у срока с одной оценкой — пул P_WHEN_PENCIL_GUESS) сдвинул розыгрыш —
    // замер 1–24: до выплаты не доходит 10; барахолка не показана в 2 и 15; 1, 3 и 4 доходят до выплаты,
    // барахолка показана.
    // #1270 (кнопки-действия окон событий без хвостов — пул окна больше не тратит розыгрыши на суффикс)
    // сдвинул розыгрыш — замер 1–24: до выплаты не доходят 1, 7, 13 и 17; барахолка не показана в 5 и 6;
    // 2, 3 и 4 доходят до выплаты, барахолка показана.
    // #1283 (пул окна события не повторяет строку: исчерпанный в окне пул молчит, вместо рефилла колоды)
    // сдвинул розыгрыш — замер 1–24: до выплаты не доходят 7, 9, 14 и 24; барахолка не показана в 3;
    // 1, 2, 4, 5, 6, 8 и 10–23 доходят до выплаты, барахолка показана.
    // Проверка та же: партия доходит до выплаты и сцена показана.
    for (const seed of [2, 4, 5]) {
      const { game } = makeGame({ seed })
      const r = await playToPayday(game)
      expect(r.payday, `сид ${seed}: партия не дошла до Дня выплаты — проверка была бы пустой`).not.toBeNull()
      expect(r.barter, `сид ${seed}: барахолка ни разу до Дня выплаты`).toBeGreaterThan(0)
    }
  }, 120_000)

  it('обмен бараном доходит до экрана «Бараном»', async () => {
    // #1002 (разметка сроков сдвинула розыгрыш) — замер 1–8: сид 1 перестал доходить до барана
    // (has.boris=false, объявление не глушится); 7 и 8 доходят до экрана, взят 7 (2–6 уже были у этой строки в истории)
    const { game } = makeGame({ seed: 7 })
    await game.playArc('boris')
    let bought = false
    for (let t = 0; t < 200 && !bought; t++) {
      if (await recharge(game)) continue
      const opts = game.choices
      if (game.S.scene?.id === 'barter') {
        const baran = String((game.S.scene.vars as { n?: string }).n ?? '').includes('Борис')
        const c = opts.find((x) => x.go === (baran ? 'take' : 'refuse'))
        expect(c, baran ? 'Барахолка не предложила барана первым' : 'Барахолка: нет отказа').toBeDefined()
        await game.send(c!)
        bought = baran
      } else if (game.S.scene) {
        if (opts[0]) await game.send(opts[0])
      } else {
        // вопросов кнопкой нет нарочно: `asked.boris ≥ 6` включил бы «Бригадира» — это задача #759
        await game.send({ text: 'Алик, ну как там?', tone: 'neutral' })
      }
      game.S.offlineDays = 0
    }
    expect(bought, 'барахолка так и не предложила барана').toBe(true)
    expect(game.facts()['has.boris'], 'факт «Борис у игрока»').toBe(true)
    // направленный прогон: после «Получено: баран Борис» объявление Алика о продаже не приходит (#856)
    const ads = game.lines.eligible('NOTIF', NOTIF, game.lineFacts()).map((p) => p.text)
    expect(ads, 'баран у игрока — Алик его больше не продаёт').not.toContain('Новое объявление рядом: «Продаю барана Бориса, торг, умеет писать».')
    toLast(game, 'boris')
    await game.playArc('boris')
    expect(game.S.mem['finale.boris']).toBe('toyou')
    game.nextDay(Math.max(0, ENDING_MIN_DAY - game.day))
    await game.fire('CheckEnding')
    expect(game.S.ending).toBe('ram')
  }, 120_000)
})
