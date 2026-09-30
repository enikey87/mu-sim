// Единый реестр пулов кнопок игрока (#491): сторож прошлого и buildChoices смотрят сюда, не в ручной список теста.
import type { Entry } from '../engine/rules'
import type { Choice } from '../engine/state'
import { D } from './excuses'
import { TOPICS, P_NIGHT, P_FRIDAY, P_NEU_B_LATE, P_RUDE_BLOCKED, P_RUDE_POLITE, P_POL_POLITE, P_MONEY, P_DESPERATE } from './topics'
import { P_LIE } from './lies'
import { ARCS, WRONG_Q } from './arcs'
import { CHORUS_TALK, MEMORY_TALK } from './talk'
import { LEGENDS } from './legends'
import { GROUP_Q, JOB_YES_P, JOB_NO_P } from './misc'
import { IDLE_Q, STICKER_Q, FWD_Q, REACT_Q, DEL_Q } from './life'
import { ENDGAME_CHOICES, LEND50_CHOICES } from './endgame'
import {
  P_VIA_BORIS, P_VIA_KARINE, P_VIA_MAMA, P_MOO, P_MOUSTACHE, P_COURT,
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

put('P_VIA_BORIS', P_VIA_BORIS)
put('P_VIA_KARINE', P_VIA_KARINE)
put('P_VIA_MAMA', P_VIA_MAMA)
put('P_MOO', P_MOO)
put('P_MOUSTACHE', P_MOUSTACHE)
put('P_COURT', P_COURT)

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
