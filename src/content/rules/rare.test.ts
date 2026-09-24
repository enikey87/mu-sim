// Правила из списков RARE и RARE_FLAKY (tools/rare.ts) статистический гейт сторожить не может —
// здесь каждое вызывается напрямую. Новое правило в списке = новая строка здесь; иначе гейт
// молча перестаёт его проверять.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../../test/helpers'
import type { Game } from '../../engine/game'
import type { Facts } from '../../engine/rules'
import { RARE_ALL } from '../../tools/rare'

type Case = { event: string; facts?: Facts; target?: string; setup?: (g: Game) => void }
const CASES: Record<string, Case> = {
  Due_Cosmic: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { g.S.tier = 3; g.recordPromise({ text: 'в пятницу — закину', d: 5 }); g.S.day += 5 } },
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
  Turn_WhileDead: { event: 'AlikTurn', setup: (g) => { g.S.mem.alik_dead = true } },
  Says_OtherArcWhileDead: { event: 'PlayerSays', facts: { intent: 'arc', arg: 'boris' }, setup: (g) => { g.S.mem.alik_dead = true } },
  Scene_wife: { event: 'PickScene', setup: (g) => { g.S.mem['count.rude'] = 1 } },
  Scene_tax: { event: 'PickScene', setup: (g) => { g.S.mem['count.threat'] = 1 } },
  Scene_lend: { event: 'PickScene', setup: (g) => { g.S.mood = 8 } },
  Quest_q_niva: { event: 'PickQuest', setup: (g) => { g.setLegend('niva_stuck', 'niva') } },
  Court_Lawyer: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem.court = 1 } },
  Says_sorry_sorrySwing3: { event: 'PlayerSays', facts: { intent: 'sorry' }, setup: (g) => { g.S.stats.sent = 10; g.S.mem.sorryAt = '8,9,10' } },
  Turn_Wedding_Samvel: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.samvel'] = true } },
  Turn_Wedding_Razmik: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.razmik'] = true } },
  Turn_Wedding_Boris: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.boris'] = true } },
  Chorus_garik_FedUp: { event: 'Mentioned', target: 'garik', setup: (g) => { g.S.mem['intro.garik'] = true; g.S.actors.garik = { interjections: 3 } } },
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
    const r = game.rules.match({ event: c.event, target: c.target, facts: c.facts ?? {} }, game.facts(c.facts ?? {}))
    if (r?.name === name) return true
  }
  return false
}

describe('редкие правила — детерминированно', () => {
  it('каждый случай срабатывает', () => {
    for (const [name, c] of Object.entries(CASES)) expect(fires(name, c), name).toBe(true)
  })
  // Кейсы и списки не связаны: правило, которое симуляция уверенно покрывает, уходит из списка,
  // но прямой случай остаётся страховкой, пока его кто-то не удалит осознанно.
  it('у каждой записи RARE и RARE_FLAKY есть случай', () => {
    expect([...RARE_ALL].filter((name) => !CASES[name])).toEqual([])
  })
})
