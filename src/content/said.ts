// Окна пар «вопрос ↔ ответ» по тому, что Алик только что сказал (#738): условие пары рождает только хелпер.
// Отдельный модуль, а не talk.ts: talk.ts и legends.ts импортируют друг друга (LEGENDS ↔ пары), и функция
// из talk.ts в момент инициализации legends.ts ещё не существует — цикл падал на saidMatch.
import type { ContentApi } from '../engine/game'
import { type Said } from './fact'

type TalkFn = (game: ContentApi, said: string) => boolean
/** Условие пары (#738): `saidHas`/`saidMatch` — окно по сказанному (у него есть триггер), `stateGate` — гейт
 *  состояния партии. Рукописный предикат в слот не пройдёт по типу: маркер `cond`. */
export type TalkCond =
  | (TalkFn & { readonly cond: 'state' })
  | (TalkFn & { readonly cond: 'said'; readonly trigger: string })
/** Вопрос, ответ и (необязательно) когда вопрос уместен: по состоянию игры и по тому, что Алик только что сказал. */
export type TalkPair = readonly [string, Said, TalkCond?]

/** Триггеры окон по литералу: текст реплики-источника живёт в серии или форме клятвы, и правка там
 *  умертвила бы колкость молча — поэтому тест (`jabs.test.ts`) сверяет каждый триггер с источником.
 *  Отдаётся функцией, а не массивом-экспортом: строки-ключи — не контент, обход `mentions.test.ts`
 *  их видеть не должен. */
const TRIGGERS: string[] = []
export const saidTriggers = (): readonly string[] => TRIGGERS
export const saidHas = (t: string): TalkCond => {
  TRIGGERS.push(t)
  return Object.assign((_g: ContentApi, said: string): boolean => said.includes(t), { cond: 'said' as const, trigger: t })
}
/** Окно по регулярке (легенды: «тот свет», ванная Рубика): тот же слот с маркером; в реестр литеральных
 *  триггеров не идёт — источник у него регулярка, а не строка. */
export const saidMatch = (re: RegExp): TalkCond =>
  Object.assign((_g: ContentApi, said: string): boolean => re.test(said), { cond: 'said' as const, trigger: re.source })
/** Гейт состояния пары (факты партии): тот же слот, но окно по сказанному он не открывает. */
export const stateGate = (p: (game: ContentApi) => boolean): TalkCond =>
  Object.assign(p as TalkFn, { cond: 'state' as const })
/** Триггер окна с условия пары — для проверки источника. */
export const saidTrigger = (p: TalkCond | undefined): string | undefined => (p?.cond === 'said' ? p.trigger : undefined)
