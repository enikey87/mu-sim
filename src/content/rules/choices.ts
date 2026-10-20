// Событие BuildChoices — какие контекстные реплики предложить игроку.
// Берутся два самых приоритетных (специфичность + bonus); из одного слота — только одна.
import type { ContentApi } from '../../engine/game'
import type { Choice, Tone } from '../../engine/state'
import { type Rule, type Facts, type Criterion, type Entry, eq, ne, is, exists, missing, gt, gte, lte, isOpen, valueOf, sinceWithin } from '../fact'
import type { GameEvent, Offer } from './events'
import { D, cap, WHEN_YEARS } from '../excuses'
import { talkPairs, talkId } from '../talk'
import { ARCS, WRONG_Q } from '../arcs'
import * as L from '../life'
import { GROUP_Q } from '../misc'
import { P_LIE } from '../lies'
import { TOPICS } from '../topics'
import { P_CREW_PAID, CREW_FRESH_TURNS } from '../crew'
import { MONEY_ASK, moneyPlaceOf } from '../money-ask'
import { P_HOLIDAY, holidayBefore, type Holiday } from '../holidays'
import { WORLD, SPEAKS } from '../world'
import { fmtDayMonth, fmtDays } from '../../engine/time'
import { HEAT, alikDead, alikShaved, intro, moustacheAskAt, blocked, court, mourning, phoneKarine, crewPaid, endgame } from '../memkeys'
import { requirePlayerPool } from '../player-pools'
import {
  P_VIA_BORIS, P_VIA_KARINE, P_VIA_MAMA, P_MOO, P_MOUSTACHE, P_COURT, P_COLLECTORS_DEBUT,
  STRASBOURG_THREAT,
  P_RAM_PHOTO, P_BORIS_SALE, P_VACANCY, P_AVITO_REVIEW, P_RUBIK_ASK, P_KETTLE,
  P_CREW_CALL, P_LAWYER, P_COLLECTORS_ASK, P_INTERN, P_HOLE, P_COUNTERSUIT,
  P_DEBUT_ARSEN, P_DEBUT_SAMVEL, P_DEBUT_BORIS, P_DEBUT_NIVA, P_NUNE_DEBUT, P_GRANT_TILE, P_MOUSTACHE_PHOTO, P_MAMA_MARKET, P_MAMA_VOICE, P_SAMVEL_DIVORCE, P_COURT_VERDICT, P_TILE_SLIP, P_SOLD, P_GRANT_HOUSE,
} from './player-choice-pools'

type R = Rule<ContentApi, GameEvent, Offer>

interface OfferSpec {
  name: string
  when: Criterion[]
  act?: string
  tone: Tone
  text: (game: ContentApi, facts: Facts) => string
  arg?: (game: ContentApi, facts: Facts) => string | number | undefined
  /** Тема вопроса для дедупа блока (#887): два про одно и то же в одной сборке не стоят. */
  topic?: (game: ContentApi, facts: Facts) => string | undefined
  bonus?: number
  specificity?: number
  slot?: string
  weight?: number
  odds?: number
  /** Перерыв от показа: кнопку увидели — пауза пошла (штамп при сборке вариантов, game.ts). */
  cooldown?: { turns?: number; days?: number }
}

/** Тема вопроса: место денег и тема игрока называют ту же тему, что арка (#887) — иначе два вопроса об одном. */
const MONEY_TOPIC: Record<string, string> = { beton: 'arc:beton' }
const TOPIC_ARC: Record<string, string> = { beton: 'arc:beton', wedding: 'arc:samvel', ram: 'arc:boris', niva: 'arc:niva' }

const fromD = (game: ContentApi, key: string, map: Record<string, string> = {}) => {
  requirePlayerPool(`D.${key}`, D[key])
  return game.playerLine(() => game.X.fill(game.draw(key, D[key]), map))
}
const fromArr = (game: ContentApi, key: string, arr: readonly Entry<unknown>[]) => {
  requirePlayerPool(key, arr)
  return game.playerLine(() => game.draw(key, arr as readonly Entry<string>[]))
}
// пул — в реестре кнопок (#491), но строка — как есть, без украшения обращением: обращаемся к посреднику, а не к Алику (#512)
const plainFromArr = (game: ContentApi, key: string, arr: readonly Entry<unknown>[]) => {
  requirePlayerPool(key, arr)
  return game.draw(key, arr as readonly Entry<string>[])
}
const freshFromArr = (game: ContentApi, key: string, arr: readonly Entry<unknown>[]) => {
  requirePlayerPool(key.startsWith('F_') ? `ARCS.${key.slice(2)}.follow` : key, arr)
  return game.freshPlayer(key, arr as readonly Entry<string>[]) ?? ''
}
/** Линия игрока из плоского пула вместе с её номером: ответ окна подбирается по выбранной строке,
 *  а не колодой (#1017). Номер уезжает с arg, как у угрозы «до Страсбурга» (#982). */
const fromArrNum = (game: ContentApi, key: string, arr: readonly string[], set: (i: number) => void): string => {
  requirePlayerPool(key, arr)
  return game.playerLine(() => {
    const raw = game.draw(key, arr)
    set(arr.indexOf(raw))
    return raw
  })
}


const offer = (o: OfferSpec): R => ({
  name: `Opt_${o.name}`,
  event: 'BuildChoices',
  when: o.when,
  bonus: o.bonus,
  specificity: o.specificity,
  slot: o.slot ?? o.name,
  weight: o.weight,
  odds: o.odds,
  cooldown: o.cooldown,
  // пустой текст — нечего предложить (весь пул недавно показывали)
  offer: ({ game, facts }): Choice | null => {
    const text = o.text(game, facts)
    return text ? { text, tone: o.tone, act: o.act, arg: o.arg?.(game, facts), topic: o.topic?.(game, facts) } : null
  },
})

export const choiceRules: R[] = [
  // поймать на лжи — открытый эпизод журнала; в молчании Алика кнопка скрыта, эпизод остаётся
  offer({
    name: 'CatchLie',
    when: [is('lieOpen'), missing(blocked), missing(alikDead), missing(phoneKarine), eq('offline', false)],
    act: 'catchLie', tone: 'neutral', bonus: 6,
    text: (g) => { const l = g.lie()!; return g.playerLine(() => g.X.fill(g.draw('P_LIE', P_LIE), { old: l.old.say, new: l.new.say })) },
  }),
  // упрёк по звонку с объекта: пул живёт только под фактом звонка, в окнах молчания — молчит (#577)
  offer({
    name: 'CrewPaid',
    when: [is(crewPaid), missing(blocked), missing(alikDead)],
    act: 'crewPaid', tone: 'neutral', bonus: 4,
    cooldown: { turns: 10 }, // иначе кнопка занимает слот в 94% кадров выбора до конца партии (#592 → #789)
    text: (g) => fromArr(g, 'P_CREW_PAID', P_CREW_PAID),
  }),
  // праздник в календаре переписки: деньги под ним, один вариант на окно (#585); в окне молчания — молчит.
  // Слот только до дня: «на носу» 1 января — праздник уже прошёл (#828). Пул и окно Алика те же.
  offer({
    name: 'Holiday',
    when: [ne('holiday', false), missing(endgame.active), missing(alikDead), missing(blocked)],
    act: 'holiday', tone: 'neutral', bonus: 4,
    text: (g, facts) => {
      if (!holidayBefore(g.day)) return ''
      const pool = P_HOLIDAY[facts.holiday as Holiday]
      return pool ? fromArr(g, `P_HOLIDAY.${String(facts.holiday)}`, pool) : ''
    },
  }),
  // извиниться после грубости
  offer({ name: 'Sorry', when: [is('ctx.offended')], act: 'sorry', tone: 'polite', bonus: 5, text: (g) => fromD(g, 'P_SORRY') }),
  // лестница грубости: заблокирован — извиниться можно только через Бориса; ссора горячая — можно мычать
  // посредник — лучший из тех, кто есть: Борис, Карине, мама Алика (один вариант на слот); обращение к посреднику — без «Алик, …»
  offer({ name: 'Via_boris', slot: 'via', when: [is(blocked), SPEAKS.boris], act: 'via', arg: () => 'boris', tone: 'polite', bonus: 7, text: (g) => plainFromArr(g, 'P_VIA_BORIS', P_VIA_BORIS) }),
  offer({ name: 'Via_karine', slot: 'via', when: [is(blocked), WORLD.karineHome, WORLD.karine], act: 'via', arg: () => 'karine', tone: 'polite', bonus: 6, text: (g) => plainFromArr(g, 'P_VIA_KARINE', P_VIA_KARINE) }),
  offer({ name: 'Via_mama', slot: 'via', when: [is(blocked)], act: 'via', arg: () => 'mama', tone: 'polite', bonus: 6, text: (g) => plainFromArr(g, 'P_VIA_MAMA', P_VIA_MAMA) }),
  offer({ name: 'Moo', when: [is('ctx.offended'), gte(HEAT, 1)], odds: 0.5, act: 'moo', tone: 'neutral', bonus: 4, text: (g) => fromArr(g, 'P_MOO', P_MOO) }),

  // пока усы отрастают — подколоть Алика (#352); не чаще раза в 5 дней после вопроса,
  // и только пока нить жива: с 31-го дня после бритья кнопка уходит (#921)
  {
    name: 'Opt_Moustache', event: 'BuildChoices', when: [is(alikShaved), ...sinceWithin('shaved', 30)], bonus: 2,
    slot: 'moustache',
    offer: ({ game }) => {
      if (game.day - Number(game.mem()[moustacheAskAt] ?? -99) < 5) return null
      const text = freshFromArr(game, 'P_MOUSTACHE', P_MOUSTACHE)
      return text ? { text, tone: 'neutral' as const, act: 'moustacheAsk' } : null
    },
  },

  // заметные системные события (#927): 1–2 варианта-реакции, пока свежо событие — ход и три после
  offer({ name: 'RamPhoto', when: [is('ramPhotoFresh')], act: 'ramPhoto', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_RAM_PHOTO', P_RAM_PHOTO) }),
  offer({ name: 'BorisSale', when: [is('borisSaleFresh')], act: 'borisSale', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_BORIS_SALE', P_BORIS_SALE) }),
  offer({ name: 'Vacancy', when: [is('vacancyFresh')], act: 'vacancy', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_VACANCY', P_VACANCY) }),
  offer({ name: 'AvitoReview', when: [is('avitoReviewFresh')], act: 'avitoReview', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_AVITO_REVIEW', P_AVITO_REVIEW) }),
  offer({ name: 'RubikAsk', when: [is('rubikAskFresh')], act: 'rubikAsk', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_RUBIK_ASK', P_RUBIK_ASK) }),
  offer({ name: 'Kettle', when: [is('kettleFresh')], act: 'kettle', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_KETTLE', P_KETTLE) }),
  // прямые вопросы и первые сообщения персонажей (#958): отклик в окне события — ход и три после
  offer({ name: 'CrewCall', when: [lte('sinceCrew', CREW_FRESH_TURNS)], act: 'crewCall', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_CREW_CALL', P_CREW_CALL) }),
  offer({ name: 'LawyerFirst', when: [is('lawyerFresh')], act: 'lawyerAsk', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_LAWYER', P_LAWYER) }),
  offer({ name: 'CollectorsAsk', when: [is('collectorsAskFresh')], act: 'collectorsAsk', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_COLLECTORS_ASK', P_COLLECTORS_ASK) }),
  // ответ по выбранной строке, а не колодой (#1017): согласие/отказ стажёра и «ровно/криво/за плату»
  // получают свой ответ B-пула — номер выбранной строки уезжает с arg.
  // bonus 5: на ходу предложения слоты блока держат звонок с объекта (специфичность 7) и вопрос про
  // сериал (4, у финала — «вопрос ещё не задавали сегодня»): реакция окна обязана попасть в блок
  // своим ходом, а не следующим (#1083 — на seed 215117 кнопка ждала блока 14.04)
  ...(() => {
    let arg = ''
    return [offer({
      name: 'InternOffer', when: [is('internFresh')], act: 'internOffer', tone: 'neutral', bonus: 5,
      text: (g) => fromArrNum(g, 'P_INTERN', P_INTERN, (i) => { arg = String(i) }),
      arg: () => arg,
    })]
  })(),
  ...(() => {
    let arg = ''
    return [offer({
      name: 'RubikHole', when: [is('rubikHoleFresh')], act: 'rubikHole', tone: 'neutral', bonus: 3,
      text: (g) => fromArrNum(g, 'P_HOLE', P_HOLE, (i) => { arg = String(i) }),
      arg: () => arg,
    })]
  })(),
  // дебюты участников (#973): первое сообщение персонажа — ход и три после, пул — только у тех, у кого 2+ строки.
  // bonus 5: на rude-пути окно конкурирует с извинением (6) и мычанием (6) — дебют должен попадать в блок.
  // Пул Арсена под воротами (#982): пустой пул даёт пустой текст — freshFromArr, не draw
  offer({ name: 'DebutArsen', when: [is('debutFresh'), eq('debutWho', 'arsen')], act: 'debutArsen', tone: 'neutral', bonus: 5, text: (g) => freshFromArr(g, 'P_DEBUT_ARSEN', P_DEBUT_ARSEN) }),
  offer({ name: 'DebutSamvel', when: [is('debutFresh'), eq('debutWho', 'samvel')], act: 'debutSamvel', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_DEBUT_SAMVEL', P_DEBUT_SAMVEL) }),
  offer({ name: 'DebutBoris', when: [is('debutFresh'), eq('debutWho', 'boris')], act: 'debutBoris', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_DEBUT_BORIS', P_DEBUT_BORIS) }),
  offer({ name: 'DebutNiva', when: [is('debutFresh'), eq('debutWho', 'niva')], act: 'debutNiva', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_DEBUT_NIVA', P_DEBUT_NIVA) }),
  // пул Нуне тоже под воротами (#1170): финал бетона даёт первое письмо без сейфа — пустой пул не должен бросать draw
  offer({ name: 'DebutNune', when: [is('debutFresh'), eq('debutWho', 'nune')], act: 'debutNune', tone: 'neutral', bonus: 5, text: (g) => freshFromArr(g, 'P_NUNE_DEBUT', P_NUNE_DEBUT) }),
  // первое сообщение заказчика Гранта (#983): свой штамп, не общее окно дебюта — текст только про эту реплику
  offer({ name: 'GrantTile', when: [is('grantTileFresh')], act: 'grantTile', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_GRANT_TILE', P_GRANT_TILE) }),
  // смена фото без усов (#1013): заметное событие ставки — отклик в окне события (ход и три после).
  // bonus 5: рядом стоит обычная кнопка «как усы?» (специфичность 5) — событийная реакция должна попасть в блок
  offer({ name: 'MoustachePhoto', when: [is('moustachePhotoFresh')], act: 'moustachePhoto', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_MOUSTACHE_PHOTO', P_MOUSTACHE_PHOTO) }),
  // второй дебют Гранта (#1041): дом «с кладом» — заметное событие, отклик в окне события (ход и три после)
  offer({ name: 'GrantHouse', when: [is('grantHouseFresh')], act: 'grantHouse', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_GRANT_HOUSE', P_GRANT_HOUSE) }),
  // конец квеста «мама на рынке» (#1030): заметное событие — отклик в окне события (ход и три после).
  // bonus 5: рядом стоят извинение и мычание (6) — событийная реакция обязана попасть в блок
  offer({ name: 'MamaMarket', when: [is('mamaMarketFresh')], act: 'mamaMarket', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_MAMA_MARKET', P_MAMA_MARKET) }),
  // голосовое-плач мамы (#1085): событие серии звонков — отклик в окне события (ход и три после).
  // bonus 5: рядом стоят извинение и мычание (6) — событийная реакция обязана попасть в блок
  offer({ name: 'MamaVoice', when: [is('mamaVoiceFresh')], act: 'mamaVoice', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_MAMA_VOICE', P_MAMA_VOICE) }),
  // развод дяди Самвела на свадьбе (#1037): событие серии — отклик в окне события (ход и три после).
  // bonus 5: после серии рядом стоит вопрос арки (1) — реакция обязана попасть в блок
  offer({ name: 'SamvelDivorce', when: [is('samvelDivorceFresh')], act: 'samvelDivorce', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_SAMVEL_DIVORCE', P_SAMVEL_DIVORCE) }),
  // вердикт суда (#1058): кульминация линии — отклик в окне события (ход и три после).
  // bonus 5: после сцены блок собирают общие деньги — реакция обязана попасть в блок
  offer({ name: 'CourtVerdict', when: [is('courtVerdictFresh')], act: 'courtVerdict', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_COURT_VERDICT', P_COURT_VERDICT) }),
  // первая серия плиточной арки (#1059): падение заказчика — отклик в окне события (ход и три после)
  offer({ name: 'TileSlip', when: [is('tileSlipFresh')], act: 'tileSlip', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_TILE_SLIP', P_TILE_SLIP) }),
  // продажа имущества со дна (#1084): заметное системное событие — отклик в окне события (ход продажи и три после).
  // bonus 5: карточку продажи собирает дно денег — рядом стоят вопросы отчаяния (6–7); реакция обязана попасть в блок
  offer({ name: 'Sold', when: [is('saleFresh')], act: 'soldQ', tone: 'neutral', bonus: 5, text: (g) => fromArr(g, 'P_SOLD', P_SOLD) }),
  // встречный иск — заметное событие с окном отклика (#964): ход и три после
  offer({ name: 'Countersuit', when: [is('countersuitFresh')], act: 'countersuitAsk', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_COUNTERSUIT', P_COUNTERSUIT) }),

  // ответ на то, ЧТО прислал Алик
  // фото «платёжки» — заметное событие с окном отклика (#1017): кнопка из пула реакций живёт и когда ctx ушёл дальше
  offer({ name: 'Photo', when: [is('photoFresh')], act: 'photo', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_PHOTO') }),
  offer({ name: 'VoiceCow', slot: 'voice', weight: 0.4, when: [eq('ctx.type', 'voice')], act: 'voice', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_VOICE') }),
  offer({ name: 'VoiceText', slot: 'voice', weight: 0.6, when: [eq('ctx.type', 'voice')], act: 'voiceText', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_VOICE2') }),
  // перевод 50 ₽ — заметное событие с окном отклика (#1003): кнопка из пула реакций живёт и когда ctx ушёл дальше
  offer({ name: 'Transfer', when: [is('transferFresh')], act: 'transferQ', tone: 'neutral', bonus: 3, text: (g, f) => fromD(g, 'P_TRANSFER', { amount: String(f['transferAmount'] ?? 50) }) }),
  offer({ name: 'Ping', when: [eq('ctx.type', 'readonly')], act: 'ping', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_PING') }),
  // «Завтра» → «это когда?», а «Брат, в пути» → «А подробнее?»
  offer({
    name: 'ShortTime', slot: 'short', when: [eq('ctx.type', 'short'), is('ctx.shortTimey')], act: 'shortQ', tone: 'neutral', bonus: 3,
    text: (g, f) => fromD(g, 'P_SHORT', { s: String(f['ctx.s']).replace(/[.!…,].*$/, '') }), arg: (_g, f) => String(f['ctx.s']),
  }),
  offer({ name: 'ShortOther', slot: 'short', when: [eq('ctx.type', 'short'), eq('ctx.shortTimey', false)], act: 'short2', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_SHORT2') }),
  offer({ name: 'Idle', when: [eq('ctx.type', 'idle')], act: 'idleReply', tone: 'polite', bonus: 3, text: (g) => fromArr(g, 'IDLE_Q', L.IDLE_Q) }),
  offer({ name: 'Sticker', when: [eq('ctx.type', 'sticker')], act: 'stickerQ', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'STICKER_Q', L.STICKER_Q) }),
  offer({ name: 'Fwd', when: [eq('ctx.type', 'fwd')], act: 'fwdQ', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'FWD_Q', L.FWD_Q) }),
  offer({ name: 'ReactOnly', when: [eq('ctx.type', 'reactOnly')], act: 'reactQ', tone: 'neutral', bonus: 3, // «👍 — это да или нет?» — с той реакцией, что Алик поставил на самом деле
    text: (g) => { const m = [...g.msgsView()].reverse().find((x) => x.kind === 'text' && x.from === 'me'); const r = (m?.kind === 'text' && m.react) || '👍'; return fromArr(g, 'REACT_Q', L.REACT_Q).replace('👍', r) } }),
  offer({ name: 'Deleted', when: [is('ctx.deleted')], act: 'deletedQ', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'DEL_Q', L.DEL_Q) }),
  // процитировать можно только то, что в этом чате сказали
  offer({ name: 'Group', when: [is('ctx.group')], act: 'group', tone: 'neutral', bonus: 3, text: (g, f) => (f['ctx.quote'] && g.chance(0.4) ? `«${f['ctx.quote']}»?!` : fromArr(g, 'GQ', GROUP_Q)) }),
  offer({ name: 'Wrong', when: [is('ctx.wrong')], act: 'wrong', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'WQ', WRONG_Q) }),
  offer({ name: 'Legend', when: [is('ctx.legendary')], act: 'legendQ', tone: 'polite', bonus: 2, text: (g) => fromD(g, 'P_LEGEND') }),

  // срок обещания: только пока он ещё впереди относительно даты над перепиской (после +1…3 дня «завтра» уже вчера).
  // Кнопка — по горизонту и роду (docs/design/deadline-replies.md); специфичность прежняя, слот `when` вытесняет других как раньше
  ...(() => {
    const term = [exists('ctx.when'), is('ctx.whenFresh')]
    const args = (f: Facts) => ({ t: String(f['ctx.when']), T: cap(String(f['ctx.when'])), date: String(f['ctx.whenDate'] ?? ''), days: fmtDays(Number(f['ctx.whenDays'] ?? 0)), record: fmtDays(Number(f['promiseRecordDays'] ?? 0)) })
    const when = (o: Pick<OfferSpec, 'name' | 'when' | 'act' | 'tone' | 'weight' | 'arg' | 'text'>) => offer({ slot: 'when', specificity: 3, bonus: 1, ...o })
    const near = [...term, eq('ctx.whenHorizon', 'near')]
    const askPool = (f: Facts): string =>
      f['ctx.whenKind'] === 'holiday' ? 'P_WHEN_CALENDAR' : f['ctx.whenKind'] === 'event' ? 'P_WHEN_EVENT' : 'P_WHEN'
    return [
      when({ name: 'WhenOk', when: near, weight: 0.4, act: 'promiseOk', tone: 'polite', text: (g, f) => fromD(g, f['ctx.whenDate'] ? 'P_WHEN_OK' : 'P_WHEN_OK_EVENT', args(f)) }),
      when({ name: 'WhenCheck', when: near, weight: 0.6, act: 'promiseCheck', tone: 'neutral', text: (g, f) => fromD(g, askPool(f), args(f)), arg: (_g, f) => String(f['ctx.when']) }),
      when({ name: 'WhenPencil', when: [...term, eq('ctx.whenHorizon', 'far')], act: 'promisePencil', tone: 'neutral', text: (g, f) => fromD(g, 'P_WHEN_PENCIL', args(f)) }),
      when({ name: 'WhenFar', when: [...term, eq('ctx.whenHorizon', 'veryFar')], act: 'promiseFar', tone: 'neutral', text: (g, f) => fromD(g, 'P_WHEN_FAR', args(f)), arg: (_g, f) => String(f['ctx.when']) }),
      ...(['never', 'absurd'] as const).map((kind) => {
        let years = false
        return when({
          name: `When_${kind}`, when: [...term, eq('ctx.whenKind', kind)], act: 'promiseNever', tone: 'neutral',
          text: (g, f) => {
            const map = args(f)
            requirePlayerPool('D.P_WHEN_NEVER', D.P_WHEN_NEVER)
            const line = g.playerLine(() => g.X.fill(g.draw('P_WHEN_NEVER', D.P_WHEN_NEVER), map))
            // «Лет двадцать?» — единственная строка пула со своим ответом (#951). Флаг ставится по тому,
            // что игрок реально увидит, а не по промежуточным доборам колоды: `playerLine` бросает колоду
            // до восьми раз (окно повтора, добор незасвеченного), и старая отметка «добор был «Лет двадцать?»»
            // оставляла её ответ на совсем другой реплике — никогда-эхо получало ответ про двадцать лет (#1022).
            // Украшение реплики (обращение спереди, суффикс сзади) строку не отменяет — отсюда сверка по вхождению.
            years = line.toLowerCase().includes(WHEN_YEARS.toLowerCase())
            return line
          },
          arg: (_g, f) => (years ? 'years' : String(f['ctx.when'])),
        })
      }),
      // плавающий событийный срок (#1002): достижимое событие мира — свои варианты вместо never-эха
      when({
        name: 'When_Floating', when: [...term, eq('ctx.whenKind', 'floating')], act: 'promiseCheck', tone: 'neutral',
        text: (g, f) => fromD(g, 'P_WHEN_FLOATING', args(f)), arg: (_g, f) => String(f['ctx.when']),
      }),
    ]
  })(),

  // родственник: спросить «при чём тут он» / поздравить / посочувствовать — одна кнопка на слот
  offer({
    name: 'WhyRel', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel')], act: 'whyRel', tone: 'neutral',
    // родственник назван словами Алика («мой шофёр Гриша») — у игрока своя форма в словаре («ваш шофёр Гриша»)
    text: (g, f) => fromD(g, 'P_WHY_REL', { n: String(f['ctx.relYou']) }),
  }),
  offer({ name: 'Congrats', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel'), is('ctx.festive')], act: 'congrats', tone: 'polite', text: (g) => fromD(g, 'P_CONGRATS') }),
  offer({ name: 'Condole', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel'), is('ctx.sad')], act: 'condole', tone: 'polite', text: (g) => fromD(g, 'P_CONDOLE') }),
  offer({ name: 'Mourn', when: [is(mourning)], odds: 0.5, act: 'condole', tone: 'polite', bonus: 1, text: (g) => fromD(g, 'P_CONDOLE') }),

  offer({ name: 'Doubt', when: [is('ctx.constr')], act: 'defend', tone: 'neutral', bonus: 1, text: (g) => fromD(g, 'P_DOUBT') }),

  // кредитная лестница: кнопки собирает Game.buildChoices напрямую (не через top-2 collect)

  // напомнить о просроченном обещании из журнала
  offer({
    name: 'Prev', when: [gt('lateCount', 0)], act: 'prev', tone: 'neutral', bonus: 1, odds: 0.35,
    ...(() => {
      let idx = -1
      return {
        text: (g: ContentApi) => {
          const late = g.latePromises()
          const p = late[g.rnd(late.length)]
          idx = g.promiseIndexOf(p)
          return fromD(g, 'P_PREV', { t: p.t, date: fmtDayMonth(p.made) })
        },
        arg: () => idx,
      }
    })(),
  }),

  // сериалы: про текущий — всегда, про любой незаконченный — иногда
  // дебют коллекторов (#888): в окне их первой серии у игрока есть вопрос про них самих.
  // Окно закрывает сама серия: следующий эпизод двигает arc.collectors, и вопрос уходит вместе с окном
  offer({
    name: 'CollectorsDebut', slot: 'arc', when: [is(intro('collectors')), eq('arc.collectors', 1)], act: 'arc', tone: 'polite', bonus: 2,
    // окно повтора (#824): пока все формулировки пула в последних PLAYER_REPEAT_TURNS ходах, вопрос
    // молчит, а не повторяется дословно (#1078) — фолбэк на сырой draw обходил окно и возвращал
    // строку, показанную 2–3 хода назад. Цены у молчания нет: окно закрывает следующая серия,
    // вопрос вернётся свежей строкой.
    text: (g) => g.freshPlayer('F_collectors_debut', P_COLLECTORS_DEBUT) ?? '',
    arg: () => 'collectors',
  }),
  offer({
    // единственный выход из смерти: вопрос не исчезает, даже если все недавно показывали (исключение из окна #824)
    name: 'ArcDeath', slot: 'arc', when: [is(alikDead), is('deathCanAdvance')], act: 'arc', tone: 'polite', bonus: 5,
    text: (g) => g.freshPlayer('F_alik_death', ARCS.alik_death.follow) ?? g.oldestShown(ARCS.alik_death.follow), arg: () => 'alik_death',
  }),
  offer({
    // вопрос про сериал — только если он к чему-то приведёт (иначе «Как Нуне?» трижды подряд → «пока без новостей»)
    name: 'Arc', slot: 'arc', when: [missing(alikDead), exists('ctx.arc'), is('ctx.arcCanAdvance')], act: 'arc', tone: 'polite', bonus: 1,
    // свежая формулировка, а исчерпанный пул — повторяемая: иначе вопрос про сериал пропадает
    // после четырёх формулировок пула `follow`, и счётчики `asked.*` упираются в размер пула —
    // финалы вида «спрашивал 5 раз» (`asked.niva`, `asked.boris`) недостижимы (#753).
    // У `ArcDeath` эта связка была и раньше.
    // окно повтора (#824): пока все формулировки пула в последних PLAYER_REPEAT_TURNS ходах, вопрос молчит, а не повторяется дословно
    text: (g, f) => { const key = 'F_' + f['ctx.arc']; const arr = ARCS[String(f['ctx.arc'])].follow; return g.freshPlayer(key, arr) ?? '' }, arg: (_g, f) => String(f['ctx.arc']),
    topic: (_g, f) => `arc:${String(f['ctx.arc'])}`,
  }),
  // дело в суде открыто — игрок может его продолжить (угроза двигает линию суда);
  // выбранная строка «до самого Страсбурга» уходит с arg — судовая ветка ставит по ней факт оглашения (#982)
  ...(() => {
    let arg = ''
    return [offer({
      name: 'Court', when: [gte(court, 1), lte(court, 6)], odds: 0.35, tone: 'threat',
      text: (g) => {
        requirePlayerPool('P_COURT', P_COURT)
        let raw = ''
        const t = g.playerLine(() => (raw = g.draw('P_COURT', P_COURT)))
        arg = raw === STRASBOURG_THREAT ? 'strasbourg' : ''
        return t
      },
      arg: () => arg,
    })]
  })(),
  // «Это корова?» — только сразу после «Мууу», а не всю игру
  // ответить на то, что только что прозвучало: реплику легенды денег, вмешавшегося персонажа, воспоминание Алика,
  // реплику серии («колкость» #683 — окно держит проверка said в паре) или форму клятвы
  ...(['legend', 'chorus', 'memory', 'arc', 'word'] as const).map((kind) => {
    let arg = ''
    return offer({
      name: 'Talk_' + kind,
      when: [kind === 'memory' ? is('ctx.memory') : kind === 'word' ? exists('ctx.when') : exists(`ctx.${kind}`)],
      act: 'talk', tone: 'neutral', bonus: 2, odds: 0.8,
      text: (g, f) => {
        const sub = kind === 'memory' || kind === 'word' ? '' : String(f['ctx.' + kind])
        const said = g.msgsView().slice(-6).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : [])).join(' ')
        const facts = g.lineFacts()
        // окно дословного повтора (#857): показанный вопрос не возвращается дословно 20 ходов — пока окно
        // держит одну пару, берём следующую открытую; контекст живёт дольше окна, поэтому вопрос не пропадает
        const i = talkPairs(kind, sub).findIndex((e, j) => !g.lines.has(talkId(kind, sub, j)) && isOpen(e, facts)
          && (valueOf(e)[2]?.(g, said) ?? true) && !g.offeredInWindow(valueOf(e)[0]))
        if (i < 0) return ''
        arg = `${kind}|${sub}|${i}`
        const q = valueOf(talkPairs(kind, sub)[i])[0]
        g.rememberShown(q)
        return q
      },
      arg: () => arg,
    })
  }),
  offer({ name: 'Cow', when: [is('mooFresh')], odds: 0.8, bonus: 2, tone: 'cow', text: (g) => fromD(g, 'P_COW') }),
  // денежный вопрос — первичная контекстная кнопка (#795): пока открыта легенда денег, игрок спрашивает,
  // где они сейчас. Место — из легенды (банк/фундамент/сейф/крипта/«Нива»), формулировки по месту не
  // повторяются, слот свой: тема может стоять рядом, а не вместо. Ответ — следующая реплика той же легенды
  // (`Says_money` в replies.ts), то есть вопрос ведёт сюжет денег, а не только отвечает на сказанное.
  offer({
    name: 'Money', slot: 'money', when: [exists('legend')], act: 'money', tone: 'neutral', bonus: 3, odds: 0.9,
    text: (g, f) => { const place = moneyPlaceOf(f.legend); return place ? freshFromArr(g, 'MONEY_ASK_' + place, MONEY_ASK[place]) : '' },
    topic: (_g, f) => { const place = moneyPlaceOf(f.legend); return place ? MONEY_TOPIC[place] : undefined },
    arg: (_g, f) => String(f.legend),
  }),
  // ответ по теме: игрок цепляется за то, что Алик только что сказал (после серии сериала — вопрос про сериал важнее)
  offer({
    name: 'Topic', when: [exists('ctx.topic'), missing('ctx.arc')], act: 'topic', tone: 'neutral', odds: 0.85,
    ...(() => {
      let arg = ''
      return {
        // вопрос и ответ идут парой: p[i] ↔ a[i]
        text: (g: ContentApi, f: Facts) => {
          const t = TOPICS[String(f['ctx.topic'])]
          const fits = t.p.filter((_, i) => !t.need?.[i] || t.need[i].test(g.topicText))
          const q = g.freshPlayer('PT_' + f['ctx.topic'], fits)
          arg = q ? `${f['ctx.topic']}:${t.p.findIndex((e) => valueOf(e) === q)}` : ''
          return q ?? ''
        },
        arg: () => arg,
        topic: (_g: ContentApi, f: Facts) => TOPIC_ARC[String(f['ctx.topic'])],
      }
    })(),
  }),
]
