// Прямые случаи гейта покрытия (#278): правило, до которого бот в выборках не доходит или доходит не всегда,
// запускается здесь напрямую — direct.test.ts краснеет, если его сломать. Запись освобождается по единому
// условию (#1100): правило сыграно ≥ DIRECT_MIN_GAMES партий в CI-выборках И ≥1 в каждой стабильной семье —
// вердикт «снять из DIRECT» выносит gateIssues в прогоне rules:stable, где сходятся обе части. Убрал случай —
// правило снова под гейтом (ноль в CI-выборках или в семье), и недостижимое краснеет.
import type { Game } from '../engine/game'
import type { Facts } from '../engine/rules'
import { during } from '../engine/rules'
import { START_DAY, ARC_MARINATION_DAYS } from '../engine/state'
import { HEAT, legendDay, legendId, nuneKeyPassed, payday, sorryAt } from '../content/memkeys'
import { ENDING_MIN_DAY } from '../content/finales'

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
/** Три сюжетных сериала закончены — ворота третьего акта (тот же setup, что `rich` в payday.test.ts). */
const thirdAct = (g: Game) => {
  g.S.day = 340
  Object.assign(g.S.arcs, { nune: { i: 6, last: 0 }, niva: { i: 7, last: 0 }, boris: { i: 10, last: 0 } })
}

export const DIRECT: Record<string, DirectCase> = {
  Tone_Cow: { event: 'PlayerMessage', facts: { tone: 'cow' } },
  // #826: окно повтора шире (#824 был 10 ходов, стал 20) сдвинуло розыгрыш — тон в блоке ушёл из выборок
  // #926: гейты follow Бориса сдвинули розыгрыш обратно — тон в блоке снова в выборках (7 партий,
  // порог 7) — прямой случай снят
  Says_catchLie_lieKind_grandpa: { event: 'PlayerSays', facts: { intent: 'catchLie' }, setup: (g) => { g.noteClaims(['grandpa_dead']); g.noteClaims(['grandpa_alive']) } },
  // #1306: окно возврата «Нивы» сдвинуло розыгрыш — вопрос о баране по памяти партии (Turn_Memory) в CI-выборках
  // больше не звучит, и отклик на него ни разу не сыграл; правило цело, держим прямым случаем (как #826/#926)
  Says_borisMemory: { event: 'PlayerSays', facts: { intent: 'borisMemory' } },
  // #426: sys-claim Гранта («всё заплатил») противоречит «заказчик мне не платит» — бот ловит это сам, 34 партии
  Turn_BorisSick: { event: 'AlikTurn', setup: (g) => { g.S.arcs.boris = { i: 2, last: 0 }; g.S.actors.boris = { sick: true } } },
  Opt_Cow: { event: 'BuildChoices', setup: (g) => { g.S.mem.mooAt = g.S.stats.sent } },
  // гейт на чужих семействах: в семье +4000 бот не доходит до предложения «через Бориса» (4/0/4) — прямой случай держит гейт
  Opt_Via_boris: { event: 'BuildChoices', setup: (g) => { blocked(g); g.S.arcs.boris = { i: 4, last: 0 } } },
  Away_Offline: { event: 'AlikAway', setup: (g) => { g.S.offlineDays = 2 } },
  Turn_WhileDead: { event: 'AlikTurn', setup: (g) => { g.S.mem.alik_dead = true } },
  // гарантия первой серии (#636): к 12-му сообщению шанс Turn_ArcFirst мог промахнуться всю посадку
  Turn_ArcGuarantee: { event: 'AlikTurn', setup: (g) => { g.S.stats.sent = 12; g.S.day = START_DAY + ARC_MARINATION_DAYS } },
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
  // #927 (реакции на системные события; слияние с новой main сдвинуло розыгрыш): в семье +2000 правило упало до нуля
  // #1085 (окно отклика на голосовое-плач мамы) сдвинуло выборки — бот сам доходит до «ведомости» (7 партий при пороге 7)
  // #1100: снятие подтверждено единым условием — семьи +2000/+4000/+6000 = 1/2/2, нулей нет, страховка не нужна
  // #1114 (колкости свадьбы Самвела в follow) снова унесло «ведомость» бетона из выборок до экрана концовки
  Finale_beton_ledger: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.mem.caught = 2 } },
  // два пойманных вранья: после #682 (тексты серий сдвинули поток розыгрышей) бот в выборках до него не доходит,
  // но в полной выборке финал звучал — случай прямой, не объяснение недостижимости
  Finale_grant_ally: { event: 'ArcFinale', facts: { arc: 'grant' }, setup: (g) => { g.S.ach.customer = 1 } },
  Finale_razmik_shift_or: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.ach.newjob = 1 } },
  Finale_garik_cutter: { event: 'ArcFinale', facts: { arc: 'garik' }, setup: (g) => { g.S.ach.newjob = 1 } },
  // #983: окно первого «Би-бип» сдвинуло розыгрыш — обычный финал Гарика ни разу до экрана концовки
  // #1071 (окно дебюта Нуне) сдвинуло выборки — финал снова в них (7 партий при пороге 7)
  // Finale_garik_default: { event: 'ArcFinale', facts: { arc: 'garik' } }
  Finale_alik_death_will: { event: 'ArcFinale', facts: { arc: 'alik_death' }, setup: (g) => { g.S.ach.forgive = 1; g.S.mem['asked.alik_death'] = 1 } },
  // #1058 (окно вердикта суда) сдвинуло выборки — обычный финал «смерти» ни разу до экрана концовки.
  // asked.alik_death = 1: без вопросов о смерти матчится частный финал «Обиделся» (asked ≤ 0)
  // #1068 (гейт «всем» в упрёке по звонку) сдвинул выборки обратно — финал снова виден (10 партий при пороге 7)
  // Finale_alik_death_default: { event: 'ArcFinale', facts: { arc: 'alik_death' }, setup: (g) => { g.S.mem['asked.alik_death'] = 1 } }
  Finale_rubik_bribe: { event: 'ArcFinale', facts: { arc: 'rubik' }, setup: (g) => { g.S.ach.redo = 1 } },
  Finale_samvel_tamada: { event: 'ArcFinale', facts: { arc: 'samvel' }, setup: (g) => { g.S.ach.toast = 1 } },
  Ending_alik: { event: 'CheckEnding', setup: (g) => { g.S.day = ENDING_MIN_DAY; g.S.mem['finale.garik'] = 'cutter' } },
  Ending_heir: { event: 'CheckEnding', setup: (g) => { g.S.day = ENDING_MIN_DAY; g.S.mem['finale.alik_death'] = 'will' } },
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
  Ending_ram: {
    event: 'CheckEnding',
    setup: (g) => { g.S.day = ENDING_MIN_DAY; g.S.mem['finale.boris'] = 'toyou' },
  },
  Finale_boris_toyou: { event: 'ArcFinale', facts: { arc: 'boris' }, setup: (g) => { g.S.items.push('баран Борис') } },
  Finale_niva_chose: { event: 'ArcFinale', facts: { arc: 'niva' }, setup: (g) => { g.S.items.push('«Нива» 1987 года') } },
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
  // #789: перерыв кнопки упрёка сдвинул выборки бота ещё раз — «Вендетта» и её компания снова
  // редки (0 партий в семействе +2000), и гейт просит прямой случай обратно. #762 снял их по той
  // же причине, что и добавлял: гейт покрытия видит правило не в каждой среде.
  Rude_Vendetta: {
    event: 'PlayerMessage', facts: { tone: 'rude' },
    // 15-й крик: порог в правиле читает счётчик до remember текущего крика (#742)
    setup: (g) => { g.S.mem['count.rude'] = 14; g.S.mem['count.sorry'] = 0 },
  },
  Says_sorry_blocked: {
    event: 'PlayerSays', facts: { intent: 'sorry' },
    setup: (g) => { blocked(g); g.S.mem['finale.rubik'] = 'karine' },
  },
  Finale_samvel_groom: { event: 'ArcFinale', facts: { arc: 'samvel' }, setup: (g) => { g.S.ach.saint = 1; g.S.mem['count.rude'] = 3 } },
  Finale_boris_brigadir: { event: 'ArcFinale', facts: { arc: 'boris' }, setup: (g) => { g.S.mem['asked.boris'] = 6 } },
  Finale_alik_death_sulk: { event: 'ArcFinale', facts: { arc: 'alik_death' }, setup: () => {} },
  Ending_family: { event: 'CheckEnding', setup: (g) => { g.S.day = ENDING_MIN_DAY; g.S.mem['finale.samvel'] = 'groom' } },
  Ending_vendetta: { event: 'CheckEnding', setup: (g) => { g.S.day = ENDING_MIN_DAY; g.S.mem.vendetta = true } },
  Ending_honest: {
    event: 'CheckEnding',
    setup: (g) => { g.S.day = ENDING_MIN_DAY; g.S.mem['finale.grant'] = 'ally' },
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
  Quiet_PaydayOpen_StoryBeat: { event: 'StoryBeat', setup: (g) => { paydayOpen(g); g.S.stats.sent = 5; g.S.day = 340 } },
  // #927 (реакции на системные события сдвинули розыгрыш) — правило ушло из выборок, прямой случай вернулся.
  // До этого случай снимали (#889: в CI правило играло в 8 партиях, порог 7) — качели гейта решает замер.
  // #953 (окна вопроса Рубика и чайника) снова сдвинула розыгрыш — в 7 партиях (порог 7), гейт видит сам.
  // #833: хвост окна свежести сдвинул розыгрыш — Quiet_PaydayOpen_PromiseDue в 7 партиях (порог 7), гейт видел сам;
  // #882 (фраза-срок про свадьбу) сдвинул розыгрыш обратно — правило ушло из выборок, случай вернулся
  // #889: перекалибровка вариантов бетона сдвинула розыгрыш снова — в CI правило в 8 партиях (порог 7),
  // случай снят; на чужих семействах (+2000/+4000/+6000) правило играет, нулей второй гейт не видит
  // #964 (встречный иск) вместе с #962 сдвинули розыгрыш — в семье +2000 правило упало до нуля, случай вернулся
  Quiet_PaydayOpen_PromiseDue: {
    event: 'PromiseDue', facts: { promise: 0 },
    setup: (g) => { paydayOpen(g); g.recordPromise({ text: 'завтра', d: 1 }); g.S.day += 1 },
  },
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
  // гейт на чужих семействах (#434): в семье +2000 сцена заказчика не выпадала ни разу — прямой случай держит
  // #919: сдвиг розыгрыша этой сессии вернул сцену заказчика в выборки (7 партий, порог 7) — снят
  // по инструкции гейта; на чужих семействах замерять при следующем касании пула (#833-цикл)
  // гейт на чужих семействах (#434): в семье +6000 счёт-подтверждение не выпадал — прямой случай держит
  // #926/#919: сдвиги розыгрыша этой сессии вернули счёт в выборки (7 партий, порог 7) — случай снят
  // (#833 уже снимал его по той же причине; тогда #703 вернул)
  // #918 (эхо «Лет двадцать?» ждёт сравнения с коньяком) сдвинула розыгрыш — Scene_invoice в 7 партиях
  // (порог 7), гейт видит сам, запись снята
  // #962 (окна объявлений места денег) сдвинула розыгрыш ещё раз — счёт ушёл из выборок, случай вернулся
  Scene_invoice: { event: 'PickScene', setup: (g) => { g.S.day = 216 } },
  // в семье +4000 не выпадал племянник (Арсен ещё не представлен) — прямой случай держал
  // #952 (окно свежести денежного вопроса) сдвинуло розыгрыш — Scene_nephew в 8 партиях (порог 7),
  // гейт видит сам, запись снята
  // #953: окна вопроса Рубика и чайника сдвинули розыгрыш — Scene_nephew в 7 партиях (порог 7), гейт видит сам
  // #953 вместе с #952: сцена «кафе» ни разу не дошла до экрана концовки — соседи на перерыве, остаётся она
  // #1001 (место Бориса в формулировках) сдвинуло розыгрыш — «кафе» играло в 9 партиях (порог 7), запись снята
  // #1000 (строки рецензии №3) пришёл к тому же выводу независимо: «кафе» в 7 партиях при пороге 7 — прямой случай снят
  // гейт на чужих семействах (#434): в семье +2000 «через маму» не выпадало; если выборки снова увидят
  // его часто (порог 7), гейт скажет «снять» — тогда запись уйдёт, как Says_voice в #887
  Says_via_mama: { event: 'PlayerSays', facts: { intent: 'via', arg: 'mama' } },
  // #958: прямые вопросы и первые сообщения сдвинули розыгрыш — голосовое и «выбери отмазку сам» ушли из выборок
  // #964: гейты разошлись — в выборках CI правило не сработало ни разу (запись нужна), а на чужих
  // семействах играет во всех (8/7/8 при пороге 7, запись «устарела»); одна строка не может быть и там
  // и там — держим запись (арбитр — CI), конфликт гейтов заведён в #949
  // #1004 (маринование первой арки) сдвинуло выборки — голосовое снова в них (8 партий при пороге 7), гейт видит сам
  // #1100: второй тупик #968 закрыт тем же условием — CI 7, семьи +2000/+4000/+6000 = 7/4/9 (замер 2026-10-19):
  // достижимость доказана везде, запись снята законно и без страховки
  // Says_voice: { event: 'PlayerSays', facts: { intent: 'voice' } },
  // #1002 (плавающий событийный срок) и #1001 (место Бориса в формулировках) сдвинули розыгрыш — Scene_choice
  // снова в выборках (7 партий при пороге 7), гейт видит сам; прямым случаем держалась как редкая
  Chorus_garik_FedUp: { event: 'Mentioned', target: 'garik', setup: (g) => { g.S.mem['intro.garik'] = true; g.S.actors.garik = { interjections: 3 } } },
  // #824: окно повтора сдвинуло розыгрыш — траурный хор Карине ушёл из семейства +2000, держали прямым случаем
  // #920: варианты предложения и козы сдвинули розыгрыш — Chorus_karine_Dead в 8 партиях (порог 7), гейт видит сам
  // #1001: снова ушёл из выборок — держим прямым случаем; пул — траурная строка легенды «dead»
  Chorus_karine_Dead: { event: 'Mentioned', target: 'karine', setup: (g) => { g.S.mem.alik_dead = true; g.S.mem['intro.karine'] = true; g.S.mem[legendId] = 'dead' } },
  Finale_razmik_shift: { event: 'ArcFinale', facts: { arc: 'razmik' }, setup: (g) => { g.S.ach.fence = 1 } },
  Finale_tile_lost: { event: 'ArcFinale', facts: { arc: 'tile' }, setup: (g) => { g.S.mem.court = 6 } },
  // #824: окно повтора сдвинуло розыгрыш — обычный финал плитки ушёл из выборок, держим прямым случаем
  // #889: перекалибровка вариантов бетона сдвинула розыгрыш — финал плитки снова в выборках
  // (7 партий при пороге 7) — прямой случай не нужен, гейт видит его без подсказки
  Says_sorry_blocked_boris: { event: 'PlayerSays', facts: { intent: 'sorry' }, setup: (g) => { blocked(g); g.S.arcs.boris = { i: 4, last: 0 } } },
  // #824: окно повтора реплик игрока сдвинуло розыгрыш — голосовое теперь срабатывает во всех семействах само
  // (было прямым случаем с #806, когда уходило из семейства +4000)
  // #576: звонок с объекта сдвинул розыгрыш выборок — сцена «если спросят» из них ушла; гейт по воротке угрозы
  Scene_tax: { event: 'PickScene', setup: (g) => { g.S.mem['count.threat'] = 1 } },
  // #679: разворот коллекторов сдвинул розыгрыш выборок — сцена амнистии ушла из них
  // с колкостями (#683) распухший журнал собирается ботами сам — случай снят по порогу гейта
  // #577: упрёк по звонку сдвинул розыгрыш ещё три правила — держим прямыми случаями
  // #824: после слияния с #828 розыгрыш сдвинулся — голосовое снова уходит из семейства +4000, держим прямым случаем
  // #889: та же перекалибровка вернула голосовое в выборки (7 партий при пороге 7) — прямой случай снят
  // (снята и стороной #890); на чужих семействах (+2000/+4000/+6000) правило играет (2–4 партии), нулей второй гейт не видит
  // #824: там же ушёл из семейства +6000 финал бетона «Настоящая ведомость» (порог поимок 2)
  // #889: перекалибровка вариантов бетона сдвинула розыгрыш — финал срабатывает в выборках сам
  // (8 партий при пороге 7) — прямой случай не нужен, гейт видит его без подсказки
  // #926: гейты follow Бориса сдвинули розыгрыш — Tone_WhileBlocked в выборках сам (7 партий,
  // порог 7) — прямой случай не нужен
  // #964 (встречный иск) сдвинул розыгрыш — в семье +6000 правило упало до нуля, случай вернулся
  Tone_WhileBlocked: { event: 'PlayerMessage', setup: (g) => { blocked(g) } },
  // #826: расширение тоновых пулов сдвинуло розыгрыш — отклик на «воскрес» ушёл из семейства +6000
  Says_condole_ctxrevived: { event: 'PlayerSays', facts: { intent: 'condole' }, setup: (g) => { g.S.ctx = { revived: true } } },
  // #1100: страховка первого тупика #949 (CI 8 против +4000: 0) — по единому условию освобождения запись
  // легитимна, пока не взяты оба порога; замер 2026-10-19: CI 1, семьи +2000/+4000/+6000 = 4/3/4 — держим
  Finale_rubik_default: { event: 'ArcFinale', facts: { arc: 'rubik' } },
  Finale_razmik_default: { event: 'ArcFinale', facts: { arc: 'razmik' } },
  // #918 (гейт эха «Лет двадцать?» сдвинул розыгрыш): в семье +6000 правило упало до нуля — прямой случай держал
  // #953 вместе с #952: обычный финал плитки снова в выборках (7 партий, порог 7) — гейт видит сам
  Finale_beton_opened: { event: 'ArcFinale', facts: { arc: 'beton' }, setup: (g) => { g.S.mem['count.rude'] = 6; g.S.mem[HEAT] = 3 } },
  // #585: праздничная кнопка сдвинула выборки — тишина на наступившем сроке ушла из них
  // #890: риторика срока по роду сдвинула розыгрыш — Quiet_Dead_PromiseDue в 7 партиях (порог 7), гейт видит сам
  // #927 (реакции на системные события сдвинули розыгрыш): в семье +4000 правило упало до нуля — случай вернулся
  Quiet_Dead_PromiseDue: {
    event: 'PromiseDue', facts: { promise: 0 },
    setup: (g) => { dead(g); g.recordPromise({ text: 'завтра', d: 1 }); g.S.day += 1 },
  },
  // #577: после разрастания пулов звонка выборки перестали собирать и второе приглашение Арсена
  Court_Lawyer_Again: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.mem.court = 1; g.S.mem['intro.arsen'] = true; g.S.mem['wrote.arsen'] = true } },
  // #981 (окна follow-пула бетона и штампы легенды места) сдвинул розыгрыш — ответ окну дебюта Арсена (#973)
  // ушёл из выборок и держался прямым случаем; #1004 (маринование первой арки) сдвинуло выборки обратно —
  // 11 партий при пороге 7, гейт видит сам
  // Says_lawyerAsk: { event: 'PlayerSays', facts: { intent: 'lawyerAsk' } },
  // #982 (пул дебюта Арсена ждёт события трека) — ответ окну дебюта в выборках больше не собирается
  Says_debutArsen: { event: 'PlayerSays', facts: { intent: 'debutArsen' } },
  // #1179: дебют Гранта — хор легенды с шансом 0.3; окно живёт, только если первая фраза была про конверт
  Opt_DebutGrant: {
    event: 'BuildChoices',
    setup: (g) => {
      g.S.mem['intro.grant'] = true
      g.S.mem['said.grant.envelope'] = true
      g.S.mem['debut.who'] = 'grant'
      g.S.mem['debut.at'] = g.S.stats.sent
    },
  },
  Says_debutGrant: {
    event: 'PlayerSays', facts: { intent: 'debutGrant' },
    setup: (g) => { g.S.mem['intro.grant'] = true; g.S.mem['said.grant.envelope'] = true },
  },
  Scene_lend: { event: 'PickScene', setup: (g) => { g.S.mood = 4 } }, // денег в свежей партии хватает (START_MONEY)
  // #1003 (окно перевода) сдвинуло выборки — сцена заказчика ушла из них, держим прямым случаем
  Scene_customer: { event: 'PickScene', setup: (g) => { g.S.day = 220 } },
  // Scene_newjob: с #826 срабатывает в выборках сам (8 партий при пороге 7) — прямой случай не нужен
  Scene_loan: { event: 'PickScene', setup: (g) => { g.S.day = 230 } },
  // #762: барахолка получила вес 5 — на чужих семействах сидов (`rules:stable`) «смертный одр» и траурный
  // хор Карине падают до нуля; в выборках гейта они редкие (3 и 5 партий из 72), потому держим прямыми случаями
  // Scene_deathbed: с #824/#828 срабатывает в выборках сам (7 партий при пороге 7) — прямой случай не нужен
  // #1001 (место Бориса в формулировках) снова ушло из выборок — «смертный одр» держим прямым случаем
  // #1068 (гейт «всем» в упрёке по звонку) сдвинул выборки обратно — сцена снова видна (8 партий при пороге 7)
  // #1112 (формулировка «Нивы» в follow до первого «Би-бип») снова сдвинул розыгрыш — сцена из выборок ушла
  Scene_deathbed: { event: 'PickScene', setup: (g) => { g.S.day = 245; g.S.mood = 5 } },
  // #795: кнопки игрока (денежный вопрос вместо случайной кнопки про арку) сдвинули розыгрыш —
  // обычная сцена «жена» стала редкой в выборках, случай держали прямым (свой setup подавлял соседние сцены)
  // #889: перекалибровка вариантов бетона сдвинула розыгрыш — сцена снова в выборках CI
  // (7 партий при пороге 7) — прямой случай не нужен, гейт видит её без подсказки
  // #964 (встречный иск) сдвинул розыгрыш — в семье +6000 сцена упала до нуля, случай вернулся
  // #1017 (окно фото «платёжки» и ответы по выбранной строке) сдвинуло выборки — сцена «жена» снова в них
  // (7 партий при пороге 7), гейт видит сам; уйдёт из выборок — вернуть прямым случаем ниже
  // #1268 (деньги на карте через окно повтора вместо суточного пула) сдвинул розыгрыш — сцена из выборок ушла
  Scene_wife: { event: 'PickScene', setup: (g) => { g.S.mem['count.rude'] = 1 } }, // ворота: грубил, Карине не знакомы
  Quest_q_niva: { event: 'PickQuest', setup: (g) => { g.S.mem[legendId] = 'niva_stuck'; g.S.mem[legendDay] = g.S.day } },
  // #795: денежная кнопка вместо случайной кнопки про арку сдвинула розыгрыш выборок — эти правила
  // ушли из чужих семейств сидов (`rules:stable`); в выборках гейта они редкие, потому держим прямыми случаями
  Ending_payday_niva: { event: 'CheckEnding', setup: (g) => { g.S.mem.payday = 'niva' } },
  Payday_niva: { event: 'PaydayOutcome', setup: (g) => { g.S.mem['finale.niva'] = 'chose' } },
  // #1112 (формулировка «Нивы» в follow до первого «Би-бип») сдвинула розыгрыш — в семье +4000
  // подводка и анонс выплаты упали до нуля; держим оба прямыми случаями
  Beat_PaydayLead_First: { event: 'StoryBeat', setup: thirdAct },
  Beat_Payday: { event: 'StoryBeat', setup: (g) => { thirdAct(g); g.S.mem[payday.lead] = 1; g.S.mem[payday.signs] = 2 } },
  // Scene_choice: с #821 срабатывает в выборках сам (7 партий при пороге 7) — прямой случай не нужен
  // #1001 (место Бориса в формулировках) сдвинуло розыгрыш — сцена снова в выборках сам (см. комментарий выше)
  Finale_niva_chose_or: { event: 'ArcFinale', facts: { arc: 'niva' }, setup: (g) => { g.S.mem['asked.niva'] = 5 } },
  // апелляция на жаре: колкости растянули партии — угроза-повтор уходит из выборок (#683);
  // once встречного иска израсходован, иначе Hot (bonus 2) перебивает Hot_Again (bonus 1)
  Tone_Threat_Hot_Again: { event: 'PlayerMessage', facts: { tone: 'threat' }, setup: (g) => { g.S.rules.once['Tone_Threat_Hot'] = true; g.S.mem[HEAT] = 2 } },
  // #681: новые сообщения в сериях сдвинули выборки ещё раз — амнистия при 5+ просроченных из них ушла
  // #795: розыгрыш сдвинулся — амнистия теперь играется во всех чужих семействах (`rules:stable`),
  // гейт видит её сам; запись снята
  // #703: правка пулов звонка сдвинула розыгрыш выборок — кафе и счёт из них ушли
  // #833: хвост окна свежести сдвинул розыгрыш — Scene_invoice в 8 партиях (порог 7), гейт видит сам
  // #731: правка NAME_RE сдвинула розыгрыш выборок ещё раз — «заказчик жалуется» и «позвони заказчику» ушли из них
  // #753: «карта» держалась прямым случаем, пока лотерея 72 партий её не задевала (3–5 из 60);
  // #762 (барахолка веса 5) сдвинула розыгрыш — правило играется в 7 партиях из 72, гейт видит его сам.
  // после #679/#681 бот в выборках до обычного финала коллекторов не доходит: держим прямым случаем
  Finale_collectors_default: { event: 'ArcFinale', facts: { arc: 'collectors' } },
  // #1084 (окно продажи имущества) сдвинуло выборки — вердикт суда и обычный финал плитки («Квиты»)
  // ни разу не дошли до экрана концовки в основной игре: держим прямыми случаями.
  // Finale_tile_default уже снимали в 6342002, когда финал вернулся в выборки; теперь гейт снова
  // просит случай («ни разу до экрана концовки») — возврат осознанный, замер в описании PR #1093
  Says_courtVerdict: { event: 'PlayerSays', facts: { intent: 'courtVerdict' } },
  Finale_tile_default: { event: 'ArcFinale', facts: { arc: 'tile' } },
  // #1119 (дедлайн-предохранитель): подводка дедлайна (428) опережает поздний путь у ботов — их sent
  // дорастает до 150 позже ~450-го дня. Болтливый игрок доходит до sent 150 к 420-му и раньше дедлайна —
  // путь жив для людей, боты не воспроизводят, держим прямым случаем.
  Beat_PaydayLead_Late: { event: 'StoryBeat', setup: (g) => { g.S.day = 425; g.S.stats.sent = 155 } },
}
