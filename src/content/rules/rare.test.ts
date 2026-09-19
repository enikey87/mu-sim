// Правила из списка RARE (tools.test.ts) в симуляции срабатывают редко — здесь каждое вызывается напрямую.
// Новое правило в RARE = новая строка здесь; иначе статистический тест молча перестаёт его проверять.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../../test/helpers'
import type { Game } from '../../engine/game'
import type { Facts } from '../../engine/rules'
import { RARE } from '../../tools/rare'

type Case = { event: string; facts?: Facts; setup?: (g: Game) => void }
const CASES: Record<string, Case> = {
  Due_Cosmic: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { g.S.tier = 3; g.recordPromise({ text: 'в пятницу — закину', d: 5 }) } },
  Tone_Cow: { event: 'PlayerMessage', facts: { tone: 'cow' } },
  Says_catchLie_liekind_grandpa: { event: 'PlayerSays', facts: { intent: 'catchLie' }, setup: (g) => { g.S.mem['lie.kind'] = 'grandpa' } },
  Says_catchLie_liekind_customer: { event: 'PlayerSays', facts: { intent: 'catchLie' }, setup: (g) => { g.S.mem['lie.kind'] = 'customer' } },
  Says_catchLie_liekind_sent: { event: 'PlayerSays', facts: { intent: 'catchLie' }, setup: (g) => { g.S.mem['lie.kind'] = 'sent' } },
  Says_catchLie_caught2: { event: 'PlayerSays', facts: { intent: 'catchLie' }, setup: (g) => { g.S.mem.caught = 2 } },
  Says_catchLie_caught3: { event: 'PlayerSays', facts: { intent: 'catchLie' }, setup: (g) => { g.S.mem.caught = 3 } },
  Says_condole_ctxrevived: { event: 'PlayerSays', facts: { intent: 'condole' }, setup: (g) => { g.S.ctx = { revived: true } } },
  Turn_BorisSick: { event: 'AlikTurn', setup: (g) => { g.S.arcs.boris = { i: 2, last: 0 }; g.S.actors.boris = { sick: true } } },
  Opt_Cow: { event: 'BuildChoices', setup: (g) => { g.S.mem.mooAt = g.S.stats.sent } },
  Idle_Offline: { event: 'AlikIdle', setup: (g) => { g.S.offlineDays = 2 } },
  Beat_FirstArc: { event: 'StoryBeat', setup: (g) => { g.S.stats.sent = 5 } },
  Says_WhileOffline: { event: 'PlayerSays', facts: { intent: 'photo' }, setup: (g) => { g.S.offlineDays = 2 } },
  Says_request: { event: 'PlayerSays', facts: { intent: 'request' } },
  Turn_WhileDead: { event: 'AlikTurn', setup: (g) => { g.S.mem.alik_dead = true } },
  Scene_wife: { event: 'PickScene', setup: (g) => { g.S.mem['count.rude'] = 1 } },
  Scene_tax: { event: 'PickScene', setup: (g) => { g.S.mem['count.threat'] = 1 } },
  Scene_lend: { event: 'PickScene', setup: (g) => { g.S.mood = 8 } },
  Quest_q_niva: { event: 'PickQuest', setup: (g) => { g.setLegend('niva_stuck', 'niva') } },
}

/** Срабатывает ли правило (у многих есть шанс — пробуем на разных сидах). */
function fires(name: string, c: Case): boolean {
  for (let seed = 1; seed <= 40; seed++) {
    const { game } = makeGame({ seed })
    c.setup?.(game)
    if (c.event === 'BuildChoices') {
      if (game.rules.collect({ event: c.event }, game.facts()).some((r) => r.name === name)) return true
      continue
    }
    const r = game.rules.match({ event: c.event, facts: c.facts ?? {} }, game.facts(c.facts ?? {}))
    if (r?.name === name) return true
  }
  return false
}

describe('редкие правила — детерминированно', () => {
  it('у каждого правила из RARE есть случай, и оно срабатывает', () => {
    for (const name of RARE) {
      expect(CASES[name], `нет случая для ${name}`).toBeDefined()
      expect(fires(name, CASES[name]), name).toBe(true)
    }
  })
})
