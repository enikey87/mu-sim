// Барахолка (#788): каждый товар `BARTER` достижим и обменивается — при открытых воротах он попадает
// в выдачу `open(BARTER)`, а узел `take` кладёт предмет в досье и уменьшает долг ровно на его цену.
// Сторож по образцу #767: ломается гейт, имя или цена — красный; корпус пустеет — тоже красный.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { BARTER, type Vars } from './scenes'
import { isOpen, Gated, valueOf, type Criterion, type Entry } from '../engine/rules'
import type { Game } from '../engine/game'

type Good = { n: string; v: number; p: string }
const goods = BARTER.map((e) => valueOf(e) as Good)

/** Открыть ворота товара: положительные условия кладём тем фактом, которым их пишет игра — серия живёт
 *  в `S.arcs` (`exists('arc.boris')`), знакомство и счётчики — в `S.mem` (`is(intro('taron'))`).
 *  Отрицательные (`missing`, `!=`) свежая партия не нарушает — их не трогаем. */
function openGates(game: Game, when: readonly Criterion[]): void {
  for (const c of when) {
    if (c.op === 'all') { openGates(game, c.all ?? []); continue }
    if (c.op === '!exist' || c.op === '!=' || c.op === 'match') continue
    const key = String(c.key)
    if (key.startsWith('arc.')) {
      const id = key.slice('arc.'.length)
      const i = Number(c.value)
      if (id !== 'done') game.S.arcs[id] = { i: Number.isFinite(i) && i > 1 ? i : 1, last: 0 }
      continue
    }
    game.S.mem[key] = c.op === '>=' ? Number(c.value) : true
  }
}
const gatesOf = (e: Entry<Good>): readonly Criterion[] => (e instanceof Gated ? e.when : [])
const offered = (game: Game): string[] => game.open(BARTER).map((x) => (x as Good).n)

describe('барахолка: товары обмениваются (#788)', () => {
  it('корпус не пустеет и имена не повторяются', () => {
    expect(goods.length, 'товаров не стало — проверка пустеет').toBeGreaterThanOrEqual(20)
    expect(new Set(goods.map((g) => g.n)).size, 'имена товаров повторяются').toBe(goods.length)
    for (const g of goods) {
      expect(g.v, `${g.n}: цена вне разброса 300–5000`).toBeGreaterThanOrEqual(300)
      expect(g.v, `${g.n}: цена вне разброса 300–5000`).toBeLessThanOrEqual(5000)
      expect(g.p.length, `${g.n}: подпись пустая`).toBeGreaterThan(10)
    }
  })

  it('ворота открыты — товар в выдаче; выдача ровно по воротам', () => {
    const fresh = makeGame().game
    const freshOffer = new Set(offered(fresh))
    for (const [i, e] of BARTER.entries()) {
      // свежая партия: товар предлагают тогда и только тогда, когда его ворота открыты
      expect(freshOffer.has(goods[i].n), `${goods[i].n}: выдача разошлась с воротами`).toBe(isOpen(e, fresh.lineFacts()))
      const { game } = makeGame()
      openGates(game, gatesOf(e))
      expect(offered(game), `${goods[i].n}: ворота открыты, а товара нет в выдаче`).toContain(goods[i].n)
    }
  })

  it('каждый товар обменивается узлом take: предмет в досье, долг меньше на цену', async () => {
    let checked = 0
    for (const good of goods) {
      const { game } = makeGame()
      const debt = game.S.debt
      await game.enterNode('barter', 'ask')
      // товар подставляем тем же объектом, который положил бы `init`: узел `take` читает `vars`
      game.S.scene!.vars = { ...good } as Vars
      game.S.choices = null // варианты строятся по текущему узлу, а не из кэша
      const take = game.choices.find((c) => c.go === 'take')
      expect(take, `${good.n}: в сцене нет кнопки «Беру!»`).toBeDefined()
      await game.send(take!)
      expect(game.S.items, `${good.n}: предмет не попал в досье`).toContain(good.n)
      expect(game.S.debt, `${good.n}: долг не уменьшился на ${good.v}`).toBe(debt - good.v)
      expect(game.S.ach.barter, `${good.n}: ачивка обмена`).toBeDefined()
      checked++
    }
    expect(checked, 'обмен ни одного товара не проверен').toBe(goods.length)
  })
})
