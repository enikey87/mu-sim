// Несостыковки из партии пользователя (docs/PLAYTEST_ISSUES.md): каждая — тестом, чтобы не вернулась.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { GROUP } from './arcs'
import { CONDOLE_REVIVED, GREET_A } from './misc'
import type { Game } from '../engine/game'

const texts = (g: Game, n = 0) => g.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' ? [m.text] : []))

describe('несостыковки из партии пользователя', () => {
  it('Борис не звучит до своего сериала: ни в генераторе отмазок, ни в семейном чате, ни в хоре на слово «баран»', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 300; i++) expect(game.X.prev().text).not.toMatch(/Борис/)
    for (let i = 0; i < 20; i++) { await game.groupChat() }
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.who === 'boris')).toBe(false)
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Закину на карту, как баран поправится.' })
    for (let i = 0; i < 20; i++) await game.afterTurn()
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.who === 'boris')).toBe(false)
    expect(GROUP.boris.length).toBeGreaterThan(0)
  })
  it('срок из легенды — условие: он не «наступает сегодня» и не бывает «просрочен»', async () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    await game.promiseLine(undefined, true)
    const p = game.S.promises.at(-1)!
    expect(p.t).toMatch(/как ключ выйдет/)
    expect(p.due).toBeNull()
    game.S.day += 30
    expect(game.lateCount()).toBe(0)
  })
  it('«это когда?» про срок-условие — ответ про само условие, без повторов', async () => {
    const { game } = makeGame()
    const got = new Set<string>()
    for (let i = 0; i < 20; i++) {
      game.S.ctx = { when: 'как ключ выйдет', whenNever: true }
      const n = game.S.msgs.length
      await game.fire('PlayerSays', { intent: 'promiseCheck', arg: 'как ключ выйдет' })
      for (const t of texts(game, n)) { expect(got.has(t), t).toBe(false); got.add(t) }
    }
  })
  it('вопрос про сериал — только если будет новая серия (второй раз в тот же день не предлагается)', async () => {
    const { game } = makeGame()
    game.S.arcs.nune = { i: 3, last: -99 }
    await game.playArc('nune')
    game.S.choices = null
    expect(game.choices.some((c) => c.act === 'arc')).toBe(true)
    await game.fire('PlayerSays', { intent: 'arc', arg: 'nune' }) // следующая серия по вопросу
    game.S.choices = null
    expect(game.choices.some((c) => c.act === 'arc' && c.arg === 'nune')).toBe(false)
  })
  it('«Передавайте привет Борису» без новостей — «Передам», а не «пока без новостей»', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 2, last: game.S.day, byAsk: true }
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'arc', arg: 'boris', greet: true })
    expect(GREET_A.some((g) => texts(game, n).some((t) => t.includes(g.slice(0, 12))))).toBe(true)
  })
  it('реакция, а потом Алик написал словами — «А ответить словами?» уже не предлагается', async () => {
    const { game } = makeGame()
    game.S.ctx = { type: 'reactOnly' }
    await game.say(['Ключ ещё не вышел. Врач говорит: терпение.'])
    game.S.choices = null
    expect(game.choices.some((c) => c.act === 'reactQ')).toBe(false)
  })
  it('«толкни „Ниву“» — только внутри сериала «Нива», и из разговора квест не повторяется', () => {
    const { game } = makeGame()
    expect(game.questAllowed('q_niva')).toBe(false)
    game.setLegend('niva_stuck', 'niva')
    expect(game.questAllowed('q_niva')).toBe(true)
    expect(game.questAllowed('q_niva')).toBe(false) // уже был
    expect(game.questAllowed('q_hash')).toBe(true)
  })
  it('«вернулся» без рода: подходит и тёще, и дедушке', () => {
    for (const t of CONDOLE_REVIVED) expect(t).not.toMatch(/\bон\b|\bона\b/)
  })
})
