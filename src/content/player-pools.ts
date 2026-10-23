// Единый реестр пулов кнопок игрока (#491): сторож прошлого и buildChoices смотрят сюда, не в ручной список теста.
import type { Entry } from '../engine/rules'
import type { Choice } from '../engine/state'
import { D } from './excuses'
import { TOPICS, P_NIGHT, P_FRIDAY, P_NEU_B_LATE, P_RUDE_BLOCKED, P_RUDE_POLITE, P_POL_POLITE, P_MONEY, P_DESPERATE } from './topics'
import { P_LIE } from './lies'
import { ARCS, WRONG_Q } from './arcs'
import { spec } from './fact'
import { collectorsRecruited, collectorsTea, collectorsTurned } from './memkeys'
import { CHORUS_TALK, MEMORY_TALK } from './talk'
import { LEGENDS } from './legends'
import { GROUP_Q, JOB_YES_P, JOB_NO_P } from './misc'
import { IDLE_Q, STICKER_Q, FWD_Q, REACT_Q, DEL_Q } from './life'
import { P_CREW_PAID } from './crew'
import { P_HOLIDAY, type Holiday } from './holidays'
import { ENDGAME_CHOICES, LEND50_CHOICES } from './endgame'
import { MONEY_ASK } from './money-ask'
import {
  P_VIA_BORIS, P_VIA_KARINE, P_VIA_MAMA, P_MOO, P_MOUSTACHE, P_COURT, P_COLLECTORS_DEBUT,
  P_RAM_PHOTO, P_BORIS_SALE, P_VACANCY, P_AVITO_REVIEW, P_RUBIK_ASK, P_KETTLE,
  P_CREW_CALL, P_LAWYER, P_COLLECTORS_ASK, P_INTERN, P_HOLE, P_COUNTERSUIT,
  P_DEBUT_ARSEN, P_DEBUT_SAMVEL, P_DEBUT_BORIS, P_DEBUT_NIVA, P_NUNE_DEBUT, P_DEBUT_GRANT, P_GRANT_TILE, P_MOUSTACHE_PHOTO, P_MAMA_MARKET, P_TILE_AD, P_TAMADA_DONE, P_MAMA_VOICE, P_SAMVEL_DIVORCE, P_GRANT_HOUSE, P_COURT_VERDICT, P_TILE_SLIP, P_TILE_LAWYER, P_NIVA_BACK, P_SOLD, P_BORIS_MEMORY, P_SERYOGA, P_GRANT_BATH, P_OFFENDED_ASK,
} from './rules/player-choice-pools'

/** Строковый пул кнопки (Entry допускает gate и объекты с .t). */
export type PlayerLinePool = readonly Entry<unknown>[]

const pools = new Map<string, PlayerLinePool>()

/** Зарегистрировать пул; вернуть тот же массив (удобно при объявлении константы). */
export const registerPlayerPool = <T extends PlayerLinePool>(key: string, lines: T): T => {
  pools.set(key, lines)
  return lines
}

export const playerPool = (key: string): PlayerLinePool | undefined => pools.get(key)

export const allPlayerPools = (): ReadonlyMap<string, PlayerLinePool> => pools

/** Пул, из которого рисует buildChoices/choices, обязан быть в реестре (#491). */
export const requirePlayerPool = (key: string, arr: readonly unknown[]): void => {
  const reg = pools.get(key)
  if (reg === arr) return
  for (const v of pools.values()) if (v === arr) return
  throw new Error(`unregistered player pool «${key}»`)
}

const put = (key: string, lines: PlayerLinePool) => { pools.set(key, lines) }

// все D-ключи с префиксом P_ — кнопки из словаря отмазок
for (const k of Object.keys(D)) if (k.startsWith('P_')) put(`D.${k}`, D[k] as PlayerLinePool)

put('P_NIGHT', P_NIGHT)
put('P_FRIDAY', P_FRIDAY)
put('P_NEU_B_LATE', P_NEU_B_LATE)
put('P_RUDE_BLOCKED', P_RUDE_BLOCKED)
put('P_RUDE_POLITE', P_RUDE_POLITE)
put('P_POL_POLITE', P_POL_POLITE)
put('P_MONEY.low.polite', P_MONEY.low.polite)
put('P_MONEY.low.neutral', P_MONEY.low.neutral)
put('P_MONEY.bottom.polite', P_MONEY.bottom.polite)
put('P_MONEY.bottom.neutral', P_MONEY.bottom.neutral)
put('P_DESPERATE.low', P_DESPERATE.low)
put('P_DESPERATE.bottom', P_DESPERATE.bottom)
put('P_LIE', P_LIE)

for (const [k, t] of Object.entries(TOPICS)) {
  put(`TOPICS.${k}.p`, t.p as PlayerLinePool)
  if (t.r) put(`TOPICS.${k}.r`, t.r as PlayerLinePool)
}

for (const [k, a] of Object.entries(ARCS)) put(`ARCS.${k}.follow`, a.follow as PlayerLinePool)

// денежный вопрос (#795): ключ на место — тот же, что рисует оффер Money
for (const [p, lines] of Object.entries(MONEY_ASK)) put(`MONEY_ASK_${p}`, lines)

put('GROUP_Q', GROUP_Q)
put('JOB_YES_P', JOB_YES_P)
put('JOB_NO_P', JOB_NO_P)
put('IDLE_Q', IDLE_Q)
put('STICKER_Q', STICKER_Q)
put('FWD_Q', FWD_Q)
put('REACT_Q', REACT_Q)
put('DEL_Q', DEL_Q)
put('WRONG_Q', WRONG_Q)
put('WQ', WRONG_Q) // ключ колоды в Opt_Wrong

put('P_CREW_PAID', P_CREW_PAID) // упрёк по звонку с объекта (#577)
for (const h of Object.keys(P_HOLIDAY) as Holiday[]) put(`P_HOLIDAY.${h}`, P_HOLIDAY[h]) // кнопка праздника (#585)
put('P_VIA_BORIS', P_VIA_BORIS)
put('P_VIA_KARINE', P_VIA_KARINE)
put('P_VIA_MAMA', P_VIA_MAMA)
put('P_MOO', P_MOO)
put('P_MOUSTACHE', P_MOUSTACHE)
put('P_MOUSTACHE_PHOTO', P_MOUSTACHE_PHOTO) // реакция на смену фото без усов (#1013)
put('P_MAMA_MARKET', P_MAMA_MARKET) // конец квеста «мама на рынке» (#1030)
put('P_TILE_AD', P_TILE_AD) // кража плиточной рекламы в финале q_photo (#1216)
put('P_TAMADA_DONE', P_TAMADA_DONE) // финал квеста-тамады: застолье и сервиз тёти Гоар (#1222)
put('P_MAMA_VOICE', P_MAMA_VOICE) // голосовое-плач мамы в серии звонков (#1085)
put('P_BORIS_MEMORY', P_BORIS_MEMORY) // вопрос «Всё ещё у тебя?» о баране по памяти партии (#1252)
put('P_SAMVEL_DIVORCE', P_SAMVEL_DIVORCE) // развод дяди Самвела на свадьбе (#1037)
put('P_GRANT_HOUSE', P_GRANT_HOUSE) // второй дебют Гранта, дом «с кладом» (#1041)
put('P_COURT_VERDICT', P_COURT_VERDICT) // отклик на вердикт суда (#1058)
put('P_TILE_SLIP', P_TILE_SLIP) // отклик на первую серию плиточной арки (#1059)
put('P_TILE_LAWYER', P_TILE_LAWYER) // отклик на эпизод «я твой адвокат» плиточной арки (#1303)
put('P_NIVA_BACK', P_NIVA_BACK) // отклик на возврат «Нивы» (#1306)
put('P_SOLD', P_SOLD) // отклик на продажу имущества со дна (#1084)
put('P_RAM_PHOTO', P_RAM_PHOTO)
put('P_BORIS_SALE', P_BORIS_SALE)
put('P_VACANCY', P_VACANCY)
put('P_SERYOGA', P_SERYOGA) // карточка друга Серёги «Ну что, заплатил твой Алик?» (#1292)
put('P_GRANT_BATH', P_GRANT_BATH) // строка Гранта «Ой. Не тот чат.» (#1292)
put('P_OFFENDED_ASK', P_OFFENDED_ASK) // вопрос Алика «ты обиделся?» после тишины (#1292)
put('P_AVITO_REVIEW', P_AVITO_REVIEW)
put('P_RUBIK_ASK', P_RUBIK_ASK)
put('P_KETTLE', P_KETTLE)
put('P_CREW_CALL', P_CREW_CALL)
put('P_LAWYER', P_LAWYER)
put('P_COLLECTORS_ASK', P_COLLECTORS_ASK)
put('P_INTERN', P_INTERN)
put('P_HOLE', P_HOLE)
put('P_DEBUT_ARSEN', P_DEBUT_ARSEN)
put('P_DEBUT_SAMVEL', P_DEBUT_SAMVEL)
put('P_DEBUT_BORIS', P_DEBUT_BORIS)
put('P_DEBUT_NIVA', P_DEBUT_NIVA)
put('P_NUNE_DEBUT', P_NUNE_DEBUT) // отклик на первое письмо Нуне (#1071)
put('P_DEBUT_GRANT', P_DEBUT_GRANT) // дебют Гранта хором легенды (#1179)
put('P_GRANT_TILE', P_GRANT_TILE)
put('P_COUNTERSUIT', P_COUNTERSUIT)
put('P_COURT', P_COURT)
// дебют коллекторов (#888) — нашёлся вне реестра линтером окна первого сообщения (#994)
put('P_COLLECTORS_DEBUT', P_COLLECTORS_DEBUT)
// окно эпизода (#1192): только строки follow, гейтнутые на факт этой серии, не весь пул
const EP_FACT = new Set<string>([collectorsTea, collectorsRecruited, collectorsTurned])
const P_COLLECTORS_EP = ARCS.collectors.follow.filter((e) => {
  const w = spec(e).when ?? []
  return w.some((c) => c.op === '==' && c.value === true && EP_FACT.has(String(c.key)))
})
put('P_COLLECTORS_EP', P_COLLECTORS_EP)
export const collectorsEpPool = (): PlayerLinePool => P_COLLECTORS_EP

// сцена choice: кнопки — вся колода CONSTR/ABSURD
put('scene choice.ask CONSTR', D.CONSTR as PlayerLinePool)
put('scene choice.ask ABSURD', D.ABSURD as PlayerLinePool)

/** Choice[] пулы эндгейма — отдельный вид, в корпус как .text. */
export const PLAYER_CHOICE_POOLS: Record<string, readonly Choice[]> = {
  ENDGAME_CHOICES,
  LEND50_CHOICES,
}

/** Пары [игрок, …]: в корпус — первая половина. */
export const PLAYER_PAIR_POOLS: Record<string, readonly Entry<unknown>[]> = {
  MEMORY_TALK: MEMORY_TALK as readonly Entry<unknown>[],
  ...Object.fromEntries(Object.entries(CHORUS_TALK).map(([k, v]) => [`CHORUS_TALK.${k}`, v as readonly Entry<unknown>[]])),
  ...Object.fromEntries(Object.entries(LEGENDS).map(([k, v]) => [`LEGENDS.${k}.talk`, v.talk as readonly Entry<unknown>[]])),
}
