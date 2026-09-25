// Разные финалы сериалов и концовки игры: выбор по поведению игрока, память, эффекты.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { ARCS, ARC_DONE, CAST } from './arcs'
import { ACH } from './achievements'
import { FINALES, ENDINGS, DEFAULT_FINALE } from './finales'
import type { Game } from '../engine/game'
import { valueOf } from '../engine/rules'
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
        for (const m of f.m.map(valueOf)) if (typeof m !== 'string') expect(CAST[m.w], m.w).toBeDefined()
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
      const from = game.S.msgs.length
      await game.playArc(id)
      expect(said(game, from), id).toEqual(expect.arrayContaining(fitting(game, ARCS[id].eps.at(-1)!)))
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
        const from = game.S.msgs.length
        await game.playArc(arc)
        expect(game.S.mem['finale.' + arc], `${arc}.${f.id}`).toBe(f.id)
        expect(said(game, from)).toEqual(expect.arrayContaining(fitting(game, f)))
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
    const { game } = makeGame()
    SETUP['samvel.tamada'](game)
    SETUP['samvel.groom'](game)
    toLast(game, 'samvel')
    await game.playArc('samvel')
    expect(game.S.mem['finale.samvel']).toBe('groom')
    expect(game.S.mem['wedding.anush']).toBe(true)
    expect(game.S.mem['wedding.samvel']).toBeUndefined()
    // свадьба игрока окрашивает ходы своим правилом, не Самвела (#256)
    game.S.arcs.beton = { i: 1, last: 0 }
    let noise = 0
    for (let i = 0; i < 150; i++) {
      game.S.stats.sent += 4
      if (game.rules.match({ event: 'AlikTurn' }, game.facts())?.name === 'Turn_Wedding_Anush') noise++
    }
    expect(noise).toBeGreaterThan(3)
  })
  it('грубил хоть раз — в женихи не берут', async () => {
    const { game } = makeGame()
    SETUP['samvel.groom'](game)
    game.S.mem['count.rude'] = 1
    toLast(game, 'samvel')
    await game.playArc('samvel')
    expect(game.S.mem['finale.samvel']).toBe('default')
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
  it('«деньги в фундаменте» противоречит «банке с огурцами»', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в банке с огурцами.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: lines(ARCS.beton.eps[0])[1] })
    expect(game.S.mem['lie.old']).toBe('money_jar')
  })
})

describe('концовки игры', () => {
  const check = async (game: Game) => { await game.fire('CheckEnding'); return game.S.ending }
  const late = () => { const t = makeGame(); t.game.S.day = 320; return t }
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
  it('до ~300-го дня концовок нет: это развязка, а не начало', async () => {
    const { game } = makeGame()
    game.S.mem['finale.samvel'] = 'groom'
    expect(await check(game)).toBeNull()
  })
  it('редкое сочетание побеждает: «Честные деньги» раньше частичных', async () => {
    const { game } = late()
    Object.assign(game.S.mem, { 'finale.boris': 'brigadir', 'finale.grant': 'ally', 'finale.niva': 'chose' })
    expect(await check(game)).toBe('honest')
  })
  it('каждую концовку можно получить', async () => {
    const setups: Record<string, (g: Game) => void | Record<string, unknown>> = {
      family: (g) => { g.S.mem['finale.samvel'] = 'groom' },
      heir: (g) => { g.S.mem['finale.alik_death'] = 'will' },
      ram: (g) => { g.S.mem['finale.boris'] = 'toyou'; g.S.items.push('баран Борис', '½ фундамента') },
      alik: (g) => { g.S.mem['finale.garik'] = 'cutter'; g.S.ach.fence = 190 },
      honest: (g) => Object.assign(g.S.mem, { 'finale.boris': 'brigadir', 'finale.grant': 'ally', 'finale.niva': 'chose' }),
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
      ram: [finale('boris.toyou'), finale('niva.chose')], // второй трофей — «Нива»
      alik: [async (g) => { g.S.ach.fence = 190 }, finale('garik.cutter')],
      honest: [finale('boris.brigadir'), finale('grant.ally'), async (g) => { g.S.mem['asked.niva'] = 5; toLast(g, 'niva'); await g.playArc('niva') }],
      vendetta: [async (g) => { Object.assign(g.S.mem, { 'count.rude': 25, 'rude.heat': 5 }); await g.send({ text: 'АЛИК!!! ТЫ ВРЁШЬ!!!', tone: 'rude' }); expect(g.S.mem.vendetta).toBe(true) }],
      // единственная концовка эндгейма: группа открылась выплатой и живёт до 800-го дня
      multiverse: [async (g) => { await payday(false)(g); g.closeEnding(); expect(g.S.mem['endgame.active']).toBe(true) }],
      payday_default: [payday(false)],
      payday_coins: [contra, payday(true)],
      payday_lavash: [contra, async (g) => { g.S.mem['crypto.hodl'] = true }, payday(true)],
      payday_niva: [async (g) => { g.S.mem['asked.niva'] = 5; toLast(g, 'niva'); await g.playArc('niva') }, payday(false)],
      payday_strasbourg: [async (g) => { g.S.mem.court = 5; await threat(g); expect(g.S.ach.strasbourg).toBeDefined() }, payday(false)],
      payday_notyou: [async (g) => { toLast(g, 'razmik'); await g.playArc('razmik'); g.S.mem['count.rude'] = 8 }, payday(false)],
      payday_real: [async (g) => { Object.assign(g.S.ach, { saint: 190, court: 200, q_hash: 1, q_mama: 1, q_goat: 1, q_parking: 1, q_photo: 1 }); g.S.mem.caught = 3 }, payday(false)],
    }
    expect(Object.keys(SCENARIO).sort()).toEqual(ENDINGS.map((e) => e.id).sort())
    /** Нижняя граница, которую ставит условие концовки: gte(key, n) → n. */
    const floor = (e: (typeof ENDINGS)[number], key: string) => Math.max(0, ...e.when.filter((c) => c.key === key && c.op === '>=').map((c) => Number(c.value)))
    const forcing = (g: Game) => g.rules.all.filter((r) => r.event === 'StoryBeat' && r.name.startsWith('Beat_Payday')).map((r) => r.name)
    expect(forcing(makeGame().game)).toEqual(['Beat_Payday', 'Beat_Payday_Late']) // пустой список сторожил бы вакуум
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
