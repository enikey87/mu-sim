// Прямые случаи гейта покрытия (#278): правило, до которого бот в выборках не доходит или доходит не всегда,
// запускается здесь напрямую — direct.test.ts краснеет, если его сломать. Гейт (tools.test.ts) освобождает запись
// только пока правило в выборках сыграно реже DIRECT_MIN_GAMES партий (#329): чаще — красное «снять из DIRECT»;
// убрал случай — правило снова под гейтом, и недостижимое краснеет.
import type { Game } from '../engine/game'
import type { Facts } from '../engine/rules'
import { during } from '../engine/rules'
import { HEAT, legendDay, legendId, nuneKeyPassed, sorryAt } from '../content/memkeys'

export type DirectCase = { event: string; facts?: Facts; target?: string; setup?: (g: Game) => void }

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
  Tone_Cow: { event: 'PlayerMessage', facts: { tone: 'cow' } },
  Says_catchLie_lieKind_grandpa: { event: 'PlayerSays', facts: { intent: 'catchLie' }, setup: (g) => { g.noteClaims(['grandpa_dead']); g.noteClaims(['grandpa_alive']) } },
  // #426: sys-claim Гранта («всё заплатил») противоречит «заказчик мне не платит» — бот ловит это сам, 34 партии
  Turn_BorisSick: { event: 'AlikTurn', setup: (g) => { g.S.arcs.boris = { i: 2, last: 0 }; g.S.actors.boris = { sick: true } } },
  Opt_Cow: { event: 'BuildChoices', setup: (g) => { g.S.mem.mooAt = g.S.stats.sent } },
  Away_Offline: { event: 'AlikAway', setup: (g) => { g.S.offlineDays = 2 } },
  Turn_WhileDead: { event: 'AlikTurn', setup: (g) => { g.S.mem.alik_dead = true } },
  // гарантия первой серии (#636): к 12-му сообщению шанс Turn_ArcFirst мог промахнуться всю посадку
  Turn_ArcGuarantee: { event: 'AlikTurn', setup: (g) => { g.S.stats.sent = 12 } },
  Says_OtherArcWhileDead: { event: 'PlayerSays', facts: { intent: 'arc', arg: 'boris' }, setup: (g) => { g.S.mem.alik_dead = true } },
  Court_Verdict_Lettered: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem.court = 6; g.S.mem.payday = 'strasbourg' } },
  // #553: дрейф сроков платежей увёл оба правила из выборок — прямой случай держит их под гейтом
  Court_After: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem.court = 7 } },
  Says_sorry_sorrySwing3: {
    event: 'PlayerSays',
    facts: { intent: 'sorry' },
    setup: (g) => { const t = g.S.stats.sent; g.S.mem[sorryAt] = [t - 1, t - 2, t - 3].join(',') },
  },
  Turn_Wedding_Samvel: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.samvel'] = true } },
  Turn_Wedding_Razmik: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.razmik'] = true } },
  Turn_Wedding_Boris: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.boris'] = true } },
  Turn_Wedding_Anush: { event: 'AlikTurn', setup: (g) => { g.S.mem['wedding.anush'] = true } },
  // частные финалы — условия как у игрока (finales.test.ts SETUP)
  Finale_beton_opened_or: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.mem.court = 5 } },
  Finale_beton_corner: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.ach.redo = 1 } },
  // два пойманных вранья: после #682 (тексты серий сдвинули поток розыгрышей) бот в выборках до него не доходит,
  // но в полной выборке финал звучал — случай прямой, не объяснение недостижимости
  Finale_beton_ledger: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.mem.caught = 2 } },
  Finale_grant_ally: { event: 'ArcFinale', facts: { arc: 'grant' }, setup: (g) => { g.S.ach.customer = 1 } },
  Finale_razmik_shift_or: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.ach.newjob = 1 } },
  Finale_garik_cutter: { event: 'ArcFinale', facts: { arc: 'garik' }, setup: (g) => { g.S.ach.newjob = 1 } },
  Finale_alik_death_will: { event: 'ArcFinale', facts: { arc: 'alik_death' }, setup: (g) => { g.S.ach.forgive = 1; g.S.mem['asked.alik_death'] = 1 } },
  Finale_rubik_bribe: { event: 'ArcFinale', facts: { arc: 'rubik' }, setup: (g) => { g.S.ach.redo = 1 } },
  Finale_samvel_tamada: { event: 'ArcFinale', facts: { arc: 'samvel' }, setup: (g) => { g.S.ach.toast = 1 } },
  Ending_alik: { event: 'CheckEnding', setup: (g) => { g.S.day = 300; g.S.mem['finale.garik'] = 'cutter' } },
  Ending_heir: { event: 'CheckEnding', setup: (g) => { g.S.day = 300; g.S.mem['finale.alik_death'] = 'will' } },
  Says_via_boris: { event: 'PlayerSays', facts: { intent: 'via', arg: 'boris' }, setup: (g) => { g.S.mem.blocked = true } },
  // с колкостями (#683) PromiseDue в открытом экране выплаты ловят сами выборки — случай снят по порогу гейта
  // стенд мёртвого телефона больше не доходит и в выборках (#133): оставшиеся редкие окна держатся случаями ниже
  Quiet_Dead_AlikAway: { event: 'AlikAway', setup: (g) => { g.S.mem.alik_dead = true } },
  // стенд доходит не в каждой выборке (#269); наследство деда уходит Борису — он уже в партии
  Ending_payday_notyou: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'notyou' } },
  Ending_payday_strasbourg: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'strasbourg' } },
  Finale_grandpa_revoke: { event: 'ArcFinale', facts: { arc: 'grandpa' }, setup: (g) => { g.S.ach.heir = 1; g.S.arcs.boris = { i: 1, last: 0 } } },
  Finale_razmik_swap: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.mem['count.rude'] = 10; g.S.mem[HEAT] = 3 } },
  Finale_razmik_union: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.ach.customer = 1 } },
  Finale_rubik_karine: { event: 'ArcFinale', facts: { arc: 'rubik' }, setup: (g) => { g.S.ach.wife = 1 } },
  Payday_notyou: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['finale.razmik'] = 'default' } },
  Payday_strasbourg: { event: 'PaydayOutcome', setup: (g) => { g.S.ach.strasbourg = 1 } },
  Quiet_Blocked_PromiseDue: { event: 'PromiseDue', facts: { promise: 0 }, setup: (g) => { g.S.mem.blocked = true; g.recordPromise({ text: 'в пятницу', d: 1 }); g.S.day += 1 } },
  Says_sorry_blocked_hinted: {
    event: 'PlayerSays', facts: { intent: 'sorry' },
    setup: (g) => { g.S.mem.blocked = true; g.S.mem['blocked.hint'] = true },
  },
  Says_via_mama: { event: 'PlayerSays', facts: { intent: 'via', arg: 'mama' } },
  Ending_payday_lavash: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'lavash' } },
  Ending_ram: {
    event: 'CheckEnding',
    setup: (g) => { g.S.day = 300; g.S.mem['finale.boris'] = 'toyou' },
  },
  Finale_boris_toyou: { event: 'ArcFinale', facts: { arc: 'boris' }, setup: (g) => { g.S.items.push('баран Борис') } },
  Finale_niva_chose: { event: 'ArcFinale', facts: { arc: 'niva' }, setup: (g) => { g.S.items.push('«Нива» 1987 года') } },
  Payday_lavash: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['crypto.hodl'] = true } },
  Phone_Karine_PlayerMessage: { event: 'PlayerMessage', facts: { tone: 'neutral' }, setup: (g) => { g.rules.applyOps([during('phone.karine', 1)], {}) } },
  Quiet_Blocked_AlikAway: { event: 'AlikAway', setup: (g) => { g.S.mem.blocked = true } },
  Quiet_PhoneKarine_AlikIdle: { event: 'AlikIdle', setup: (g) => { g.rules.applyOps([during('phone.karine', 1)], {}) } },
  Quiet_PhoneKarine_StoryBeat: { event: 'StoryBeat', setup: (g) => { g.rules.applyOps([during('phone.karine', 1)], {}) } },
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
  // #762: барахолка получила вес 5 и перерыв 12 — выборки бота сдвинулись, и «Вендетта» с концовкой
  // теперь играются в 7+ партиях из 72: гейт видит их сам, прямые случаи сняты. Содержательные проверки
  // остались на месте (rude.test.ts — 15-й крик без извинений; finales.test.ts — концовка путём игрока).
  Says_sorry_blocked: {
    event: 'PlayerSays', facts: { intent: 'sorry' },
    setup: (g) => { blocked(g); g.S.mem['finale.rubik'] = 'karine' },
  },
  // Finale_boris_brigadir снят: после переноса открытки строителя из FWD выборки видят финал сами (7 партий). Путь — finales.test.ts.
  Finale_samvel_groom: { event: 'ArcFinale', facts: { arc: 'samvel' }, setup: (g) => { g.S.ach.saint = 1; g.S.mem['count.rude'] = 3 } },
  Finale_alik_death_sulk: { event: 'ArcFinale', facts: { arc: 'alik_death' }, setup: () => {} },
  Ending_family: { event: 'CheckEnding', setup: (g) => { g.S.day = 300; g.S.mem['finale.samvel'] = 'groom' } },
  Ending_honest: {
    event: 'CheckEnding',
    setup: (g) => { g.S.day = 300; g.S.mem['finale.grant'] = 'ally' },
  },
  Ending_payday_real: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'real' } },
  Tone_Thanks: { event: 'PlayerMessage', facts: { tone: 'polite', category: 'gratitude' } },
  Tone_Greeting: { event: 'PlayerMessage', facts: { tone: 'polite', category: 'greeting' } },
  Payday_real: {
    event: 'PaydayOutcome',
    setup: (g) => {
      Object.assign(g.S.ach, { saint: 1, court: 1 })
    },
  },
  Quiet_PaydayOpen_AlikAway: { event: 'AlikAway', setup: paydayOpen },
  Quiet_PaydayOpen_PeriodLine: { event: 'PeriodLine', setup: paydayOpen },
  Quiet_PaydayOpen_StoryBeat: { event: 'StoryBeat', setup: (g) => { paydayOpen(g); g.S.stats.sent = 5 } },
  Away_ColdWar: { event: 'AlikAway', setup: offended },
  Quiet_Offended_AlikAway: { event: 'AlikAway', setup: offended },
  Due_StakeKept: {
    event: 'PromiseDue', facts: { promise: 0 },
    setup: (g) => { g.S.mood = 9; g.recordPromise({ text: 'завтра — всё', d: 1, stake: 'moustache' }); g.S.day += 1 },
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
  // #571: переразметка сроков («никогда» без числа) увела траектории выборок — пять правил держим прямыми случаями
  Scene_heir: { event: 'PickScene', setup: (g) => { g.S.arcs.grandpa = { i: 4, last: 0 }; g.S.arcs.boris = { i: 4, last: 0 } } },
  Chorus_garik_FedUp: { event: 'Mentioned', target: 'garik', setup: (g) => { g.S.mem['intro.garik'] = true; g.S.actors.garik = { interjections: 3 } } },
  Finale_razmik_shift: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.ach.fence = 1 } },
  Finale_tile_lost: { event: 'ArcFinale', facts: { arc: 'tile' }, setup: (g) => { g.S.mem.court = 6 } },
  Says_sorry_blocked_boris: { event: 'PlayerSays', facts: { intent: 'sorry' }, setup: (g) => { blocked(g); g.S.arcs.boris = { i: 4, last: 0 } } },
  // #576: звонок с объекта сдвинул розыгрыш выборок — сцена «если спросят» из них ушла; гейт по воротке угрозы
  Scene_tax: { event: 'PickScene', setup: (g) => { g.S.mem['count.threat'] = 1 } },
  // #679: разворот коллекторов сдвинул розыгрыш выборок — сцена амнистии ушла из них
  // с колкостями (#683) распухший журнал собирается ботами сам — случай снят по порогу гейта
  // #577: упрёк по звонку сдвинул розыгрыш ещё три правила — держим прямыми случаями
  Says_condole_ctxrevived: { event: 'PlayerSays', facts: { intent: 'condole' }, setup: (g) => { g.S.ctx = { revived: true } } },
  Finale_rubik_default: { event: 'ArcFinale', facts: { arc: 'rubik' } },
  Finale_razmik_default: { event: 'ArcFinale', facts: { arc: 'razmik' } },
  Finale_beton_opened: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.mem['count.rude'] = 6; g.S.mem[HEAT] = 3 } },
  // #585: праздничная кнопка сдвинула выборки — тишина на наступившем сроке ушла из них
  Quiet_Dead_PromiseDue: { event: 'PromiseDue', setup: dead },
  // #577: после разрастания пулов звонка выборки перестали собирать и второе приглашение Арсена
  Court_Lawyer_Again: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem.court = 1; g.S.mem['intro.arsen'] = true } },
  // #683/#684: колкости и сплиты серий сдвинули розыгрыш выборок — правила держим прямыми случаями
  Says_congrats: { event: 'PlayerSays', facts: { intent: 'congrats' } },
  Says_wrong: { event: 'PlayerSays', facts: { intent: 'wrong' }, setup: (g) => { g.S.ctx = { wrong: true } } },
  Scene_lend: { event: 'PickScene', setup: (g) => { g.S.mood = 4 } }, // денег в свежей партии хватает (START_MONEY)
  Scene_loan: { event: 'PickScene', setup: (g) => { g.S.day = 230 } },
  // #762: барахолка получила вес 5 — на чужих семействах сидов (`rules:stable`) «смертный одр» и траурный
  // хор Карине падают до нуля; в выборках гейта они редкие (3 и 5 партий из 72), потому держим прямыми случаями
  Scene_deathbed: { event: 'PickScene', setup: (g) => { g.S.day = 250; g.S.mood = 3 } },
  Chorus_karine_Dead: { event: 'Mentioned', target: 'karine', setup: (g) => { g.S.mem.alik_dead = true; g.S.mem['intro.karine'] = true } },
  Quest_q_niva: { event: 'PickQuest', setup: (g) => { g.S.mem[legendId] = 'niva_stuck'; g.S.mem[legendDay] = g.S.day } },
  // слияние #683+#684 ещё раз сместило розыгрыш: голосовое уходит из выборок на сплит-партиях
  Says_voice: { event: 'PlayerSays', facts: { intent: 'voice' } },
  // #762: «это когда?» на короткую реплику (`ctx.type` short) в 4 партиях из 72, а на семействе +6000 —
  // ни разу; прямой случай держит `rules:stable` зелёным (в CI этого гейта нет с #73)
  Says_shortQ: { event: 'PlayerSays', facts: { intent: 'shortQ', arg: 'Завтра.' } },
  // апелляция на жаре: колкости растянули партии — угроза-повтор уходит из выборок (#683);
  // once встречного иска израсходован, иначе Hot (bonus 2) перебивает Hot_Again (bonus 1)
  Tone_Threat_Hot_Again: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.rules.once['Tone_Threat_Hot'] = true; g.S.mem[HEAT] = 2 } },
  // #681: новые сообщения в сериях сдвинули выборки ещё раз — амнистия при 5+ просроченных из них ушла
  Scene_amnesty: { event: 'PickScene', setup: (g) => { for (let i = 0; i < 5; i++) g.recordPromise({ text: `завтра, раз ${i}`, d: 1 }); g.S.day += 5 } },
  // #703: правка пулов звонка сдвинула розыгрыш выборок — кафе и счёт из них ушли
  Scene_meet: { event: 'PickScene', setup: (g) => { g.S.day = 215 } },
  Scene_invoice: { event: 'PickScene', setup: (g) => { g.S.day = 215 } },
  // #731: правка NAME_RE сдвинула розыгрыш выборок ещё раз — «заказчик жалуется» и «позвони заказчику» ушли из них
  Scene_redo: { event: 'PickScene' },
  Scene_customer: { event: 'PickScene', setup: (g) => { g.S.day = 210 } },
  // #753: «карта» держалась прямым случаем, пока лотерея 72 партий её не задевала (3–5 из 60);
  // #762 (барахолка веса 5) сдвинула розыгрыш — правило играется в 7 партиях из 72, гейт видит его сам.
  // после #679/#681 бот в выборках до обычного финала коллекторов не доходит: держим прямым случаем
  Finale_collectors_default: { event: 'ArcFinale', facts: { arc: 'collectors' } },
}
