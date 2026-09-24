// Мини-квесты: каждый проходится до конца за 2–3 хода; запускаются из разговора; первый сериал — в первые ходы.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { QUESTS, STARTS } from './quests'
import { ACH } from './achievements'

describe('мини-квесты', () => {
  it('каждый квест проходится до конца не дольше чем за 3 выбора, по любой ветке', async () => {
    for (const id of Object.keys(QUESTS)) {
      const nOpts = QUESTS[id].nodes[QUESTS[id].start].opts!.length
      for (let pick = 0; pick < nOpts; pick++) {
        const { game } = makeGame({ seed: pick + 1 })
        await game.enterNode(id, QUESTS[id].start)
        let steps = 0
        while (game.S.scene && steps < 4) {
          game.S.choices = null
          const opts = game.choices.filter((c) => c.scene)
          await game.send(opts[steps === 0 ? pick : 0])
          steps++
        }
        expect(game.S.scene, `${id} ветка ${pick}`).toBeNull()
        expect(steps).toBeLessThanOrEqual(3)
      }
    }
  })
  it('у каждого квеста есть ачивка', () => {
    for (const id of Object.keys(QUESTS)) expect(ACH[id], id).toBeDefined()
  })
  it('«Может, я тоже приеду поесть?» — не просто ответ, а квест «хаш в счёт долга»', async () => {
    const { game } = makeGame()
    await game.send({ text: 'Может, я тоже приеду поесть? В счёт долга.', tone: 'neutral', act: 'topic', arg: 'food:2' })
    expect(game.S.scene?.id).toBe('q_hash')
    game.S.choices = null
    const debt = game.S.debt
    await game.send(game.choices.find((c) => c.go === 'eat')!)
    expect(game.S.debt).toBe(debt - 1500)
    expect(game.S.ach.q_hash).toBeDefined()
  })
})

describe('начало игры и сериалы', () => {
  it('у каждой завязки есть обещание, ответ и «сколько прошло»', () => {
    for (const s of STARTS) { expect(s.intro.length).toBeGreaterThan(20); expect(s.gap).toContain('{d}') }
  })
  it('сюжетный ход запускает первый сериал, даже если игрок только спорит', async () => {
    const { game } = makeGame()
    game.S.stats.sent = 3
    let r
    for (let i = 0; i < 20 && r !== 'Beat_FirstArc'; i++) r = (await game.fire('StoryBeat'))?.name
    expect(r).toBe('Beat_FirstArc')
    expect(Object.keys(game.S.arcs)).toHaveLength(1)
  })
  it('первый сериал начинается в первые ходы', async () => {
    let early = 0
    for (let seed = 1; seed <= 10; seed++) {
      const { game } = makeGame({ seed })
      for (let t = 0; t < 12 && !Object.keys(game.S.arcs).length; t++) {
        if (game.battery.dead) await game.battery.charge()
        game.S.choices = null
        await game.send(game.choices.find((c) => c.tone === 'polite')!)
        game.S.scene = null
      }
      if (Object.keys(game.S.arcs).length) early++
    }
    expect(early).toBeGreaterThanOrEqual(7)
  })
})

describe('сцены: реплики персонажей', () => {
  it('реплика персонажа в сцене не получает обращение Алика, даже если уже звучала', async () => {
    const { game } = makeGame()
    game.seen.mark('Ме-е-е. (Это коза. Она свидетель.)')
    await game.enterNode('court', 'moo')
    const goat = game.S.msgs.flatMap((m) => (m.kind === 'text' && m.who === 'goar' ? [m.text] : []))
    expect(goat.at(-1)).toBe('Ме-е-е. (Это коза. Она свидетель.)')
  })
})
