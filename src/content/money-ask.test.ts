// Денежный вопрос (#795): пока открыта легенда денег, у игрока первичная контекстная кнопка — спросить,
// где деньги сейчас. Место берётся из легенды, формулировки не повторяются, ответ — продолжение легенды;
// случайной кнопки «как там X?» по неозвученной арке больше нет.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { MONEY_ASK, MONEY_PLACES, moneyPlaceOf, type MoneyPlace } from './money-ask'
import { LEGENDS } from './legends'
import { valueOf, isOpen } from '../engine/rules'
import { taxFrozen, nivaBack, intro } from './memkeys'
import type { Choice } from '../engine/state'
import type { Game } from '../engine/game'

const places = Object.keys(MONEY_PLACES) as MoneyPlace[]

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
    const money = findMoney(frame(game))
    expect(money, 'кнопка денег исчезла после исчерпания легенды').toBeDefined()
    const from = game.S.msgs.length
    await game.send(money!)
    expect(game.S.msgs.slice(from).some((m) => m.kind === 'text' && m.from === 'alik')).toBe(true)
  })
})
