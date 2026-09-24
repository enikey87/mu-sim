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

const phone = (g: Game) => { g.rules.applyOps([during('phone.karine', 1)], {}) }
const dead = (g: Game) => { g.S.mem.alik_dead = true }
const blocked = (g: Game) => { g.S.mem.blocked = true }
const offended = (g: Game) => { g.S.mem[HEAT] = 1; g.S.ctx = { offended: true } }

const CASES: Record<string, Case> = {
  Quiet_Dead_AlikIdle: { event: 'AlikIdle', setup: dead },
  Quiet_Dead_AlikAway: { event: 'AlikAway', setup: dead },
  Quiet_Dead_StoryBeat: { event: 'StoryBeat', setup: dead },
  Quiet_Dead_PeriodLine: { event: 'PeriodLine', setup: dead },
  Quiet_Dead_PromiseDue: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { dead(g); g.recordPromise({ text: 'в пятницу', d: 1 }); g.S.day += 1 } },
  Quiet_Blocked_AlikAway: { event: 'AlikAway', setup: blocked },
  Quiet_Blocked_StoryBeat: { event: 'StoryBeat', setup: blocked },
  Quiet_Blocked_PeriodLine: { event: 'PeriodLine', setup: blocked },
  Quiet_Blocked_PromiseDue: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { blocked(g); g.recordPromise({ text: 'в пятницу', d: 1 }); g.S.day += 1 } },
  Quiet_PhoneKarine_AlikIdle: { event: 'AlikIdle', setup: phone },
  Quiet_PhoneKarine_AlikAway: { event: 'AlikAway', setup: phone },
  Quiet_PhoneKarine_StoryBeat: { event: 'StoryBeat', setup: phone },
  Quiet_PhoneKarine_PeriodLine: { event: 'PeriodLine', setup: phone },
  Quiet_PhoneKarine_PromiseDue: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { phone(g); g.recordPromise({ text: 'в пятницу', d: 1 }); g.S.day += 1 } },
  Phone_Karine_AlikTurn: { event: 'AlikTurn', setup: phone },
  Phone_Karine_PlayerMessage: { event: 'PlayerMessage', facts: { tone: 'neutral' }, setup: phone },
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
  Says_sorry_blocked_hinted: {
    event: 'PlayerSays', facts: { intent: 'sorry' },
    setup: (g) => { blocked(g); g.S.mem['blocked.hint'] = true },
  },
  Finale_boris_brigadir: { event: 'ArcFinale', facts: { arc: 'boris' }, setup: (g) => { g.S.mem['asked.boris'] = 6 } },
  Finale_boris_toyou: { event: 'ArcFinale', facts: { arc: 'boris' }, setup: (g) => { g.S.items.push('баран Борис') } },
  Finale_samvel_groom: { event: 'ArcFinale', facts: { arc: 'samvel' }, setup: (g) => { g.S.ach.saint = 1 } },
  Finale_niva_chose: { event: 'ArcFinale', facts: { arc: 'niva' }, setup: (g) => { g.S.items.push('«Нива» 1987 года') } },
  Finale_niva_chose_or: { event: 'ArcFinale', facts: { arc: 'niva' }, setup: (g) => { g.S.mem['asked.niva'] = 5 } },
  Finale_rubik_karine: { event: 'ArcFinale', facts: { arc: 'rubik' }, setup: (g) => { g.S.ach.wife = 1 } },
  Finale_alik_death_sulk: { event: 'ArcFinale', facts: { arc: 'alik_death' }, setup: () => {} },
  // наследство уходит Борису — он уже есть в партии (как SETUP['grandpa.revoke'] в finales.test.ts)
  Finale_grandpa_revoke: { event: 'ArcFinale', facts: { arc: 'grandpa' }, setup: (g) => { g.S.ach.heir = 1; g.S.arcs.boris = { i: 1, last: 0 } } },
  Ending_family: { event: 'CheckEnding', setup: (g) => { g.S.day = 300; g.S.mem['finale.samvel'] = 'groom' } },
  Ending_ram: {
    event: 'CheckEnding',
    setup: (g) => { g.S.day = 300; g.S.mem['finale.boris'] = 'toyou'; g.S.items.push('баран Борис', '½ фундамента') },
  },
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
  Ending_multiverse: { event: 'CheckEnding', setup: (g) => { endgame(g); g.S.day = 800; g.S.stats.sent = 300 } },
  Ending_payday_niva: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'niva' } },
  Tone_Thanks: { event: 'PlayerMessage', facts: { tone: 'polite', category: 'gratitude' } },
  Tone_Greeting: { event: 'PlayerMessage', facts: { tone: 'polite', category: 'greeting' } },
  Ending_payday_notyou: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'notyou' } },
  Ending_payday_lavash: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'lavash' } },
  Ending_payday_strasbourg: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'strasbourg' } },
  Payday_real: {
    event: 'PaydayOutcome',
    setup: (g) => {
      Object.assign(g.S.ach, { saint: 1, court: 1, q_hash: 1, q_goat: 1, q_niva: 1, q_mama: 1, q_photo: 1 })
      g.S.mem.caught = 3
    },
  },
  Payday_niva: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['finale.niva'] = 'chose' } },
  Payday_notyou: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['finale.razmik'] = 'default'; g.S.mem['count.rude'] = 8 } },
  Payday_lavash: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['payday.caught'] = true; g.S.mem['crypto.hodl'] = true } },
  Payday_strasbourg: { event: 'PaydayOutcome', setup: (g) => { g.S.ach.strasbourg = 1 } },
  Finale_razmik_swap: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.mem['count.rude'] = 10; g.S.mem[HEAT] = 3 } },
  Finale_razmik_union: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.ach.customer = 1 } },
  Says_via_mama: { event: 'PlayerSays', facts: { intent: 'via', arg: 'mama' } },
  Says_via_boris: { event: 'PlayerSays', facts: { intent: 'via', arg: 'boris' }, setup: (g) => { g.S.mem.blocked = true; g.S.mem['intro.boris'] = true } },
  Endgame_Money: { event: 'PlayerSays', facts: { intent: 'endgameMoney' }, setup: endgame },
  Endgame_Mute: { event: 'PlayerSays', facts: { intent: 'endgameMute' }, setup: endgame },
  Endgame_Leave: { event: 'PlayerSays', facts: { intent: 'endgameLeave' }, setup: endgame },
  Endgame_Request: { event: 'PlayerSays', facts: { intent: 'request', tone: 'neutral' }, setup: endgame },
  Endgame_Turn: { event: 'AlikTurn', setup: endgame },
  Endgame_Idle: { event: 'AlikIdle', setup: endgame },
  Endgame_Away: { event: 'AlikAway', setup: endgame },
  Endgame_Formality: { event: 'StoryBeat', setup: endgame },
  Endgame_NoEnding: { event: 'CheckEnding', setup: endgame },
  Turn_LightOff: { event: 'AlikTurn', setup: (g) => { g.S.mem['light.off'] = true } },
  Turn_NetRation: { event: 'AlikTurn', setup: (g) => { g.S.mem['net.ration'] = true } },
  Idle_PhoneWarn: { event: 'AlikIdle', setup: (g) => { g.S.mem['phone.warn'] = true } },
  Bill_Warn: { event: 'BillWarn', facts: { bill: 'phone' } },
  Bill_Due: { event: 'BillDue', facts: { bill: 'phone' } },
  Credit_Due: { event: 'CreditDue', facts: { credit: 'consumer' }, setup: (g) => { g.S.mem['credit.consumer.taken'] = true; g.S.money = 50000 } },
  Says_creditTake: { event: 'PlayerSays', facts: { intent: 'creditTake' }, setup: (g) => { g.S.mem['credit.offer'] = true; g.S.money = 1000 } },
  Says_creditSell: { event: 'PlayerSays', facts: { intent: 'creditSell' }, setup: (g) => { g.S.mem['credit.offer'] = true; g.S.money = 1000 } },
  Finale_beton_ledger: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.mem.caught = 2 } },
  Finale_nune_ledger: { event: 'ArcFinale', facts: { arc: 'nune' }, setup: (g) => { g.S.mem.caught = 2 } },
  Away_ColdWar: { event: 'AlikAway', setup: offended },
  Quiet_Offended_AlikAway: { event: 'AlikAway', setup: offended },
  Scene_amnesty: { event: 'PickScene', setup: (g) => { for (let i = 0; i < 8; i++) g.recordPromise({ text: `завтра №${i}`, d: 1 }); g.S.day += 5 } },
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
    expect(Object.keys(PROVEN).filter((name) => !CASES[name])).toEqual([])
  })
  it('у каждого случая есть запись PROVEN', () => {
    expect(Object.keys(CASES).filter((name) => !(name in PROVEN))).toEqual([])
  })
  // issue #102: Quiet_*_PromiseConditionMet были недостижимы — удалены, а не «освобождены»
  it('Quiet_*_PromiseConditionMet нет в правилах', async () => {
    const { allRules } = await import('../content/rules')
    expect(allRules.filter((r) => /^Quiet_.*_PromiseConditionMet$/.test(r.name)).map((r) => r.name)).toEqual([])
  })
})
