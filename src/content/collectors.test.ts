// Коллекторы после credit.broke: мини-сериал, перевербовка, микрозайм молчит (#128).
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney, cards } from '../test/helpers'
import { START_DAY, ARC_MARINATION_DAYS } from '../engine/state'
import { collectorsRecruited, collectorsTurned, count, creditBroke, creditStage, endgame, finaleOf, internAt, internDeclined, intro, paydayScene, threatClaim } from './memkeys'
import { loanTaken, loanDueAt } from './credit'
import { D } from './excuses'
import { P_COLLECTORS_DEBUT } from './rules/player-choice-pools'
import type { Game } from '../engine/game'
import { NOTIF } from './life'
import { ARC_DONE, ARCS, GROUP } from './arcs'
import { FINALES } from './finales'
import { meet } from './world'
import { is, isOpen, test, valueOf, type Entry, type Facts } from '../engine/rules'
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

describe('«три чашки чая» ждёт предложения стажировки (#1036)', () => {
  const LINE = '«Деньги-Ара» — три чашки чая? И всё это в мой долг?'
  const pool = (g: Game) => g.open(ARCS.collectors.follow)

  it('до финала арки строка молчит, после предложения стажировки — звучит; пул не пустеет', async () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    game.S.arcs.collectors = { i: 2, last: 0 }
    expect(game.holds(is(internAt)), 'стажировка в свежей партии — проверка пустеет').toBe(false)
    expect(pool(game), 'число «три» звучит до предложения стажировки').not.toContain(LINE)
    // до финала пул держат безгейтные соседи: вопрос про коллекторов не пропадает
    expect(pool(game).length, 'follow обескровлен гейтом — вопроса про коллекторов не осталось').toBeGreaterThanOrEqual(3)
    await game.playFinale('collectors', FINALES.collectors.find((f) => f.id === 'intern')!)
    expect(game.S.mem[internAt], 'предложение стажировки не штампануло ход').toBe(game.S.stats.sent)
    expect(pool(game), 'после предложения стажировки строки нет').toContain(LINE)
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
})
