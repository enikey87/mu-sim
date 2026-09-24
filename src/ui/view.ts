import type { Game } from '../engine/game'
import type { Msg } from '../engine/state'
import { ACH } from '../content/achievements'
import { ARCS } from '../content/arcs'
import { ENDINGS } from '../content/finales'
import { payday } from '../content/memkeys'

/** Граница между движком и интерфейсом: единственный модуль UI, который знает устройство S и ключей памяти.
 *  Компоненты получают плоский снимок и не импортируют ни контент, ни memkeys. */

export type PaydayView = { daysLeft: number | null; sum: number | null }
export type PromiseRow = { text: string; due: number | null; late: boolean }
export type ArcRow = { id: string; title: string; state: string; done: boolean; locked: boolean }
export type EndingRow = { id: string; title: string; icon: string; got: boolean }
export type AchRow = { id: string; title: string; desc: string; got: boolean }
export type FinaleRow = { id: string; title: string; finale: string }

export type View = {
  day: number
  debt: number
  ram: boolean
  muted: boolean
  sceneId: string | null
  payday: PaydayView
  endingId: string | null
  endingCount: number
  endingTotal: number
  ending: { id: string; title: string; text: string; icon: string } | null
  /** Великая отмазка Дня выплаты: только для концовок payday_* со строкой-цепочкой в памяти. */
  grandExcuse: string | null
  finales: FinaleRow[]
  promises: PromiseRow[]
  arcs: ArcRow[]
  endings: EndingRow[]
  items: string[]
  ach: AchRow[]
  achGot: number
  achTotal: number
}

export const viewOf = (g: Game): View => {
  const S = g.S
  const ending = S.ending ? ENDINGS.find((x) => x.id === S.ending) : undefined
  const chain = S.mem[payday.chain]
  return {
    day: S.day,
    debt: S.debt,
    ram: S.ram,
    muted: S.muted,
    sceneId: S.scene?.id ?? null,
    payday:
      S.scene?.id === 'payday'
        ? {
            daysLeft: Number(S.mem[payday.at]) > S.day ? 1 : null,
            sum: S.mem[payday.sum] !== undefined ? Number(S.mem[payday.sum]) : null,
          }
        : { daysLeft: null, sum: null },
    endingId: S.ending,
    endingCount: Object.keys(S.endings).length,
    endingTotal: ENDINGS.length,
    ending: ending ? { id: ending.id, title: ending.title, text: ending.text, icon: ending.icon } : null,
    grandExcuse: ending?.id.startsWith('payday_') && typeof chain === 'string' ? chain : null,
    finales: Object.keys(ARCS)
      .filter((id) => g.finaleTitle(id))
      .map((id) => ({ id, title: ARCS[id].title, finale: g.finaleTitle(id)! })),
    promises: S.promises.map((p) => ({ text: p.t, due: p.due, late: p.due != null && p.due < S.day })),
    arcs: Object.entries(ARCS).map(([id, a]) => {
      const i = S.arcs[id]?.i ?? 0
      const finale = g.finaleTitle(id)
      return { id, title: a.title, state: finale ? `финал «${finale}»` : `серия ${i}/${a.eps.length}`, done: i >= a.eps.length, locked: i === 0 }
    }),
    endings: ENDINGS.map((e) => ({ id: e.id, title: e.title, icon: e.icon, got: !!S.endings[e.id] })),
    items: S.items,
    ach: Object.entries(ACH).map(([k, [title, desc]]) => ({ id: k, title, desc, got: !!S.ach[k] })),
    achGot: Object.keys(S.ach).length,
    achTotal: Object.keys(ACH).length,
  }
}

/** Лента — единственное, что не в снимке: инкрементальный канал MessageList читает сам массив
 *  (тот же объект, что и раньше; windowing и dirtyFrom считаются по нему в Chat). */
export const feedMsgs = (g: Game): Msg[] => g.S.msgs
