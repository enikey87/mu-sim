// Ответ игрока на только что прозвучавшее: легенда денег, вмешавшийся персонаж, воспоминание Алика.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { CHORUS_TALK, MEMORY_TALK } from './talk'
import { LEGENDS } from './legends'
import type { Game } from '../engine/game'
import { valueOf } from '../engine/rules'
import type { Choice } from '../engine/state'

const talkOpt = (g: Game) => g.buildChoices().find((c) => c.act === 'talk')
async function ask(g: Game) {
  for (let seed = 0; seed < 30; seed++) { const c = talkOpt(g); if (c) return c }
  return undefined
}

describe('ответ на только что прозвучавшее', () => {
  it('после вмешательства Карине — вопрос Карине, отвечает Карине, и эта пара больше не предлагается', async () => {
    const { game } = makeGame()
    game.S.ctx = { chorus: 'karine' }
    const c = (await ask(game))!
    expect(CHORUS_TALK.karine.map(valueOf).map((p) => p[0])).toContain(c.text)
    const from = game.S.msgs.length
    await game.send(c)
    const m = game.S.msgs.slice(from).find((x) => x.kind === 'text' && x.who === 'karine')
    expect(m).toBeDefined()
    game.S.ctx = { chorus: 'karine' }
    const next = await ask(game)
    expect(next?.text).not.toBe(c.text)
  })
  // свип #786: «я сверху» правда только до финала — в финале Размик слезает
  it('после финала Размика пара про «я сверху» не предлагается', async () => {
    const { game } = makeGame()
    game.S.ctx = { chorus: 'razmik' }
    game.S.arcs.razmik = { i: 8, last: 0 } // линия окончена: eps.length серий
    game.S.mem['finale.razmik'] = 'default'
    const asked = new Set<string>()
    for (let i = 0; i < 40; i++) { const c = talkOpt(game); if (c) asked.add(c.text); game.S.choices = null }
    expect(asked, 'пара про высоту ушла вместе с краном').not.toContain('Размик, давайте вместе на него надавим')
  })

  it('НС: до финала пара про «я сверху» предлагается', async () => {
    const { game } = makeGame()
    game.S.arcs.razmik = { i: 2, last: 0 }
    const asked = new Set<string>()
    for (let i = 0; i < 40 && asked.size < 2; i++) {
      game.S.ctx = { chorus: 'razmik' }
      game.S.choices = null
      const c = (await ask(game))!
      expect(c).toBeDefined()
      asked.add(c.text)
      await game.send(c) // пара сказана — следующая итерация берёт другую
    }
    expect(asked).toContain('Размик, давайте вместе на него надавим')
  })

  it('после реплики легенды — вопрос именно про неё', async () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    game.S.ctx = { legend: 'safe_baby' }
    const c = (await ask(game))!
    expect(LEGENDS.safe_baby.talk!.map(valueOf).map((p) => p[0])).toContain(c.text)
  })
  it('после воспоминания — ответ на воспоминание', async () => {
    const { game } = makeGame()
    game.S.ctx = { memory: true }
    const c = (await ask(game))!
    expect(MEMORY_TALK.map(valueOf).map((p) => p[0])).toContain(c.text)
  })
  it('у каждой легенды и каждого персонажа хора есть что спросить', () => {
    for (const [id, l] of Object.entries(LEGENDS)) expect(l.talk?.length, id).toBeGreaterThanOrEqual(2)
    for (const [who, p] of Object.entries(CHORUS_TALK)) expect(p.length, who).toBeGreaterThanOrEqual(2)
  })
})

describe('окно дословного повтора для talk-вопроса (#857)', () => {
  it('неотвеченный вопрос не возвращается дословно 20 ходов, а за окном — возвращается', () => {
    const { game } = makeGame()
    game.S.ctx = { chorus: 'karine' }
    // сборка внутри хода может не выпасть по шансу (0.8) — повторяем её в том же ходу:
    // показ в текущем ходу повтором не считается (#826), поэтому вопрос не подменяется сам собой
    const at = (advance: number): string | undefined => {
      game.S.stats.sent += advance
      for (let i = 0; i < 30; i++) {
        game.S.choices = null
        const c = game.buildChoices().find((x) => x.act === 'talk')
        if (c) return c.text
      }
      return undefined
    }
    const first = at(0)
    expect(first, 'вопрос Карине не выпал — проверка пустеет').toBeTruthy()
    // партия 140117: тот же вопрос предложили снова через 3 хода игрока
    for (const step of [1, 2, 6, 9]) expect(at(step), `через ${step} ходов`).not.toBe(first)
    // 20 ходов прошло — пара не нажата, контекст жив: вопрос возвращается
    expect(at(2), 'за окном вопрос не вернулся').toBe(first)
  })
})

describe('Гарик: признание признаёт отрицание (#784)', () => {
  /** Гарик сказал своё «ничего не брал» в этой партии — гоним хор, пока строка не выпадет. */
  const hearDenial = async (game: Game): Promise<boolean> => {
    game.S.mem['intro.garik'] = true
    for (let i = 0; i < 60; i++) {
      game.S.stats.sent += 20 // перерыв хора не помешает: он ходовой
      game.alikMsg({ kind: 'text', from: 'alik', text: 'Это Гарик виноват.' })
      const from = game.S.msgs.length
      await game.afterTurn()
      if (game.S.msgs.slice(from).some((m) => m.kind === 'text' && m.text.includes('ничего не брал'))) return true
    }
    return false
  }
  /** Кнопка-вопрос про перфоратор: у оффера есть шанс — перебираем кадры (как в jabs.test.ts). */
  const askTaken = (game: Game): Choice | undefined => {
    for (let i = 0; i < 20; i++) {
      game.S.choices = null
      const c = game.choices.find((x) => x.act === 'talk' && x.text === 'Гарик, а вы что-нибудь брали?')
      if (c) return c
    }
    return undefined
  }

  it('отрицание было — ответ на колкость его признаёт, а не спорит с ним', async () => {
    const { game } = makeGame({ seed: 11 })
    expect(await hearDenial(game), 'Гарик не сказал отрицание — проверка была бы пустой').toBe(true)
    expect(game.S.mem['garik.denied'], 'отрицание не записано фактом').toBe(true)
    const q = askTaken(game)
    expect(q, 'вопроса про перфоратор нет').toBeDefined()
    const from = game.S.msgs.length
    await game.send(q!)
    const answer = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.who === 'garik').map((m) => (m.kind === 'text' ? m.text : '')).join(' ')
    expect(answer, `ответ не признаёт отрицание: ${answer}`).toMatch(/ничего не брал/)
  })

  it('отрицания не было — признание на него не ссылается', async () => {
    const { game } = makeGame({ seed: 11 })
    game.S.mem['intro.garik'] = true
    game.S.ctx = { chorus: 'garik' }
    expect(game.S.mem['garik.denied'], 'факта отрицания нет в свежей партии').toBeUndefined()
    const q = askTaken(game)
    expect(q, 'вопроса про перфоратор нет').toBeDefined()
    const from = game.S.msgs.length
    await game.send(q!)
    const answer = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.who === 'garik').map((m) => (m.kind === 'text' ? m.text : '')).join(' ')
    expect(answer, `признание ссылается на несказанное отрицание: ${answer}`).not.toMatch(/сказал же/i)
  })
})
