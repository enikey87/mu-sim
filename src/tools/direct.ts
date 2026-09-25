// Прямые случаи гейта покрытия (#278): правило, до которого бот в выборках не доходит или доходит не всегда,
// запускается здесь напрямую — direct.test.ts краснеет, если его сломать. Гейт (tools.test.ts) освобождает только
// правила из этого списка; убрал случай — правило снова под гейтом, и недостижимое краснеет.
import type { Game } from '../engine/game'
import type { Facts } from '../engine/rules'
import { during } from '../engine/rules'
import { HEAT, nuneKeyPassed } from '../content/memkeys'

export type DirectCase = { event: string; facts?: Facts; target?: string; setup?: (g: Game) => void }

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

export const DIRECT: Record<string, DirectCase> = {
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
  Turn_Wedding_Anush: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.anush'] = true } },
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
  // стенд доходит почти всегда (#133), но случай освобождает от гейта: его it держит правило сам
  Quiet_Dead_AlikIdle: { event: 'AlikIdle', setup: (g) => { g.S.mem.alik_dead = true } },
  Quiet_Dead_StoryBeat: { event: 'StoryBeat', setup: (g) => { g.S.mem.alik_dead = true } },
  Quiet_Blocked_StoryBeat: { event: 'StoryBeat', setup: (g) => { g.S.mem.blocked = true } },
  Turn_LightOff: { event: 'AlikTurn', setup: (g) => { g.S.mem['light.off'] = true } },
  Turn_NetRation: { event: 'AlikTurn', setup: (g) => { g.S.mem['net.ration'] = true } },
  Idle_PhoneWarn: { event: 'AlikIdle', setup: (g) => { g.S.mem['phone.warn'] = true } },
  Bill_Warn: { event: 'BillWarn', facts: { bill: 'phone' } },
  Bill_Due: { event: 'BillDue', facts: { bill: 'phone' } },
  Credit_Due: { event: 'CreditDue', facts: { credit: 'consumer' }, setup: (g) => { g.S.mem['credit.consumer.taken'] = true; g.adjustMoney(50000, 'Случай гейта') } },
  Payday_coins: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['payday.caught'] = true } },
  Ending_payday_coins: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'coins' } },
  // стенд доходит не в каждой выборке (#269); наследство деда уходит Борису — он уже в партии
  Ending_payday_notyou: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'notyou' } },
  Ending_payday_strasbourg: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'strasbourg' } },
  Finale_beton_ledger: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.mem.caught = 2 } },
  Finale_grandpa_revoke: { event: 'ArcFinale', facts: { arc: 'grandpa' }, setup: (g) => { g.S.ach.heir = 1; g.S.arcs.boris = { i: 1, last: 0 } } },
  Finale_nune_ledger: { event: 'ArcFinale', facts: { arc: 'nune' }, setup: (g) => { g.S.mem.caught = 2 } },
  Finale_razmik_swap: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.mem['count.rude'] = 10; g.S.mem[HEAT] = 3 } },
  Finale_razmik_union: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.ach.customer = 1 } },
  Finale_rubik_karine: { event: 'ArcFinale', facts: { arc: 'rubik' }, setup: (g) => { g.S.ach.wife = 1 } },
  Payday_notyou: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['finale.razmik'] = 'default'; g.S.mem['count.rude'] = 8 } },
  Payday_strasbourg: { event: 'PaydayOutcome', setup: (g) => { g.S.ach.strasbourg = 1 } },
  Quiet_Blocked_PromiseDue: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { g.S.mem.blocked = true; g.recordPromise({ text: 'в пятницу', d: 1 }); g.S.day += 1 } },
  Quiet_Dead_AlikAway: { event: 'AlikAway', setup: (g) => { g.S.mem.alik_dead = true } },
  Quiet_Dead_PromiseDue: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { g.S.mem.alik_dead = true; g.recordPromise({ text: 'в пятницу', d: 1 }); g.S.day += 1 } },
  Says_sorry_blocked_hinted: {
    event: 'PlayerSays', facts: { intent: 'sorry' },
    setup: (g) => { g.S.mem.blocked = true; g.S.mem['blocked.hint'] = true },
  },
  Says_via_mama: { event: 'PlayerSays', facts: { intent: 'via', arg: 'mama' } },
  Scene_amnesty: { event: 'PickScene', setup: (g) => { for (let i = 0; i < 5; i++) g.recordPromise({ text: `завтра №${i}`, d: 1 }); g.S.day += 5 } },
  Ending_payday_lavash: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'lavash' } },
  Ending_ram: {
    event: 'CheckEnding',
    setup: (g) => { g.S.day = 300; g.S.mem['finale.boris'] = 'toyou'; g.S.items.push('баран Борис', '½ фундамента') },
  },
  Finale_boris_toyou: { event: 'ArcFinale', facts: { arc: 'boris' }, setup: (g) => { g.S.items.push('баран Борис') } },
  Finale_niva_chose: { event: 'ArcFinale', facts: { arc: 'niva' }, setup: (g) => { g.S.items.push('«Нива» 1987 года') } },
  Payday_lavash: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['payday.caught'] = true; g.S.mem['crypto.hodl'] = true } },
  Phone_Karine_PlayerMessage: { event: 'PlayerMessage', facts: { tone: 'neutral' }, setup: (g) => { g.rules.applyOps([during('phone.karine', 1)], {}) } },
  Quiet_Blocked_AlikAway: { event: 'AlikAway', setup: (g) => { g.S.mem.blocked = true } },
  Quiet_PhoneKarine_AlikIdle: { event: 'AlikIdle', setup: (g) => { g.rules.applyOps([during('phone.karine', 1)], {}) } },
  Quiet_PhoneKarine_StoryBeat: { event: 'StoryBeat', setup: (g) => { g.rules.applyOps([during('phone.karine', 1)], {}) } },
  Says_sorry_blocked_boris: { event: 'PlayerSays', facts: { intent: 'sorry' }, setup: (g) => { g.S.mem.blocked = true; g.S.arcs.boris = { i: 4, last: 0 } } },
  // стенд не доходит никогда: окна, которые бот не открывает сам (свободный «спасибо», вендетта, телефон Карине…)
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
  Quiet_PaydayOpen_StoryBeat: { event: 'StoryBeat', setup: (g) => { paydayOpen(g); g.S.stats.sent = 5 } },
  Away_ColdWar: { event: 'AlikAway', setup: offended },
  Quiet_Offended_AlikAway: { event: 'AlikAway', setup: offended },
  Due_StakeKept: {
    event: 'PromiseDue', facts: { promise: 0 },
    setup: (g) => { g.S.mood = 9; g.recordPromise({ text: 'завтра — всё', d: 1, stake: 'moustache' }); g.S.day += 1 },
  },
  Condition_StakeShave: {
    event: 'PromiseConditionMet', facts: { promise: 0 },
    setup: (g) => {
      g.S.mood = 3
      g.recordPromise({ text: 'как ключ выйдет', d: null, condition: nuneKeyPassed, stake: 'moustache' })
      g.S.mem[nuneKeyPassed] = true
      g.S.promises[0].met = g.S.day
    },
  },
  Condition_StakeKept: {
    event: 'PromiseConditionMet', facts: { promise: 0 },
    setup: (g) => {
      g.S.mood = 9
      g.recordPromise({ text: 'как ключ выйдет', d: null, condition: nuneKeyPassed, stake: 'moustache' })
      g.S.mem[nuneKeyPassed] = true
      g.S.promises[0].met = g.S.day
    },
  },
}
