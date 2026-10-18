// Денежный вопрос (#795): пока открыта легенда денег, у игрока первичная контекстная кнопка — спросить,
// где деньги сейчас. Место берётся из легенды, формулировки не повторяются, ответ — продолжение легенды;
// случайной кнопки «как там X?» по неозвученной арке больше нет.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { MONEY_ASK, MONEY_PLACES, MONEY_ASK_TURNS, moneyPlaceOf, type MoneyPlace } from './money-ask'
import { ARCS } from './arcs'
import { LEGENDS } from './legends'
import { valueOf, isOpen, Gated } from '../engine/rules'
import type { Entry } from './fact'
import { taxFrozen, nivaBack, intro, moneyAskAt, legendPromiseAt } from './memkeys'
import { meet } from './world'
import type { Choice } from '../engine/state'
import type { Game } from '../engine/game'

const places = Object.keys(MONEY_PLACES) as MoneyPlace[]
/** Вопрос-состояние: несёт окно свежести своего места (#955/#962). */
const windowed = (e: Entry<string>): e is Gated<string> => e instanceof Gated && e.when.some((c) => c.key.startsWith('sinceMoneyAsk.'))

/** Кадры выбора в партии: варианты строятся заново, как на каждом ходу игрока. */
const frame = (game: Game): Choice[] => { game.S.choices = null; return game.choices }
/** Партия с открытой легендой места; `topicLine` — реплика Алика, за которую игрок цепляется темой. */
const withLegend = (legend: string, topicLine?: string): Game => {
  const { game } = makeGame({ seed: 7 })
  game.S.mem['legend.id'] = legend
  game.S.mem['legend.day'] = game.S.day
  if (topicLine) game.markTopical([game.alikMsg({ kind: 'text', from: 'alik', text: topicLine })])
  return game
}
const findMoney = (cs: Choice[]): Choice | undefined => cs.find((c) => c.act === 'money')

describe('денежный вопрос: корпус (#795)', () => {
  it('на каждое место — не меньше пяти непохожих формулировок, и легенды места существуют', () => {
    expect(places.length, 'мест не стало — проверка пустеет').toBeGreaterThanOrEqual(5)
    for (const p of places) {
      const pool = MONEY_ASK[p].map(valueOf)
      expect(pool.length, `${p}: формулировок меньше пяти`).toBeGreaterThanOrEqual(5)
      expect(new Set(pool).size, `${p}: формулировки повторяются`).toBe(pool.length)
      for (const id of MONEY_PLACES[p]) expect(LEGENDS[id], `${p}: легенды ${id} нет`).toBeDefined()
      expect(moneyPlaceOf(MONEY_PLACES[p][0]), `${p}: место не узнаётся по своей легенде`).toBe(p)
    }
    // легенда не про деньги — места нет
    expect(moneyPlaceOf('garik')).toBeUndefined()
    expect(moneyPlaceOf(undefined)).toBeUndefined()
  })

  it('колёсная ветка (#919): после возвращения вопросы про колёса, «деньги в Ниве» закрыт', () => {
    const { game } = makeGame()
    game.S.mem[intro('niva')] = true
    game.S.mem[nivaBack] = true
    const open = MONEY_ASK.niva.filter((e) => isOpen(e, game.lineFacts())).map(valueOf)
    expect(open, 'колёсный вопрос открыт').toContain('Колёса всё ещё продаются?')
    expect(open).toContain('Покупатель на колёса нашёлся?')
    expect(open, 'бардачок пуст — старого вопроса нет').not.toContain('Деньги всё ещё в «Ниве»?')
    // до возвращения — наоборот: колёс нет, вопрос про бардачок открыт
    const fresh = makeGame().game
    fresh.S.mem[intro('niva')] = true
    const before = MONEY_ASK.niva.filter((e) => isOpen(e, fresh.lineFacts())).map(valueOf)
    expect(before.some((t) => t.startsWith('Колёса')), 'до возвращения колёсных вопросов нет').toBe(false)
    expect(before).toContain('Деньги всё ещё в «Ниве»?')
  })

  it('«разморозка» спрашивается только по факту заморозки (#824)', () => {
    // слово «разморозка» предполагает замороженные счета: без факта tax.frozen вариант — фантомный
    const { game } = makeGame()
    const bank = MONEY_ASK.bank.filter((e) => /замороз|размороз/i.test(valueOf(e)))
    expect(bank.length, 'строк про заморозку не стало — проверка пустеет').toBeGreaterThanOrEqual(2)
    for (const e of bank) expect(isOpen(e, game.lineFacts()), `без факта заморозки: «${valueOf(e)}»`).toBe(false)
    game.S.mem[taxFrozen] = true
    for (const e of bank) expect(isOpen(e, game.lineFacts()), `с фактом заморозки: «${valueOf(e)}»`).toBe(true)
  })

  it('случайной кнопки «как там X?» по неозвученной арке нет', () => {
    const { game } = makeGame({ seed: 3 })
    game.S.arcs.beton = { i: 1, last: 0 } // арка идёт, но в чате её сейчас нет
    expect(game.facts().arcsStarted).toBe(1)
    for (let i = 0; i < 30; i++) {
      const arc = frame(game).filter((c) => c.act === 'arc')
      expect(arc, 'кнопка про арку без её реплики в контексте').toEqual([])
    }
  })
})

describe('денежный вопрос: первичная кнопка (#795)', () => {
  it('при открытой легенде денег спрашивают о деньгах чаще, чем о теме', async () => {
    const game = withLegend('beton_money', 'Деньги лежат, брат. В фундаменте, глубина полтора метра.')
    let money = 0
    let topic = 0
    for (let i = 0; i < 60; i++) {
      const cs = frame(game)
      if (findMoney(cs)) money++
      if (cs.some((c) => c.act === 'topic')) topic++
    }
    expect(money, 'денежной кнопки не было ни разу').toBeGreaterThan(0)
    expect(money, `денежная кнопка (${money}) реже темы (${topic})`).toBeGreaterThan(topic)
  })

  it('формулировки не повторяются подряд', () => {
    const game = withLegend('safe_wrongkey')
    // у пула есть строки под знакомством (Нуне) — «исчерпать» значит показать все открытые
    const open = MONEY_ASK.safe.filter((e) => isOpen(e, game.lineFacts())).map(valueOf)
    const seen: string[] = []
    for (let i = 0; i < 30; i++) {
      const money = findMoney(frame(game))
      if (money) seen.push(money.text)
    }
    expect(seen.length, 'кнопка не показывалась — проверка была бы пустой').toBeGreaterThanOrEqual(open.length)
    for (let i = 1; i < seen.length; i++) expect(seen[i], `повтор подряд: «${seen[i]}»`).not.toBe(seen[i - 1])
    expect(new Set(seen).size, 'формулировки не исчерпываются').toBeGreaterThanOrEqual(open.length)
  })

  it('нажатие ведёт сюжет: Алик продолжает ту же легенду, пока её реплики не кончились', async () => {
    const game = withLegend('crypto')
    const lines = LEGENDS.crypto.lines.map((l) => valueOf(l)).map((l) => (typeof l === 'string' ? l : l.t))
    const said: string[] = []
    for (let i = 0; i < lines.length; i++) {
      game.S.stats.sent += MONEY_ASK_TURNS + 1 // между вопросами проходят ходы: окно свежести (#952)
      const money = findMoney(frame(game))
      expect(money, 'кнопка денег исчезла, пока легенда открыта').toBeDefined()
      const from = game.S.msgs.length
      await game.send(money!)
      const texts = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.from === 'alik').map((m) => (m.kind === 'text' ? m.text : ''))
      expect(texts.some((t) => lines.includes(t)), `ответ ${i + 1} не из легенды: ${texts.join(' | ')}`).toBe(true)
      said.push(...texts.filter((t) => lines.includes(t)))
    }
    expect(new Set(said).size, 'реплики легенды повторяются').toBe(lines.length)
    // пул легенды исчерпан — кнопка не молчит: обычная отмазка (прецедент `Opt_Arc` с пулом `follow`)
    game.S.stats.sent += MONEY_ASK_TURNS + 1
    const money = findMoney(frame(game))
    expect(money, 'кнопка денег исчезла после исчерпания легенды').toBeDefined()
    const from = game.S.msgs.length
    await game.send(money!)
    expect(game.S.msgs.slice(from).some((m) => m.kind === 'text' && m.from === 'alik')).toBe(true)
  })
})

describe('окно свежести ответа (#952): состояние не переспрашивают', () => {
  /** Легенда каждого места для партии теста. */
  const LEGEND_OF: Record<MoneyPlace, string> = { bank: 'frozen', beton: 'beton_money', safe: 'safe_wrongkey', crypto: 'crypto', niva: 'niva_stuck' }

  it('после ответа Алика вопросы-состояния молчат окно во всех пулах, вопросы-действия остаются', async () => {
    for (const p of places) {
      const game = withLegend(LEGEND_OF[p])
      if (p === 'bank') game.S.mem[taxFrozen] = true // вопросы про заморозку — под фактом заморозки
      if (p === 'safe') game.S.mem[intro('nune')] = true // вопрос про возвращение Нуне — под знакомством
      if (p === 'niva') game.S.mem[intro('niva')] = true // «Нива» у Алика — nivaHome по умолчанию
      const before = game.open(MONEY_ASK[p])
      const state = MONEY_ASK[p].filter(windowed).map(valueOf)
      const actions = before.filter((t) => !state.includes(t))
      if (p === 'beton') expect(actions.length, 'в бетоне нет вопросов-действий — проверять нечего').toBeGreaterThan(0)
      expect(state.length, `${p}: вопросов-состояний не стало — проверка пустеет`).toBeGreaterThan(0)
      expect(before.length, `${p}: до ответа нечего спрашивать`).toBeGreaterThan(0)
      expect(before.some((t) => state.includes(t)), `${p}: до ответа состояние не открыто — проверка пустеет`).toBe(true)
      const money = findMoney(frame(game))
      expect(money, `${p}: кнопки денег нет`).toBeDefined()
      await game.send(money!)
      const inWindow = game.open(MONEY_ASK[p])
      for (const t of state) expect(inWindow, `${p}: в окне переспрос «${t}»`).not.toContain(t)
      for (const t of actions) expect(inWindow, `${p}: вопрос-действие «${t}» ушёл`).toContain(t)
      expect(inWindow.length, `${p}: окно ничего не закрыло`).toBeLessThan(before.length)
      game.S.stats.sent += MONEY_ASK_TURNS + 1
      expect(game.open(MONEY_ASK[p]), `${p}: окно прошло — состояние вернулось`).toEqual(before)
    }
  })
})

describe('объявление места потребляет окно своего места (#962)', () => {
  /** Серия-объявление места: легенда арки и есть объявление. */
  const announcements: Array<[string, string]> = [
    ['grandpa', 'grandpa_deposit'],
    ['rubik', 'frozen'],
    ['niva', 'niva_stuck'],
  ]

  it('свежее объявление закрывает state-вопросы своего места, чужие места не трогает', async () => {
    for (const [arc, legend] of announcements) {
      const place = moneyPlaceOf(legend)
      expect(place, `${legend}: место не узнаётся`).toBeDefined()
      const { game } = makeGame()
      game.S.mem[intro('niva')] = true // «Нива» у Алика: пул места виден до объявления
      const state = MONEY_ASK[place!].filter(windowed).map(valueOf)
      expect(state.length, `${place}: вопросов-состояний не стало — проверка пустеет`).toBeGreaterThan(0)
      const openState = state.filter((t) => game.open(MONEY_ASK[place!]).includes(t))
      expect(openState.length, `${place}: до объявления состояние не открыто — проверка пустеет`).toBeGreaterThan(0)
      const others = places.filter((p) => p !== place).map((p) => [p, game.open(MONEY_ASK[p])] as const)
      const idx = ARCS[arc].eps.findIndex((ep) => ep.legend === legend)
      expect(idx, `${arc}: серии с легендой ${legend} нет`).toBeGreaterThanOrEqual(0)
      await game.playEpisode(ARCS[arc].eps[idx], arc)
      // объявление прозвучало настоящим путём: в ближайших блоках state-вопросов этого места нет
      for (let i = 0; i < 30; i++) {
        const money = frame(game).find((c) => c.act === 'money')
        if (money) expect(state, `${place}: в блоке переспрос «${money.text}»`).not.toContain(money.text)
      }
      const after = game.open(MONEY_ASK[place!])
      for (const t of state) expect(after, `${place}: объявление не закрыло «${t}»`).not.toContain(t)
      for (const [p, open] of others) expect(game.open(MONEY_ASK[p]), `${p} затронуто объявлением ${place}`).toEqual(open)
      game.S.stats.sent += MONEY_ASK_TURNS + 1
      for (const t of openState) expect(game.open(MONEY_ASK[place!]), `${place}: окно прошло — «${t}» не вернулось`).toContain(t)
    }
  })
})

describe('follow-пул бетона и посторонние подтверждения места (#981)', () => {
  /** State-вопросы бетона в обоих пулах: money-ask и follow арки. */
  const stateLines = () => ({
    ask: MONEY_ASK.beton.filter(windowed).map(valueOf),
    follow: ARCS.beton.follow.filter(windowed).map(valueOf),
  })
  /** Подтверждение места закрыло state-вопросы обоих пулов; за окном они вернулись, действия не тронуты. */
  const expectWindow = (game: Game) => {
    const { ask, follow } = stateLines()
    expect(ask.length, 'вопросов-состояний money-ask не стало — проверка пустеет').toBeGreaterThan(0)
    expect(follow.length, 'state-вопросов follow не стало — проверка пустеет').toBe(3)
    for (const t of ask) expect(game.open(MONEY_ASK.beton), `money-ask в окне: «${t}»`).not.toContain(t)
    for (const t of follow) expect(game.open(ARCS.beton.follow), `follow в окне: «${t}»`).not.toContain(t)
    // вопросы-действия окно не знают (#955/#981)
    expect(game.open(MONEY_ASK.beton)).toContain('Может, всё-таки достанем деньги из фундамента?')
    game.S.stats.sent += MONEY_ASK_TURNS + 1
    for (const t of ask) expect(game.open(MONEY_ASK.beton), `money-ask за окном: «${t}»`).toContain(t)
    for (const t of follow) expect(game.open(ARCS.beton.follow), `follow за окном: «${t}»`).toContain(t)
  }

  it('ответ money-ask закрывает state-вопросы и в follow-пуле: кнопка арки их не предлагает', async () => {
    const game = withLegend('beton_money')
    const { follow } = stateLines()
    expect(game.open(ARCS.beton.follow), 'до ответа state-вопросы follow открыты').toEqual(expect.arrayContaining(follow))
    const money = findMoney(frame(game))
    expect(money, 'кнопки денег нет').toBeDefined()
    await game.send(money!)
    // кнопка арки в окне: пул отдаёт открытую соседнюю строку (Арсен), но не state-вопросы.
    // Легенда закрыта — оффер Money не занимает тему арки (#887), вопрос арки виден сам
    delete game.S.mem['legend.id']
    game.S.arcs.beton = { i: 4, last: -99 }
    game.S.mem[intro('arsen')] = true
    game.S.mem[intro('grant')] = true
    game.setCtx({ arc: 'beton' })
    let shown = 0
    for (let i = 0; i < 30; i++) {
      const arc = frame(game).find((c) => c.act === 'arc')
      if (!arc) continue
      shown++
      expect(follow, `follow в окне: «${arc.text}»`).not.toContain(arc.text)
    }
    expect(shown, 'кнопка арки ни разу не предложена — проверка пустеет').toBeGreaterThan(0)
    expectWindow(game)
  })

  it('ход Алика по линии легенды бетона подтверждает место (#981)', async () => {
    const { game } = makeGame({ seed: 5 })
    let fired = false
    for (let i = 0; i < 80 && !fired; i++) {
      game.setLegend('beton_money', 'beton')
      game.S.arcs.beton = { i: 1, last: game.S.day } // сериалы сегодня молчат: ходит только линия легенды
      game.S.stats.sent += 3 // перерыв Turn_Legend — 2 хода
      game.S.mem[legendPromiseAt] = game.S.stats.sent // клятва под паузой: проверяем штамп самого хода по линии
      fired = (await game.fire('AlikTurn'))?.name === 'Turn_Legend'
      game.S.scene = null
    }
    expect(fired, 'Turn_Legend не сыграл — проверка пустеет').toBe(true)
    expect(game.S.mem[moneyAskAt.beton], 'ход по линии места не штампует').toBe(game.S.stats.sent)
    expectWindow(game)
  })

  it('бит легенды между ходами подтверждает место (#981)', async () => {
    const { game } = makeGame({ seed: 5 })
    let fired = false
    for (let i = 0; i < 150 && !fired; i++) {
      game.setLegend('beton_money', 'beton')
      game.S.arcs.beton = { i: 1, last: game.S.day }
      game.S.stats.sent += 5 // перерыв Beat_Legend — 5 ходов
      delete game.S.mem[moneyAskAt.beton] // штамп только этого хода — иначе прошлый прогон маскирует
      fired = (await game.fire('StoryBeat'))?.name === 'Beat_Legend'
    }
    expect(fired, 'Beat_Legend не сыграл — проверка пустеет').toBe(true)
    expect(game.S.mem[moneyAskAt.beton], 'бит легенды места не штампует').toBe(game.S.stats.sent)
    expectWindow(game)
  })

  it('ответ на вопрос о легенде подтверждает место (#981)', async () => {
    const game = withLegend('beton_money')
    game.S.ctx = { legend: 'beton_money' }
    let talk: Choice | undefined
    for (let i = 0; i < 30 && !talk; i++) talk = frame(game).find((c) => c.act === 'talk')
    expect(talk, 'кнопки-вопроса о легенде нет').toBeDefined()
    // на ходу ответа бит легенды молчит: иначе НК «снять штамп ответа» маскируется соседним источником
    game.S.rules.cooldown['Beat_Legend'] = { turn: game.S.stats.sent, day: game.S.day }
    await game.send(talk!)
    expect(game.S.mem[moneyAskAt.beton], 'ответ легенды места не штампует').toBe(game.S.stats.sent)
    expectWindow(game)
  })

  it('напоминание сроком легенды подтверждает место (#981)', async () => {
    const game = withLegend('beton_money')
    await game.excuseTurn()
    const until = LEGENDS.beton_money.until.t
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes(until)), 'напоминание не прозвучало — проверка пустеет').toBe(true)
    expect(game.S.mem[moneyAskAt.beton], 'напоминание места не штампует').toBe(game.S.stats.sent)
    expectWindow(game)
  })

  it('напоминание в пачке «пока тебя не было» подтверждает место (#981)', async () => {
    const game = withLegend('beton_money')
    await game.awayMsg('excuse')
    const until = LEGENDS.beton_money.until.t
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes(until)), 'напоминание не прозвучало — проверка пустеет').toBe(true)
    expect(game.S.mem[moneyAskAt.beton], 'напоминание пачки не штампует').toBe(game.S.stats.sent)
    expectWindow(game)
  })

  it('хор в рамках легенды места подтверждает место (#981)', async () => {
    const { game } = makeGame({ seed: 4 })
    game.rules.applyOps(meet('karine'), {})
    let fired = false
    for (let i = 0; i < 80 && !fired; i++) {
      game.setLegend('beton_money', 'beton')
      game.S.stats.sent += 13 // перерыв хора — 12 ходов
      delete game.S.mem[moneyAskAt.beton]
      fired = (await game.fire('Mentioned', {}, { target: 'karine' }))?.name === 'Chorus_karine'
    }
    expect(fired, 'Chorus_karine не сыграл — проверка пустеет').toBe(true)
    expect(game.S.mem[moneyAskAt.beton], 'хор в рамках легенды места не штампует').toBe(game.S.stats.sent)
    expectWindow(game)
  })
})
