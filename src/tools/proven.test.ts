// Каждая запись PROVEN — прямой случай здесь. Без случая гейт coverage молча перестаёт сторожить.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import type { Facts } from '../engine/rules'
import { during } from '../engine/rules'
import { HEAT } from '../content/memkeys'
import { PROVEN } from './proven'

type Case = { event: string; facts?: Facts; setup?: (g: Game) => void }

const endgame = (g: Game) => {
  g.S.mem.payday = 'default'
  g.S.ending = 'payday_default'
  g.S.endings.payday_default = g.S.day
  g.closeEnding()
}
/** Экран концовки выплаты открыт, эндгейм ещё не начат — окно Quiet_PaydayOpen_* (#190). */
const paydayOpen = (g: Game) => {
  g.S.mem.payday = 'default'
  g.S.ending = 'payday_default'
  g.S.endings.payday_default = g.S.day
}

const phone = (g: Game) => { g.rules.applyOps([during('phone.karine', 1)], {}) }
const dead = (g: Game) => { g.S.mem.alik_dead = true }
const blocked = (g: Game) => { g.S.mem.blocked = true }
const offended = (g: Game) => { g.S.mem[HEAT] = 1; g.S.ctx = { offended: true } }

const CASES: Record<string, Case> = {
  Quiet_Dead_PeriodLine: { event: 'PeriodLine', setup: dead },
  Quiet_Blocked_PeriodLine: { event: 'PeriodLine', setup: blocked },
  Quiet_PhoneKarine_AlikAway: { event: 'AlikAway', setup: phone },
  Quiet_PhoneKarine_PeriodLine: { event: 'PeriodLine', setup: phone },
  Quiet_PhoneKarine_PromiseDue: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { phone(g); g.recordPromise({ text: 'в пятницу', d: 1 }); g.S.day += 1 } },
  Phone_Karine_AlikTurn: { event: 'AlikTurn', setup: phone },
  Phone_Karine_PlayerSays: { event: 'PlayerSays', facts: { intent: 'photo' }, setup: phone },
  Turn_Blocked: { event: 'AlikTurn', setup: blocked },
  Turn_Vendetta: { event: 'AlikTurn', setup: (g) => { g.S.mem.vendetta = true } },
  Rude_Vendetta: {
    event: 'PlayerMessage', facts: { tone: 'rude' },
    setup: (g) => { g.S.mem[HEAT] = 5; g.S.mem['count.rude'] = 25; g.S.mem['count.sorry'] = 0 },
  },
  Says_sorry_blocked: {
    event: 'PlayerSays', facts: { intent: 'sorry' },
    setup: (g) => { blocked(g); g.S.mem['finale.rubik'] = 'karine' },
  },
  Finale_boris_brigadir: { event: 'ArcFinale', facts: { arc: 'boris' }, setup: (g) => { g.S.mem['asked.boris'] = 6 } },
  Finale_samvel_groom: { event: 'ArcFinale', facts: { arc: 'samvel' }, setup: (g) => { g.S.ach.saint = 1 } },
  Finale_niva_chose_or: { event: 'ArcFinale', facts: { arc: 'niva' }, setup: (g) => { g.S.mem['asked.niva'] = 5 } },
  Finale_alik_death_sulk: { event: 'ArcFinale', facts: { arc: 'alik_death' }, setup: () => {} },
  Ending_family: { event: 'CheckEnding', setup: (g) => { g.S.day = 300; g.S.mem['finale.samvel'] = 'groom' } },
  Ending_honest: {
    event: 'CheckEnding',
    setup: (g) => {
      g.S.day = 300
      g.S.mem['finale.boris'] = 'brigadir'
      g.S.mem['finale.grant'] = 'ally'
      g.S.mem['finale.niva'] = 'chose'
    },
  },
  Ending_vendetta: { event: 'CheckEnding', setup: (g) => { g.S.day = 300; g.S.mem.vendetta = true } },
  Ending_payday_real: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'real' } },
  Ending_payday_niva: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'niva' } },
  Tone_Thanks: { event: 'PlayerMessage', facts: { tone: 'polite', category: 'gratitude' } },
  Tone_Greeting: { event: 'PlayerMessage', facts: { tone: 'polite', category: 'greeting' } },
  Payday_real: {
    event: 'PaydayOutcome',
    setup: (g) => {
      Object.assign(g.S.ach, { saint: 1, court: 1, q_hash: 1, q_goat: 1, q_niva: 1, q_mama: 1, q_photo: 1 })
      g.S.mem.caught = 3
    },
  },
  Payday_niva: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['finale.niva'] = 'chose' } },
  Endgame_Turn: { event: 'AlikTurn', setup: endgame },
  Quiet_PaydayOpen_AlikAway: { event: 'AlikAway', setup: paydayOpen },
  Quiet_PaydayOpen_PeriodLine: { event: 'PeriodLine', setup: paydayOpen },
  Quiet_PaydayOpen_StoryBeat: { event: 'StoryBeat', setup: paydayOpen },
  Away_ColdWar: { event: 'AlikAway', setup: offended },
  Quiet_Offended_AlikAway: { event: 'AlikAway', setup: offended },
}

function fires(name: string, c: Case): boolean {
  for (let seed = 1; seed <= 40; seed++) {
    const { game } = makeGame({ seed })
    c.setup?.(game)
    const r = game.rules.match({ event: c.event, facts: c.facts ?? {} }, game.facts(c.facts ?? {}))
    if (r?.name === name) return true
  }
  return false
}

describe('proven — прямые случаи для гейта покрытия', () => {
  it('каждый случай срабатывает', () => {
    for (const [name, c] of Object.entries(CASES)) expect(fires(name, c), name).toBe(true)
  })
  it('у каждой записи PROVEN есть случай', () => {
    expect([...PROVEN].filter((name) => !CASES[name])).toEqual([])
  })
  it('у каждого случая есть запись PROVEN', () => {
    expect(Object.keys(CASES).filter((name) => !PROVEN.has(name))).toEqual([])
  })
  // issue #102: Quiet_*_PromiseConditionMet были недостижимы — удалены, а не «освобождены»
  it('Quiet_*_PromiseConditionMet нет в правилах', async () => {
    const { allRules } = await import('../content/rules')
    expect(allRules.filter((r) => /^Quiet_.*_PromiseConditionMet$/.test(r.name)).map((r) => r.name)).toEqual([])
  })
})
