import type { Game } from '../engine/game'
import { isLate, type Msg, type PromiseRec } from '../engine/state'
import type { UiState } from '../engine/ui-state'
import { ACH } from '../content/achievements'
import { ARCS } from '../content/arcs'
import { ENDINGS } from '../content/finales'
import { SPEND } from '../content/life'
import { alikShaved, payday } from '../content/memkeys'
import { fmtDate } from '../engine/time'
import { START_MONEY } from '../engine/state'
import { spec } from '../engine/rules'

/** Граница между движком и интерфейсом: единственный модуль UI, который знает устройство S и ключей памяти.
 *  Компоненты получают фасад GameUi и плоский снимок; контент и memkeys не импортируют (страж — view.test.ts). */

type UiView = Readonly<Pick<UiState, 'status' | 'typing' | 'toast' | 'notif' | 'moos' | 'busy' | 'feel' | 'feelId' | 'title'>> & { sheetOpen: boolean }
type BatteryView = Readonly<Pick<Game['battery'], 'level' | 'dead' | 'charging'>> & Pick<Game['battery'], 'charge'>

/** Игра глазами компонента: действия, подписка, эфемерное состояние экрана. S нет ни в типе, ни в объекте —
 *  обход через каст получает undefined, а не память. */
export type GameUi = Readonly<
  Pick<Game, 'subscribe' | 'getVersion' | 'getMsgsEpoch' | 'getMsgsDirtyFrom' | 'ackMsgsDirty' | 'choices' | 'clockText' | 'gameDate'
    | 'send' | 'answerJob' | 'answerCard' | 'canMirror' | 'playVoice' | 'castOf' | 'flash' | 'closeEnding' | 'dismissNotif' | 'toggleMute' | 'gesture' | 'onVisibility' | 'reset' | 'introDone'>
  & { ui: UiView; battery: BatteryView; mooSound: () => void; vibrate: (p: number | number[]) => void }
>

const REAL = new WeakMap<GameUi, Game>()
const FACADE = new WeakMap<Game, GameUi>()

export function uiOf(g: Game): GameUi {
  let u = FACADE.get(g)
  if (u) return u
  const ui: UiView = {
    get status() { return g.ui.status }, get typing() { return g.ui.typing }, get toast() { return g.ui.toast },
    get notif() { return g.ui.notif }, get moos() { return g.ui.moos }, get busy() { return g.ui.busy },
    get feel() { return g.ui.feel }, get feelId() { return g.ui.feelId }, get title() { return g.ui.title },
    get sheetOpen() { return g.ui.sheetOpen }, set sheetOpen(v) { g.ui.sheetOpen = v },
  }
  const battery: BatteryView = {
    get level() { return g.battery.level }, get dead() { return g.battery.dead }, get charging() { return g.battery.charging },
    charge: () => g.battery.charge(),
  }
  u = {
    ui, battery,
    subscribe: g.subscribe, getVersion: g.getVersion, getMsgsEpoch: g.getMsgsEpoch, getMsgsDirtyFrom: g.getMsgsDirtyFrom, ackMsgsDirty: g.ackMsgsDirty,
    get choices() { return g.choices }, get clockText() { return g.clockText }, get gameDate() { return g.gameDate },
    send: (o) => g.send(o), answerJob: (id, answer) => g.answerJob(id, answer), answerCard: (id, pick) => g.answerCard(id, pick), canMirror: () => g.canMirror(), playVoice: (m) => g.playVoice(m), castOf: (who) => g.castOf(who),
    flash: (t, ms) => g.flash(t, ms), closeEnding: () => g.closeEnding(), dismissNotif: () => g.dismissNotif(),
    toggleMute: () => g.toggleMute(), gesture: () => g.gesture(), onVisibility: (h) => g.onVisibility(h), reset: () => g.reset(),
    introDone: () => g.introDone(),
    mooSound: () => { g.audio.moo() },
    vibrate: (p) => { g.audio.vibrate(p) },
  }
  FACADE.set(g, u)
  REAL.set(u, g)
  return u
}

const realOf = (u: GameUi): Game => {
  const g = REAL.get(u)
  if (!g) throw new Error('view: не фасад uiOf()')
  return g
}

export type PaydayView = { daysLeft: number | null; sum: number | null }
/** Состояние записи журнала: что о сроке честно сказать в досье. */
export type PromiseState = 'amnesty' | 'kept' | 'asked' | 'late' | 'event' | 'eventMet' | 'someday' | 'wait'
export type PromiseRow = { text: string; due: number | null; amnesty: number | null; state: PromiseState }

/** Срок по событию (`condition`) не дата: до события ждём события, после — оно наступило (не «просрочено»:
 *  в игре событийный срок не просрочен, docs/design/promise-amnesty.md). */
const promiseState = (p: PromiseRec, day: number): PromiseState =>
  p.amnesty !== undefined ? 'amnesty' : p.kept ? 'kept' : p.asked ? 'asked' : isLate(p, day) ? 'late'
    : p.condition ? (p.met === undefined ? 'event' : 'eventMet') : p.due === null ? 'someday' : 'wait'
export type ArcRow = { id: string; title: string; state: string; done: boolean; locked: boolean }
export type EndingRow = { id: string; title: string; icon: string; got: boolean }
export type AchRow = { id: string; title: string; desc: string; got: boolean }
export type FinaleRow = { id: string; title: string; finale: string }

export type View = {
  day: number
  debt: number
  ram: boolean
  /** Усы сбриты по ставке — аватар без усов, пока факт живёт (~40 дней). */
  shaved: boolean
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

export const viewOf = (u: GameUi): View => {
  const g = realOf(u)
  const S = g.S
  const ending = S.ending ? ENDINGS.find((x) => x.id === S.ending) : undefined
  const chain = S.mem[payday.chain]
  return {
    day: S.day,
    debt: S.debt,
    ram: S.ram,
    shaved: !!S.mem[alikShaved],
    muted: S.muted,
    sceneId: S.scene?.id ?? null,
    payday:
      S.scene?.id === 'payday'
        ? {
            daysLeft: Number(S.mem[payday.at]) > S.day ? Number(S.mem[payday.at]) - S.day : null,
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
    promises: S.promises.map((p) => ({ text: p.t, due: p.due, amnesty: p.amnesty ?? null, state: promiseState(p, S.day) })),
    arcs: Object.entries(ARCS).map(([id, a]) => {
      const i = S.arcs[id]?.i ?? 0
      const finale = g.finaleTitle(id)
      return { id, title: a.title, state: finale ? `финал «${finale}»` : `серия ${i}/${a.eps.length}`, done: i >= a.eps.length, locked: i === 0 }
    }),
    endings: ENDINGS.map((e) => ({ id: e.id, title: e.title, icon: e.icon, got: !!S.endings[e.id] })),
    items: S.items,
    ach: Object.entries(ACH).map(([k, [title, desc]]) => ({ id: k, title, desc: typeof desc === 'function' ? desc(S) : desc, got: !!S.ach[k] })),
    achGot: Object.keys(S.ach).length,
    achTotal: Object.keys(ACH).length,
  }
}

/** Лента — единственное, что не в снимке: инкрементальный канал MessageList читает сам массив
 *  (тот же объект, что и раньше; windowing и dirtyFrom считаются по нему в Chat). */
export const feedMsgs = (u: GameUi): Msg[] => realOf(u).S.msgs

export type IntroNote = { icon: string; app: string; text: string; me?: true }
export type IntroView = {
  /** Первое сообщение Алика в чате — обещание завязки; интро показывает именно его. */
  intro: string
  /** Ответ игрока в прологе чата. */
  reply: string
  /** Системная строка завязки («…прошло 184 дня…»). */
  gap: string
  /** Дней после сдачи — счётчик интро бежит до этого числа. */
  day: number
  /** Дата календаря для листания — той же функцией, что разделители чата. */
  dateAt: (day: number) => string
  /** Промежуточные: обещания Алика, стикер, списания банка — без незнакомых имён (#249). */
  notes: IntroNote[]
}

/** Уведомления середины интро: обещания, стикер, банк из пулов партии (docs/design/intro.md).
 *  Сторож «интро не знакомит с чужими» живёт в ui.test.tsx и идёт по настоящему выводу (аудит #335):
 *  прежний фильтр ниже отсеивал ничего — в SPEND имён нет. */
export function introMidNotes(money = START_MONEY, seed = 1): IntroNote[] {
  const why = SPEND.map((e) => spec(e).t)
  const i = Math.abs(seed) % Math.max(1, why.length)
  const a = why[i] ?? 'Продукты'
  const b = why[(i + 1) % why.length] ?? 'Кофе с горя'
  const rub = (n: number) => n.toLocaleString('ru-RU')
  const bal1 = money - 340
  const bal2 = bal1 - 128
  const vows = [
    'Завтра всё будет, брат',
    'В понедельник, какой — не скажу',
    'Деньги в пути. Путь длинный',
  ]
  const v0 = vows[seed % vows.length]!
  const v1 = vows[(seed + 1) % vows.length]!
  return [
    { icon: '💬', app: 'Алик', text: v0 },
    { icon: '💬', app: 'Алик', text: '🏗️' },
    { icon: '🏦', app: 'Банк', text: `Списание 340 ₽. ${a}. Баланс: ${rub(bal1)} ₽` },
    { icon: '💬', app: 'Алик', text: v1 },
    { icon: '💬', app: 'Алик', text: vows[(seed + 2) % vows.length]! },
    { icon: '🏦', app: 'Банк', text: `Списание 128 ₽. ${b}. Баланс: ${rub(bal2)} ₽` },
  ]
}

/** Интро новой партии: null, если уже показано. Пролог читается из ленты — интро совпадает с чатом по построению. */
export const introOf = (u: GameUi): IntroView | null => {
  const S = realOf(u).S
  if (S.introShown) return null
  const alik = S.msgs.find((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text' && m.from === 'alik')
  const me = S.msgs.find((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text' && m.from === 'me')
  const sys = S.msgs.find((m): m is Extract<Msg, { kind: 'sys' }> => m.kind === 'sys')
  if (!alik || !me || !sys) return null
  const seed = [...alik.text].reduce((n, c) => n + c.charCodeAt(0), 0)
  return { intro: alik.text, reply: me.text, gap: sys.text, day: S.day, dateAt: fmtDate, notes: introMidNotes(S.money, seed) }
}
