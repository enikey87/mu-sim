// Правила из списка RARE (tools/rare.ts) статистический гейт сторожить не может —
// здесь каждое вызывается напрямую. Новое правило в списке = новая строка здесь; иначе гейт
// молча перестаёт его проверять.
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney } from '../../test/helpers'
import type { Game } from '../../engine/game'
import type { Facts } from '../../engine/rules'
import { RARE } from '../../tools/rare'

type Case = { event: string; facts?: Facts; target?: string; setup?: (g: Game) => void }
const CASES: Record<string, Case> = {
  Due_Cosmic: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { g.S.tier = 3; g.recordPromise({ text: 'в пятницу — закину', d: 5 }); g.S.day += 5 } },
  Due_Kept: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { g.S.mood = 9; g.recordPromise({ text: 'в пятницу — закину', d: 5 }); g.S.day += 5 } },
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
  Away_Offline: { event: 'AlikAway', setup: (g) => { g.S.offlineDays = 2 } },
  Beat_FirstArc: { event: 'StoryBeat', setup: (g) => { g.S.stats.sent = 5 } },
  Says_WhileOffline: { event: 'PlayerSays', facts: { intent: 'photo' }, setup: (g) => { g.S.offlineDays = 2 } },
  Turn_WhileDead: { event: 'AlikTurn', setup: (g) => { g.S.mem.alik_dead = true } },
  Says_OtherArcWhileDead: { event: 'PlayerSays', facts: { intent: 'arc', arg: 'boris' }, setup: (g) => { g.S.mem.alik_dead = true } },
  Scene_wife: { event: 'PickScene', setup: (g) => { g.S.mem['count.rude'] = 1 } },
  Scene_tax: { event: 'PickScene', setup: (g) => { g.S.mem['count.threat'] = 1 } },
  Scene_lend: { event: 'PickScene', setup: (g) => { g.S.mood = 8 } },
  Quest_q_niva: { event: 'PickQuest', setup: (g) => { g.setLegend('niva_stuck', 'niva') } },
  Court_Lawyer: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem.court = 1 } },
  Court_Lawyer_Again: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem.court = 1; g.S.mem['intro.arsen'] = true } },
  Court_After: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem.court = 7 } },
  Court_Verdict_Lettered: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem.court = 6; g.S.mem.payday = 'strasbourg' } },
  Says_sorry_sorrySwing3: { event: 'PlayerSays', facts: { intent: 'sorry' }, setup: (g) => { g.S.stats.sent = 10; g.S.mem.sorryAt = '8,9,10' } },
  Turn_Wedding_Samvel: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.samvel'] = true } },
  Turn_Wedding_Razmik: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.razmik'] = true } },
  Turn_Wedding_Boris: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.boris'] = true } },
  Chorus_garik_FedUp: { event: 'Mentioned', target: 'garik', setup: (g) => { g.S.mem['intro.garik'] = true; g.S.actors.garik = { interjections: 3 } } },
  // частные финалы — условия как у игрока (finales.test.ts SETUP)
  Finale_beton_opened: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.mem['count.rude'] = 6; g.S.mem['rude.heat'] = 2 } },
  Finale_beton_opened_or: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.mem.court = 5 } },
  Finale_beton_corner: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.ach.redo = 1 } },
  Finale_grant_ally: { event: 'ArcFinale', facts: { arc: 'grant' }, setup: (g) => { g.S.ach.customer = 1 } },
  Finale_razmik_shift_or: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.ach.newjob = 1 } },
  Finale_garik_cutter: { event: 'ArcFinale', facts: { arc: 'garik' }, setup: (g) => { g.S.ach.newjob = 1 } },
  Finale_alik_death_will: { event: 'ArcFinale', facts: { arc: 'alik_death' }, setup: (g) => { g.S.ach.forgive = 1; g.S.mem['asked.alik_death'] = 1 } },
  Finale_rubik_bribe: { event: 'ArcFinale', facts: { arc: 'rubik' }, setup: (g) => { g.S.ach.redo = 1 } },
  Finale_tile_lost: { event: 'ArcFinale', facts: { arc: 'tile' }, setup: (g) => { g.S.mem.court = 6 } },
  Finale_samvel_tamada: { event: 'ArcFinale', facts: { arc: 'samvel' }, setup: (g) => { g.S.ach.toast = 1 } },
  Ending_alik: { event: 'CheckEnding', setup: (g) => { g.S.day = 300; g.S.mem['finale.garik'] = 'cutter'; g.S.ach.fence = 1 } },
  Ending_heir: { event: 'CheckEnding', setup: (g) => { g.S.day = 300; g.S.mem['finale.alik_death'] = 'will' } },
  // встречный иск на горячую угрозу — один раз, дальше «опять угрожаешь»
  Tone_Threat_Hot_Again: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem['rude.heat'] = 2; g.S.rules.once.Tone_Threat_Hot = true } },
  Tone_WhileBlocked: { event: 'PlayerMessage', facts: { tone: 'neutral' }, setup: (g) => { g.S.mem.blocked = true } },
  Says_sorry_blocked_karine: { event: 'PlayerSays', facts: { intent: 'sorry' }, setup: (g) => { g.S.mem.blocked = true } },
  Says_via_boris: { event: 'PlayerSays', facts: { intent: 'via', arg: 'boris' }, setup: (g) => { g.S.mem.blocked = true } },
  Says_prev_ThickJournal: {
    event: 'PlayerSays', facts: { intent: 'prev', arg: '0' },
    setup: (g) => { for (let i = 0; i < 5; i++) g.recordPromise({ text: `завтра №${i}`, d: 1 }); g.S.day += 5 },
  },
  Quiet_PaydayOpen_PromiseDue: {
    event: 'PromiseDue', facts: { promise: 0 },
    setup: (g) => {
      g.S.mem.payday = 'default'
      g.S.ending = 'payday_default'
      g.S.endings.payday_default = g.S.day
      g.recordPromise({ text: 'в пятницу', d: 1 })
      g.S.day += 1
    },
  },
  Quiet_PaydayOpen_AlikIdle: {
    event: 'AlikIdle',
    setup: (g) => {
      g.S.mem.payday = 'default'
      g.S.ending = 'payday_default'
      g.S.endings.payday_default = g.S.day
    },
  },
  Quiet_PaydayOpen_Mentioned: {
    event: 'Mentioned', target: 'garik',
    setup: (g) => {
      g.S.mem.payday = 'default'
      g.S.ending = 'payday_default'
      g.S.endings.payday_default = g.S.day
      g.S.mem['intro.garik'] = true
    },
  },
  // бывшие PROVEN, до которых стенд доходит почти всегда (#133): под гейтом, случай — страховка
  Quiet_Dead_AlikIdle: { event: 'AlikIdle', setup: (g) => { g.S.mem.alik_dead = true } },
  Quiet_Dead_StoryBeat: { event: 'StoryBeat', setup: (g) => { g.S.mem.alik_dead = true } },
  Quiet_Blocked_StoryBeat: { event: 'StoryBeat', setup: (g) => { g.S.mem.blocked = true } },
  Turn_LightOff: { event: 'AlikTurn', setup: (g) => { g.S.mem['light.off'] = true } },
  Turn_NetRation: { event: 'AlikTurn', setup: (g) => { g.S.mem['net.ration'] = true } },
  Idle_PhoneWarn: { event: 'AlikIdle', setup: (g) => { g.S.mem['phone.warn'] = true } },
  Bill_Warn: { event: 'BillWarn', facts: { bill: 'phone' } },
  Bill_Due: { event: 'BillDue', facts: { bill: 'phone' } },
  Credit_Due: { event: 'CreditDue', facts: { credit: 'consumer' }, setup: (g) => { g.S.mem['credit.consumer.taken'] = true; setMoney(g, 50000) } },
  Says_creditTake: { event: 'PlayerSays', facts: { intent: 'creditTake' }, setup: (g) => { g.S.mem['credit.offer'] = true; setMoney(g, 1000) } },
  Says_creditSell: { event: 'PlayerSays', facts: { intent: 'creditSell' }, setup: (g) => { g.S.mem['credit.offer'] = true; setMoney(g, 1000) } },
  Payday_coins: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['payday.caught'] = true } },
  Ending_payday_coins: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'coins' } },
  Says_sorry_blocked_boris: { event: 'PlayerSays', facts: { intent: 'sorry' }, setup: (g) => { g.S.mem.blocked = true; g.S.arcs.boris = { i: 4, last: 0 } } },
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
  it('у каждой записи RARE есть случай', () => {
    expect([...RARE].filter((name) => !CASES[name])).toEqual([])
  })
})
