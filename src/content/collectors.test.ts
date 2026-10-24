// Коллекторы после credit.broke: мини-сериал, перевербовка, микрозайм молчит (#128).
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney, cards } from '../test/helpers'
import { START_DAY, ARC_MARINATION_DAYS } from '../engine/state'
import { alikShaved, collectorsRecruited, collectorsTea, collectorsTurned, count, creditBroke, creditStage, endgame, finaleOf, internAccepted, internAt, internDeclined, intro, moustachePhotoAt, paydayScene, threatClaim, collectorsEpAt } from './memkeys'
import { loanTaken, loanDueAt } from './credit'
import { D } from './excuses'
import { P_COLLECTORS_DEBUT } from './rules/player-choice-pools'
import type { Game } from '../engine/game'
import { NOTIF } from './life'
import { ARC_DONE, ARCS, GROUP } from './arcs'
import { FINALES } from './finales'
import { meet } from './world'
import { is, isOpen, spec, test, valueOf, type Entry, type Facts, type Line } from '../engine/rules'
import { collectorsEpPool } from './player-pools'
import { ENDGAME_ARCH } from './endgame'
import { playtest } from '../tools/playtest'

const texts = (g: ReturnType<typeof makeGame>['game'], from = 0) =>
  g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))

describe('коллекторы (#128)', () => {
  it('на свежей партии коллекторы молчат', () => {
    const { game } = makeGame()
    expect(game.canSpeak('collectors')).toBe(false)
  })

  it('без credit.broke сериал в пуле nextArc не появляется', () => {
    const { game } = makeGame()
    game.S.day = START_DAY + ARC_MARINATION_DAYS // окно маринования первой арки (#1004) не предмет этой проверки
    expect(game.availableArcs()).not.toContain('collectors')
    game.S.mem[creditBroke] = true
    expect(game.availableArcs()).toContain('collectors')
    game.S.mem[endgame.active] = true
    expect(game.availableArcs()).not.toContain('collectors')
  })

  it('линия: broke → серии → recruited; долг Алика не двигается; микрозайм молчит', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.mem[loanTaken('micro')] = true
    game.S.mem[loanDueAt('micro')] = game.S.day
    setMoney(game, 500)
    const debt0 = game.S.debt
    const money0 = game.S.money
    for (let i = 0; i < 5; i++) {
      await game.playArc('collectors')
      game.S.day += 3
    }
    expect(game.S.mem[intro('collectors')]).toBe(true)
    expect(game.S.mem[collectorsRecruited]).toBe(true)
    expect(game.canSpeak('collectors')).toBe(true)
    expect(game.S.ach.arc_collectors).toBeDefined()
    expect(game.S.debt).toBe(debt0)
    game.chargeCredit('micro')
    expect(game.S.money).toBe(money0) // платёж не списан
    expect(game.S.mem[loanDueAt('micro')]).toBeUndefined()
  })

  it('Beat_Collectors стартует сериал после broke', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.stats.sent = 10
    const r = await game.fire('StoryBeat')
    expect(r?.name).toBe('Beat_Collectors')
    expect(game.S.arcs.collectors?.i).toBe(1)
    expect(texts(game).some((t) => /Деньги-Ара|философствуем/.test(t))).toBe(true)
  })

  it('в окне смерти коллекторы не стартуют и не продолжают (#397)', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.mem.alik_dead = true
    game.S.stats.sent = 10
    expect((await game.fire('StoryBeat'))?.name).not.toBe('Beat_Collectors')
    expect(game.S.arcs.collectors).toBeUndefined()
    game.S.arcs.collectors = { i: 2, last: game.S.day - 5 }
    game.S.day += 3
    game.S.stats.sent++
    for (let i = 0; i < 12; i++) {
      expect((await game.fire('StoryBeat'))?.name).not.toBe('Beat_CollectorsNext')
      game.S.day++; game.S.stats.sent++
    }
    expect(game.S.arcs.collectors.i).toBe(2)
  })

  // playArc не сверяется с availableArcs — старт держит только when правила; NC: when → [] красит оба случая
  it('гейт старта: без broke и в эндгейме Beat_Collectors молчит', async () => {
    const beats = async (g: ReturnType<typeof makeGame>['game']) => {
      const names: string[] = []
      for (let i = 0; i < 12; i++) { names.push((await g.fire('StoryBeat'))?.name ?? '-'); g.S.day += 2; g.S.stats.sent++ }
      return names
    }
    const fresh = makeGame().game
    fresh.S.stats.sent = 10
    expect(await beats(fresh)).not.toContain('Beat_Collectors')
    expect(fresh.S.arcs.collectors).toBeUndefined()
    const late = makeGame().game
    late.S.stats.sent = 10
    late.S.mem[creditBroke] = true
    late.S.mem[endgame.active] = true
    expect(await beats(late)).not.toContain('Beat_Collectors')
    expect(late.S.arcs.collectors).toBeUndefined()
  })

  it('начатая линия идёт своим битом: серия не чаще раза в 3 дня, развязка за пару десятков ходов (#324)', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.stats.sent = 10
    await game.fire('StoryBeat')
    expect(game.S.arcs.collectors?.i).toBe(1)
    // в тот же день вторая серия не идёт — NC: снять is('collectorsCanAdvance') из Beat_CollectorsNext
    for (let i = 0; i < 6; i++) { game.S.stats.sent++; await game.fire('StoryBeat') }
    expect(game.S.arcs.collectors?.i).toBe(1)
    const days = [game.S.arcs.collectors!.last]
    const names = new Set<string>()
    for (let i = 0; i < 60 && game.S.arcs.collectors!.i < 5; i++) {
      game.S.day++
      game.S.stats.sent++
      const r = await game.fire('StoryBeat')
      if (r) names.add(r.name)
      if (game.S.scene) game.S.scene = null // игрок отвечает на сцену квеста: пока она открыта, StoryBeat молчит (floor cinematic)
      if (game.S.arcs.collectors!.last !== days.at(-1)) days.push(game.S.arcs.collectors!.last)
    }
    expect(game.S.arcs.collectors?.i).toBe(5)
    expect(game.S.mem[collectorsRecruited]).toBe(true)
    expect(names).toContain('Beat_CollectorsNext')
    expect(days.length).toBe(5)
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(3)
    expect(days[4] - days[0]).toBeLessThanOrEqual(40)
  })

  it('в эндгейме линия не продолжается', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.stats.sent = 10
    await game.fire('StoryBeat')
    game.S.mem[endgame.active] = true
    // поведение держит Endgame_Formality (специфичность 100 забирает StoryBeat целиком), а не критерий бита:
    // снятие missing(endgame.active) с Beat_CollectorsNext здесь не краснит — потому его критерий проверяется ниже отдельно
    for (let i = 0; i < 40; i++) { game.S.day++; game.S.stats.sent++; await game.fire('StoryBeat') }
    expect(game.S.arcs.collectors?.i).toBe(1)
  })

  it('старт и бит сами объявляют «не в эндгейме» и «не мёртв» — NC: снять missing(endgame.active) / missing(alik_dead)', () => {
    const { game } = makeGame()
    const whenOf = (name: string) => game.rules.rules('StoryBeat').find((r) => r.name === name)!.when
    const open = (name: string, f: Facts) => whenOf(name).every((c) => test(c, f))
    expect(open('Beat_Collectors', { [creditBroke]: true })).toBe(true)
    expect(open('Beat_Collectors', { [creditBroke]: true, [endgame.active]: true })).toBe(false)
    expect(open('Beat_Collectors', { [creditBroke]: true, alik_dead: true })).toBe(false)
    const going = { 'arc.collectors': 2, collectorsCanAdvance: true }
    expect(open('Beat_CollectorsNext', going)).toBe(true)
    expect(open('Beat_CollectorsNext', { ...going, [endgame.active]: true })).toBe(false)
    expect(open('Beat_CollectorsNext', { ...going, alik_dead: true })).toBe(false)
  })

  it('уведомление «где живёт ваш Алик» — эхо второй серии, не после выплаты и не в эндгейме (#324)', () => {
    const n = NOTIF.find((x) => /где живёт ваш Алик/.test(x.t))!
    const open = (f: Facts) => (n.when ?? []).every((c) => test(c, f))
    expect(open({ 'arc.collectors': 2 })).toBe(true)
    expect(open({})).toBe(false) // до линии: broke, но серии нет
    expect(open({ 'arc.collectors': 1 })).toBe(false) // спрашивают «где он?» — ещё не знают
    expect(open({ 'arc.collectors': 3 })).toBe(false) // уже у Алика
    expect(open({ 'arc.collectors': 2, [paydayScene]: 'payday' })).toBe(false)
    expect(open({ 'arc.collectors': 2, [endgame.active]: true })).toBe(false)
  })

  it('угроза коллекторами: «остались работать» только после recruited', () => {
    const line = (D.THREAT_A as Entry<unknown>[]).find((e) => /Остались работать/.test(String(valueOf(e))))!
    expect(isOpen(line, { [threatClaim]: 'collectors' })).toBe(false)
    expect(isOpen(line, { [threatClaim]: 'collectors', [collectorsRecruited]: true })).toBe(true)
  })

  it('«Пусть сначала найдут» — пока не приехали; «чай пьют» — у Алика до перевербовки (#324)', () => {
    const find = (re: RegExp) => (D.THREAT_A as Entry<unknown>[]).find((e) => re.test(String(valueOf(e))))!
    const claim = { [threatClaim]: 'collectors' }
    const seek = find(/Пусть сначала найдут/)
    expect(isOpen(seek, claim)).toBe(true) // линии ещё нет
    expect(isOpen(seek, { ...claim, 'arc.collectors': 2 })).toBe(true)
    expect(isOpen(seek, { ...claim, 'arc.collectors': 3 })).toBe(false) // «Мы приехали к Алику»
    const tea = find(/чай пьют/)
    expect(isOpen(tea, { ...claim, 'arc.collectors': 2 })).toBe(false)
    expect(isOpen(tea, { ...claim, 'arc.collectors': 3 })).toBe(true)
    expect(isOpen(tea, { ...claim, 'arc.collectors': 4, [collectorsRecruited]: true })).toBe(false)
  })

  it('GROUP: требование долга — только до вербовки; «свои» — только после (#468)', () => {
    const debt = (GROUP.collectors as Entry<unknown>[]).filter((e) => /задолженност|Долг — он и в чате/.test(String(valueOf(e))))
    const ours = (GROUP.collectors as Entry<unknown>[]).filter((e) => /мы теперь свои|Смена на объекте/.test(String(valueOf(e))))
    expect(debt.length).toBe(2)
    expect(ours.length).toBe(2)
    for (const e of debt) {
      expect(isOpen(e, {}), 'до знакомства/вербовки долг открыт').toBe(true)
      expect(isOpen(e, { [collectorsRecruited]: true }), 'после вербовки долг закрыт').toBe(false)
    }
    for (const e of ours) {
      expect(isOpen(e, {}), 'без вербовки «свои» закрыты').toBe(false)
      expect(isOpen(e, { [collectorsRecruited]: true })).toBe(true)
    }
  })

  it('GROUP и ARC_DONE: после разворота «свои» закрыты, взыскание для игрока открыто (#679)', () => {
    const gated = (arr: Entry<unknown>[], re: RegExp) => arr.filter((e) => re.test(String(valueOf(e))))
    const ours = gated(GROUP.collectors as Entry<unknown>[], /мы теперь свои|Смена на объекте/)
    const turned = gated(GROUP.collectors as Entry<unknown>[], /взыскиваем в пользу плиточника|Чай длинный/)
    expect(ours.length).toBe(2)
    expect(turned.length).toBe(2)
    for (const e of ours) expect(isOpen(e, { [collectorsRecruited]: true, [collectorsTurned]: true }), 'после разворота «свои» закрыты').toBe(false)
    for (const e of turned) {
      expect(isOpen(e, { [collectorsRecruited]: true }), 'до разворота взыскание для игрока закрыто').toBe(false)
      expect(isOpen(e, { [collectorsRecruited]: true, [collectorsTurned]: true })).toBe(true)
    }
    // обычный финал разворачивает взыскание; до разворота ARC_DONE держит «свои», после — работу на игрока
    const doneOurs = gated(ARC_DONE.collectors as Entry<unknown>[], /Мои\. Месят|У них смена/)
    const doneTurned = gated(ARC_DONE.collectors as Entry<unknown>[], /в твою пользу|твоё дело/)
    expect(doneOurs.length).toBe(2)
    expect(doneTurned.length).toBe(2)
    for (const e of doneOurs) expect(isOpen(e, { [collectorsTurned]: true })).toBe(false)
    for (const e of doneTurned) {
      expect(isOpen(e, {}), 'до разворота ответы про взыскание закрыты').toBe(false)
      expect(isOpen(e, { [collectorsTurned]: true })).toBe(true)
    }
  })

  it('разворот взыскания и финал по грубости (#679)', async () => {
    // без грубости: обычный финал — разворот, факт разворота стоит
    const plain = makeGame().game
    plain.S.arcs.collectors = { i: 4, last: -99 }
    plain.S.mem[collectorsRecruited] = true
    const before = plain.S.msgs.length
    await plain.playArc('collectors')
    expect(plain.S.mem['finale.collectors']).toBe('default')
    expect(plain.S.mem[collectorsTurned]).toBe(true)
    expect(texts(plain, before).some((t) => /взыскиваем для вас/.test(t))).toBe(true)
    // грубость ниже порога — ещё разворот
    const nearly = makeGame().game
    nearly.S.arcs.collectors = { i: 4, last: -99 }
    nearly.S.mem[collectorsRecruited] = true
    nearly.S.mem['count.rude'] = 5
    await nearly.playArc('collectors')
    expect(nearly.S.mem['finale.collectors']).toBe('default')
    expect(nearly.S.mem[collectorsTurned]).toBe(true)
    // порог грубости достигнут — стажёрский финал вместо разворота, факт разворота не стоит
    const rude = makeGame().game
    rude.S.arcs.collectors = { i: 4, last: -99 }
    rude.S.mem[collectorsRecruited] = true
    rude.S.mem['count.rude'] = 6
    const from = rude.S.msgs.length
    await rude.playArc('collectors')
    expect(rude.S.mem['finale.collectors']).toBe('intern')
    expect(rude.S.mem[collectorsTurned]).toBeUndefined()
    expect(texts(rude, from).some((t) => /Стажировка — три чая/.test(t))).toBe(true)
  })

  it('в партиях ботом завербованные коллекторы в групповом чате долг не требуют (#493)', async () => {
    const debtRe = /задолженност|Долг — он и в чате/
    const after: string[] = []
    // групповой чат с завербованными коллекторами редок: партии идут, пока не наберётся выборка, а не по трём заранее найденным сидам
    for (let seed = 65001; seed <= 65040 && after.length < 2; seed++) {
      const { game } = await playtest(seed, 300)
      // реплики коллекторов внутри группового чата — после факта вербовки, который поставила серия
      let inGroup = false, recruitedAt = Infinity
      for (const [i, m] of game.S.msgs.entries()) {
        if (m.kind === 'sys' && /добавил вас в группу/.test(m.text)) inGroup = true
        if (m.kind === 'sys' && /удалил вас из группы/.test(m.text)) inGroup = false
        if (m.kind === 'text' && m.who === 'collectors' && /Мы остаёмся у Алика/.test(m.text)) recruitedAt = Math.min(recruitedAt, i)
        if (inGroup && i > recruitedAt && m.kind === 'text' && m.who === 'collectors') after.push(m.text)
      }
    }
    expect(after.length, 'в выборке нет групповых реплик завербованных коллекторов — проверка была бы пустой').toBeGreaterThan(0)
    expect(after.filter((t) => debtRe.test(t))).toEqual([])
  }, 600_000)

  it('групповой чат ходом партии: до вербовки требуют долг, после — нет (#468)', async () => {
    const debtRe = /задолженност|Долг — он и в чате/
    const oursRe = /мы теперь свои|Смена на объекте|Раствор месим/
    const runGroup = async (recruited: boolean) => {
      const { game } = makeGame({ seed: recruited ? 11 : 7 })
      game.rules.applyOps(meet('collectors'), {})
      if (recruited) game.S.mem[collectorsRecruited] = true
      game.S.stats.sent = 10
      // ход через fire → recoverTurn (не прямой groupChat)
      game.rules.add({
        name: 'Test_ForceGroup468', event: 'AlikTurn', when: [], specificity: 99,
        respond: async ({ game: g }) => { await g.groupChat() },
      })
      const n = game.S.msgs.length
      await game.fire('AlikTurn')
      return game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.who === 'collectors' ? [m.text] : []))
    }
    const before = await runGroup(false)
    expect(before.some((t) => debtRe.test(t)), before.join(' | ')).toBe(true)
    expect(before.some((t) => oursRe.test(t))).toBe(false)
    const after = await runGroup(true)
    expect(after.some((t) => debtRe.test(t)), after.join(' | ')).toBe(false)
    expect(after.some((t) => oursRe.test(t)), after.join(' | ')).toBe(true)
  })
})

describe('вопрос про коллекторов — окно повтора follow-пула (#1291)', () => {
  const LINE = 'Теперь они работают на меня? И отчего долг всё равно растёт?'
  /** Кнопка вопроса про текущий сериал: `act: 'arc'`, `arg: 'collectors'` (offer `Arc`). */
  const ask = (g: Game) => {
    g.S.choices = null
    return g.buildChoices().find((c) => c.act === 'arc' && c.arg === 'collectors')?.text
  }

  it('строка follow не возвращается внутри 20 ходов и возвращается за окном', () => {
    // #1289 накрыл follow-путь: `Opt_Arc` берёт строку через `freshPlayer` (#824/#1078). Проверка
    // закрепляет это на пуле коллекторов: раунды 119–121 видели «Теперь они работают на меня?» ×3
    // за три хода — маркер того класса, что окно события не держит.
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.mem[collectorsRecruited] = true
    game.S.mem[collectorsTurned] = true
    game.S.arcs.collectors = { i: 2, last: 0 }
    game.S.day = 10
    game.S.ctx = { arc: 'collectors' }
    const shown: { t: string; at: number }[] = []
    for (let turn = 0; turn < 60; turn++) {
      game.S.stats.sent = turn
      const t = ask(game)
      if (t) shown.push({ t, at: turn })
    }
    expect(shown.length, 'вопрос про коллекторов ни разу не предложен — проверка пустеет').toBeGreaterThan(1)
    expect(shown.map((s) => s.t), 'вопрос ушёл из follow-пула — проверка не про ту строку').toContain(LINE)
    const last = new Map<string, number>()
    const bad: string[] = []
    for (const s of shown) {
      const prev = last.get(s.t)
      if (prev !== undefined && s.at - prev < 20) bad.push(`«${s.t}» ходы ${prev}→${s.at}`)
      last.set(s.t, s.at)
    }
    expect(bad.slice(0, 3), 'повтор строки follow внутри окна повтора').toEqual([])
    expect(shown.length, 'за окном пул не вернулся — проверка пустеет').toBeGreaterThan(new Set(shown.map((s) => s.t)).size)
  })
})

describe('дебют коллекторов знает, клиент ли им игрок (#1022)', () => {
  const pool = (g: Game) => g.open(P_COLLECTORS_DEBUT)

  it('«Кто вы и при чём тут я?» — вопрос того, кто займ МФО ещё не брал', () => {
    const fresh = makeGame().game
    expect(fresh.holds(is(loanTaken('micro'))), 'займ в свежей партии — проверка пустеет').toBe(false)
    expect(pool(fresh), 'без займа знакомства нет').toContain('Кто вы и при чём тут я?')
    // клиент: ступени 1–2 пройдены, банк предлагает микрозайм, игрок его берёт настоящей кнопкой
    const client = makeGame().game
    setMoney(client, 100)
    client.S.mem[creditStage] = 2
    client.maybeCreditOffer()
    const card = cards(client, 'Банк').at(-1)!
    client.answerCard(card.id, 'take')
    expect(client.holds(is(loanTaken('micro'))), 'займ МФО не отмечен — проверка пустеет').toBe(true)
    expect(pool(client), 'клиент МФО спрашивает, кто они').not.toContain('Кто вы и при чём тут я?')
    expect(pool(client), 'у клиента нет своей строки').toContain('Я вам должен, а Алик мне. Давайте меняйтесь')
  })
})

describe('окно дебюта коллекторов молчит на исчерпанном пуле (#1078, #824)', () => {
  const debut = (g: Game) => g.buildChoices().find((item) => item.act === 'arc' && item.arg === 'collectors')?.text
  const openPool = (g: Game) => g.open(P_COLLECTORS_DEBUT)

  it('все открытые строки пула в окне — вопроса нет, за окном — строка пула свежей', () => {
    const { game } = makeGame()
    game.S.mem[intro('collectors')] = true
    game.S.mem[loanTaken('micro')] = true
    game.S.arcs.collectors = { i: 1, last: 0 }
    const shown: string[] = []
    for (let i = 0; i < 10; i++) {
      const t = debut(game)
      if (!t) break
      shown.push(t)
    }
    expect(shown.length, 'открытые формулировки пула показаны все').toBe(3)
    expect(new Set(shown).size, 'формулировки свежие, без повторов').toBe(shown.length)
    expect(debut(game), 'в том же ходе пул не повторяется дословно').toBeFalsy()
    expect(game.buildChoices().map((c) => c.text).filter((t) => openPool(game).includes(t)),
      'в блоке нет ни одной строки пула дословно').toEqual([])
    game.S.stats.sent += 10
    expect(debut(game), 'и до окна тоже').toBeFalsy()
    game.S.stats.sent += 10
    const again = debut(game)
    expect(again && shown.includes(again), 'за окном вопрос возвращается строкой пула').toBe(true)
  })
})

describe('дебют коллекторов попадает в блок в единственном кадре окна (#1314)', () => {
  const frame = (g: Game) => { g.S.choices = null; return g.buildChoices() }

  it('после eps[0] вариант о коллекторах стоит в блоке рядом с бонус-5 событием и бонус-2 кнопкой усов', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    // конкуренты того же кадра, что в партии 329117: событие «смена фото» (бонус 5) и долгоживущая
    // кнопка «а усы?» (бонус 2) — при bonus 2 у дебюта была с ней ничья, и слот забирала кнопка
    game.S.mem[moustachePhotoAt] = game.S.stats.sent
    game.S.mem[alikShaved] = true
    game.S.ach.shaved = game.S.day - 1
    expect((await game.fire('StoryBeat'))?.name, 'серия eps[0] не сыграла — проверка пустеет').toBe('Beat_Collectors')
    expect(game.S.mem[intro('collectors')], 'дебют коллекторов не открылся').toBe(true)
    expect(game.S.arcs.collectors?.i, 'серия уже двинула счётчик — кадр не тот').toBe(1)
    const open = game.rules.collect({ event: 'BuildChoices' }, game.facts()).map((r) => r.name)
    expect(open, 'событие-конкурент не открыто — проверка пустеет').toContain('Opt_MoustachePhoto')
    expect(open, 'кнопка усов не открыта — проверка пустеет').toContain('Opt_Moustache')
    const debut = frame(game).find((c) => c.act === 'arc' && c.arg === 'collectors')
    expect(debut, 'в кадре дебюта варианта о коллекторах нет').toBeTruthy()
    expect(game.open(P_COLLECTORS_DEBUT), 'вариант не из пула дебюта').toContain(debut!.text)
  })
})

describe('«три чашки чая» ждёт предложения стажировки (#1036)', () => {
  const LINE = '«Деньги-Ара» — три чашки чая? И всё это в мой долг?'
  const pool = (g: Game) => g.open(ARCS.collectors.follow)

  it('до финала арки строка молчит, после предложения стажировки — звучит; пул не пустеет', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.arcs.collectors = { i: 2, last: 0 }
    expect(game.holds(is(internAt)), 'стажировка в свежей партии — проверка пустеет').toBe(false)
    expect(pool(game), 'число «три» звучит до предложения стажировки').not.toContain(LINE)
    // до финала пул держит безгейтный сосед: вопрос про коллекторов не пропадает
    // (строк в пуле стало на одну меньше после гейта «чая длинного» на сцену чая, #1158)
    expect(pool(game), 'follow обескровлен гейтом — вопроса про коллекторов не осталось').toContain('Коллекторы пишут, деньги требуют.')
    await game.playFinale('collectors', FINALES.collectors.find((f) => f.id === 'intern')!)
    expect(game.S.mem[internAt], 'предложение стажировки не штампануло ход').toBe(game.S.stats.sent)
    expect(pool(game), 'после предложения стажировки строки нет').toContain(LINE)
  })
})

describe('эпизод арки даёт отклик в свой ход (#1192)', () => {
  const beats: Array<[number, typeof collectorsTea | typeof collectorsRecruited | typeof collectorsTurned, string]> = [
    [2, collectorsTea, 'чай'],
    [3, collectorsRecruited, 'работают'],
    [4, collectorsTurned, 'работают на меня'],
  ]
  const body = (fact: string): string => {
    const entry = collectorsEpPool().find((e) => (spec(e as Line).when ?? []).some((c) => c.key === fact && c.op === '=='))
    const raw = valueOf(entry!)
    return typeof raw === 'string' ? raw : String((raw as { t?: unknown }).t ?? '')
  }
  const button = (game: Game) => {
    game.S.choices = null
    return game.buildChoices().find((c) => c.act === 'collectorsEp')
  }

  it('окно — три строки фактов, не весь follow', () => {
    expect(collectorsEpPool().length, 'в гарантированное окно уехал весь follow').toBe(3)
    expect(ARCS.collectors.follow.length, 'follow пуст — проверка окна пустеет').toBeGreaterThan(3)
  })

  it('ход эпизода с фактом — в блоке его строка; до факта строка скрыта', async () => {
    for (const [i, fact, mark] of beats) {
      const { game } = makeGame()
      expect(game.open(ARCS.collectors.follow), `${mark}: строка до факта`).not.toContain(body(fact))
      expect(button(game), `${mark}: отклик до эпизода`).toBeUndefined()
      await game.playEpisode(ARCS.collectors.eps[i], 'collectors')
      const btn = button(game)
      expect(btn, 'эпизод без отклика').toBeTruthy()
      expect(btn!.text.toLowerCase(), fact).toContain(body(fact).slice(1).toLowerCase())
      const from = game.S.msgs.length
      await game.send(btn!)
      const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' ? [m.text] : [])).join(' ')
      const reply = fact === collectorsTea ? 'дольше, чем про срок'
        : fact === collectorsRecruited ? 'Долг пока на месте'
          : 'Чай длиннее срока'
      expect(said, `${mark}: ответ не про факт эпизода`).toContain(reply)
      expect(button(game), `${mark}: ответ не закрыл окно`).toBeUndefined()
    }
  })

  it('строка факта в окне эпизода показывается один раз, дальше пул молчит (#1287)', async () => {
    // партия 309117: «Коллекторы на объекте расселись…» 1179 → 1189 — строка факта детерминирована
    // и предлагалась каждый ход окна эпизода (ход и три после)
    const { game } = makeGame()
    await game.playEpisode(ARCS.collectors.eps[2], 'collectors')
    const at = Number(game.S.mem[collectorsEpAt])
    expect(Number.isFinite(at), 'эпизод не штампанул ход — проверка пустеет').toBe(true)
    expect(game.S.mem[collectorsTea], 'сцена чая не записала факт — проверка не про ту строку').toBe(true)
    const offered: string[] = []
    for (let turn = 0; turn <= 3; turn++) {
      game.S.stats.sent = at + turn
      const b = button(game)
      if (b) offered.push(b.text)
    }
    expect(offered, `строка факта повторена в окне: ${offered.join(' → ')}`).toHaveLength(1)
    expect(offered[0]!.toLowerCase(), 'не строка факта чая').toContain(body(collectorsTea).slice(1).toLowerCase())
  })
})

describe('«чай длинный» ждёт сцены чая (#1158)', () => {
  const LINE = 'Коллекторы на объекте расселись: чай длинный, долг тоже.'
  const pool = (g: Game) => g.open(ARCS.collectors.follow)

  it('до третьей серии строка молчит, после сцены чая — звучит; пул не пустеет', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.arcs.collectors = { i: 2, last: 0 }
    expect(game.holds(is(collectorsTea)), 'чай в свежей партии — проверка пустеет').toBe(false)
    expect(pool(game), 'чай длинный до сцены чая').not.toContain(LINE)
    // без строки чая вопрос про коллекторов держит безгейтный сосед — follow не обескровлен
    expect(pool(game), 'в до-чаевом окне от коллекторов не осталось вопроса').toContain('Коллекторы пишут, деньги требуют.')
    await game.playEpisode(ARCS.collectors.eps[2], 'collectors')
    expect(game.S.mem[collectorsTea], 'сцена чая не записала факт').toBe(true)
    expect(pool(game), 'после сцены чая строки нет').toContain(LINE)
  })
})

describe('отказ от стажировки переключает финал арки (#1041)', () => {
  const chosen = (g: Game) => g.S.mem[finaleOf('collectors')]

  it('отказ пишет факт, и эпилог больше не утверждает стажировку', async () => {
    // без отказа финал — «Стажёр-коллектор» (условие — шесть грубостей)
    const accept = makeGame().game
    accept.S.mem[count.rude] = 6
    await accept.fire('ArcFinale', { arc: 'collectors' })
    expect(chosen(accept), 'финал арки без отказа не «Стажёр»').toBe('intern')
    // отказ — вторая строка пула P_INTERN (номер едет с arg оффера, #1017): играем настоящим путём.
    // Кнопка попадает в блок не в каждой партии (два слота) — идём по сидам, как в тесте окна #958
    let declined = false
    for (let seed = 1; seed <= 20 && !declined; seed++) {
      const { game } = makeGame({ seed })
      game.S.mem[count.rude] = 6
      await game.playFinale('collectors', FINALES.collectors.find((f) => f.id === 'intern')!)
      game.S.choices = null
      const btn = game.buildChoices().find((c) => c.act === 'internOffer' && c.arg === '1')
      if (!btn) continue
      await game.send(btn)
      expect(game.holds(is(internDeclined)), 'отказ не записал факт').toBe(true)
      await game.fire('ArcFinale', { arc: 'collectors' })
      expect(chosen(game), 'отказ не переключил финал с «Стажёра»').not.toBe('intern')
      declined = true
    }
    expect(declined, 'ни в одной из двадцати партий окна стажировки не было — проверка пустеет').toBe(true)
  })

  it('эпилог не утверждает стажировку после отказа — реальный порядок без повторного ArcFinale (#1056)', async () => {
    let declined = false
    for (let seed = 1; seed <= 20 && !declined; seed++) {
      const { game } = makeGame({ seed })
      game.S.mem[count.rude] = 6
      await game.playFinale('collectors', FINALES.collectors.find((f) => f.id === 'intern')!)
      // реальный порядок: финал записан до оффера и после отказа не переписывается
      expect(chosen(game), 'финал не записан до оффера').toBe('intern')
      const before = game.open(ENDGAME_ARCH).map((l) => l.slug)
      expect(before, 'до ответа эпилог утверждает стажировку — проверка не про то').not.toContain('fin.collectors.intern')
      expect(before, 'молчание окна осталось без строки эпилога').toContain('collectors.intern.silent')
      expect(before, 'молчание выдано за отказ').not.toContain('collectors.intern.declined')
      game.S.choices = null
      const btn = game.buildChoices().find((c) => c.act === 'internOffer' && c.arg === '1')
      if (!btn) continue
      await game.send(btn)
      expect(game.holds(is(internDeclined)), 'отказ не записал факт').toBe(true)
      expect(chosen(game), 'stored finale переписан — проверка не про то').toBe('intern')
      const after = game.open(ENDGAME_ARCH).map((l) => l.slug)
      expect(after, 'эпилог утверждает стажировку после отказа').not.toContain('fin.collectors.intern')
      expect(after, 'замены нет: эпилог арки пустует').toContain('collectors.intern.declined')
      expect(after, 'после отказа звучит и строка молчания').not.toContain('collectors.intern.silent')
      declined = true
    }
    expect(declined, 'ни в одной из двадцати партий окна стажировки не было — проверка пустеет').toBe(true)
  })
})

describe('эпилог различает согласие, отказ и молчание оффера стажировки (#1335)', () => {
  const slugs = (g: Game) => g.open(ENDGAME_ARCH).map((l) => l.slug)
  /** Кнопка оффера на настоящем ходу: окно открывает финал арки, номер строки едет с `arg` (#1017). */
  const offer = (g: Game, arg: string) => {
    g.S.choices = null
    return g.buildChoices().find((c) => c.act === 'internOffer' && c.arg === arg)
  }
  /** Партия дошла до финала «Стажёр-коллектор»: финал записан до оффера, окно штамповано ходом (#1056). */
  const toOffer = async (seed: number): Promise<Game> => {
    const { game } = makeGame({ seed })
    game.S.mem[count.rude] = 6
    await game.playFinale('collectors', FINALES.collectors.find((f) => f.id === 'intern')!)
    expect(game.S.mem[finaleOf('collectors')], 'финал не записан до оффера').toBe('intern')
    expect(game.S.mem[internAt], 'предложение стажировки не штампануло ход').toBe(game.S.stats.sent)
    return game
  }
  /** Кнопка попадает в блок не в каждой партии (два слота) — идём по сидам, как в окне #958. */
  const withOffer = async (arg: string): Promise<Game> => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = await toOffer(seed)
      if (offer(game, arg)) return game
    }
    throw new Error(`ни в одной из двадцати партий кнопки «${arg}» не было — проверка пустеет`)
  }

  it('молчание окна: ни стажировки, ни отказа, а эпилог арки не пустует', async () => {
    const game = await withOffer('0')
    // игрок тянет с ответом: окно события живёт ход и три после, дальше оффера в блоке нет
    game.S.stats.sent += 4
    expect(game.holds(is('internFresh')), 'окно ещё живо — проверка не про то').toBe(false)
    expect(offer(game, '0'), 'оффер всё ещё в блоке').toBeUndefined()
    expect(game.holds(is(internAccepted)), 'молчание записало согласие').toBe(false)
    expect(game.holds(is(internDeclined)), 'молчание записало отказ').toBe(false)
    const ep = slugs(game)
    expect(ep, 'эпилог утверждает стажировку, которой игрок не выбирал').not.toContain('fin.collectors.intern')
    expect(ep, 'молчание выдано за отказ — «ты отказался» не звучит тому, кто не отвечал').not.toContain('collectors.intern.declined')
    expect(ep, 'молчанию не оставлено строки: эпилог арки пустует').toContain('collectors.intern.silent')
  })

  it('обе строки согласия пишут факт, и только он открывает стажировку в эпилоге', async () => {
    for (const arg of ['0', '2']) {
      const game = await withOffer(arg)
      await game.send(offer(game, arg)!)
      expect(game.holds(is(internAccepted)), `согласие «${arg}» не записало факт`).toBe(true)
      expect(game.holds(is(internDeclined)), `согласие «${arg}» записало отказ`).toBe(false)
      expect(game.S.mem[finaleOf('collectors')], 'stored finale переписан — проверка не про то').toBe('intern')
      expect(game.holds(is(internAt)), 'ответ не погасил окно — строка молчания останется').toBe(false)
      const ep = slugs(game)
      expect(ep, `эпилог молчит о стажировке после согласия «${arg}»`).toContain('fin.collectors.intern')
      expect(ep, 'согласие выдано за отказ').not.toContain('collectors.intern.declined')
      expect(ep, 'согласие выдано за молчание').not.toContain('collectors.intern.silent')
    }
  })
})
