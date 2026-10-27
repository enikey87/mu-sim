import type { Game } from '../engine/game'
import { DEBT0, isLate, type GameState, type Msg, type PromiseRec } from '../engine/state'
import type { UiState } from '../engine/ui-state'
import { ACH } from '../content/achievements'
import { ARCS } from '../content/arcs'
import { ENDINGS, type EndingId } from '../content/finales'
import { STARTS } from '../content/quests'
import { alikShaved, caughtCount, payday } from '../content/memkeys'
import { fmtDate } from '../engine/time'
import { reviewStamp, reviewTranscript, type ReviewSession } from './review'

/** Граница между движком и интерфейсом: единственный модуль UI, который знает устройство S и ключей памяти.
 *  Компоненты получают фасад GameUi и плоский снимок; контент и memkeys не импортируют (страж — view.test.ts). */

type UiView = Readonly<Pick<UiState, 'status' | 'typing' | 'toast' | 'notif' | 'moos' | 'busy' | 'masked' | 'feel' | 'feelId' | 'title'>> & { sheetOpen: boolean }
type BatteryView = Readonly<Pick<Game['battery'], 'level' | 'dead' | 'charging'>> & Pick<Game['battery'], 'charge'>

/** Игра глазами компонента: действия, подписка, эфемерное состояние экрана. S нет ни в типе, ни в объекте —
 *  обход через каст получает undefined, а не память. */
export type GameUi = Readonly<
  Pick<Game, 'subscribe' | 'getVersion' | 'getMsgsEpoch' | 'getMsgsDirtyFrom' | 'ackMsgsDirty' | 'choices' | 'clockText' | 'gameDate'
    | 'send' | 'answerJob' | 'answerCard' | 'canMirror' | 'playVoice' | 'castOf' | 'flash' | 'closeEnding' | 'dismissNotif' | 'toggleMute' | 'gesture' | 'onVisibility' | 'reset' | 'introDone' | 'lend50Sponsor' | 'endingsSeen'>
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
    get masked() { return g.ui.masked },
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
    send: (o) => sendWithReview(g, o), answerJob: (id, answer) => g.answerJob(id, answer), answerCard: (id, pick) => g.answerCard(id, pick), canMirror: () => g.canMirror(), playVoice: (m) => g.playVoice(m), castOf: (who) => g.castOf(who),
    flash: (t, ms) => g.flash(t, ms), closeEnding: () => g.closeEnding(), dismissNotif: () => g.dismissNotif(),
    toggleMute: () => g.toggleMute(), gesture: () => g.gesture(), onVisibility: (h) => g.onVisibility(h), reset: () => g.reset(),
    introDone: () => g.introDone(), lend50Sponsor: () => g.lend50Sponsor(), endingsSeen: () => g.endingsSeen(),
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
/** Строка «Акта сверки» — сухая фиксация числа; текст фиксированный (не пул), голос системных сообщений. */
export type ActRow = { text: string }

/** «Акт сверки» — сводка партии числами из уже существующих фактов и ленты (#689).
 *  Смешное — в числе и контрасте, не в вариативности: строки фиксированные, без колоды. */
const actRows = (S: GameState): ActRow[] => {
  const rub = (n: number): string => `${n.toLocaleString('ru-RU')} ₽`
  const transfers = S.msgs.filter((m): m is Extract<Msg, { kind: 'transfer' }> => m.kind === 'transfer' && m.from === 'alik')
  const paid = transfers.reduce((a, m) => a + (m.amount ?? 0), 0)
  const legends = S.msgs.filter((m) => m.kind === 'text' && m.legend).length
  const late = S.promises.filter((p) => isLate(p, S.day)).length
  const kept = S.promises.filter((p) => p.kept).length
  const someday = S.promises.filter((p) => p.due === null && !p.condition).length
  const diff = DEBT0 - S.debt
  return [
    { text: `За работу: ${rub(DEBT0)}. Должен сейчас: ${rub(S.debt)}.` },
    { text: diff > 0 ? `Возвращено и зачтено: ${rub(diff)}.` : diff < 0 ? `Начислено сверх работы: ${rub(-diff)}. Основание: объяснено Аликом.` : 'Возвращено: 0 ₽. Расхождений нет.' },
    { text: `Обещаний: ${S.promises.length} (просрочено — ${late}, сдержано — ${kept}, «когда-нибудь» — ${someday}).` },
    { text: `Ложи поймано: ${Number(S.mem[caughtCount] ?? 0)}. Переводов получено: ${transfers.length} на ${rub(paid)}.` },
    { text: `Дней со сдачи: ${S.day}. Легендарных отмазок: ${legends}. «Муу» за кадром: ${S.stats.moo}.` },
    { text: 'Расхождение объяснено Аликом.' },
  ]
}

export type View = {
  day: number
  debt: number
  ram: boolean
  /** Усы сбриты по ставке — аватар без усов, пока факт живёт (~40 дней). */
  shaved: boolean
  muted: boolean
  sceneId: string | null
  payday: PaydayView
  endingId: EndingId | null
  endingCount: number
  endingTotal: number
  ending: { id: EndingId; title: string; text: string; icon: string } | null
  /** Великая отмазка Дня выплаты: только для концовок payday_* со строкой-цепочкой в памяти. */
  grandExcuse: string | null
  finales: FinaleRow[]
  promises: PromiseRow[]
  act: ActRow[]
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
  // коллекция концовок — партия плюс отметка устройства (#1437): после «Начать заново» открытые остаются открытыми
  const onDevice = u.endingsSeen()
  const endings: EndingRow[] = ENDINGS.map((e) => ({ id: e.id, title: e.title, icon: e.icon, got: !!S.endings[e.id] || onDevice.has(e.id) }))
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
    endingId: ending?.id ?? null,
    endingCount: endings.filter((e) => e.got).length,
    endingTotal: ENDINGS.length,
    ending: ending ? { id: ending.id, title: ending.title, text: ending.text, icon: ending.icon } : null,
    grandExcuse: ending?.id.startsWith('payday_') && typeof chain === 'string' ? chain : null,
    finales: Object.keys(ARCS)
      .filter((id) => g.finaleTitle(id))
      .map((id) => ({ id, title: ARCS[id].title, finale: g.finaleTitle(id)! })),
    promises: S.promises.map((p) => ({ text: p.t, due: p.due, amnesty: p.amnesty ?? null, state: promiseState(p, S.day) })),
    act: actRows(S),
    arcs: Object.entries(ARCS).map(([id, a]) => {
      const i = S.arcs[id]?.i ?? 0
      const finale = g.finaleTitle(id)
      return { id, title: a.title, state: finale ? `финал «${finale}»` : `серия ${i}/${a.eps.length}`, done: i >= a.eps.length, locked: i === 0 }
    }),
    endings,
    items: S.items,
    ach: Object.entries(ACH).map(([k, [title, desc]]) => ({ id: k, title, desc: typeof desc === 'function' ? desc(S) : desc, got: !!S.ach[k] })),
    achGot: Object.keys(S.ach).length,
    achTotal: Object.keys(ACH).length,
  }
}

/** Лента — единственное, что не в снимке: инкрементальный канал MessageList читает сам массив
 *  (тот же объект, что и раньше; windowing и dirtyFrom считаются по нему в Chat). */
export const feedMsgs = (u: GameUi): Msg[] => realOf(u).S.msgs

// --- режим живого рецензирования (#872): граница с движком здесь, потому что транскрипту нужны S.msgs ---

/** Показ вариантов перед отправкой: экспорт рецензии восстанавливает, из чего выбирал игрок. */
const reviewOffers = new WeakMap<Game, Map<number, string[]>>()

/** Отправка с записью показа: список вариантов снимается до хода (send его гасит), подпись — по id сообщения. */
export function sendWithReview(g: Game, o: Parameters<Game['send']>[0]): Promise<void> {
  const list = g.choices.map((c) => c.text)
  const at = g.S.msgs.length
  const remember = () => {
    const mine = g.S.msgs.slice(at).find((m) => m.kind === 'text' && m.from === 'me')
    if (!mine || !list.length) return
    const byMsg = reviewOffers.get(g) ?? new Map<number, string[]>()
    byMsg.set(mine.id, list)
    reviewOffers.set(g, byMsg)
  }
  return g.send(o).then(() => { remember() })
}

/** Из чего выбирал игрок в этом сообщении: пусто — сообщение пришло мимо выбора варианта. */
export const reviewOffersOf = (g: Game): ReadonlyMap<number, readonly string[]> => reviewOffers.get(g) ?? new Map()

/** Шапка экспорта: партия на момент выгрузки. `build` — из `VITE_BUILD`, если сборка его задала. */
export function reviewSessionOf(g: Game, started: Date): ReviewSession {
  return {
    started: reviewStamp(started),
    day: g.S.day,
    turns: g.S.stats.sent,
    build: String(import.meta.env.VITE_BUILD ?? ''),
    endings: Object.keys(g.S.endings),
  }
}

/** Полная переписка партии для экспорта: тот же формат, что у плейтест-дампов (tools/playtest.ts). */
export function reviewTranscriptOf(g: Game, offers: ReadonlyMap<number, readonly string[]>): string {
  return reviewTranscript(g.S.msgs, offers, (who) => (who ? g.castOf(who)?.name ?? who : 'Алик'))
}

export type IntroView = {
  /** Короткое обещание завязки — факт из STARTS.vow, то же, что входит в первое сообщение Алика. */
  vow: string
  /** Системная строка завязки («…прошло 184 дня…») — та же, что в чате. */
  gap: string
  /** Дата сдачи (день 0) — той же функцией, что разделители чата. */
  date: string
}

/** Интро новой партии: null, если уже показано. Обещание и завязка — из той же партии, что пролог чата. */
export const introOf = (u: GameUi): IntroView | null => {
  const S = realOf(u).S
  if (S.introShown) return null
  const alik = S.msgs.find((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text' && m.from === 'alik')
  const sys = S.msgs.find((m): m is Extract<Msg, { kind: 'sys' }> => m.kind === 'sys')
  if (!alik || !sys) return null
  const start = STARTS.find((s) => s.intro === alik.text)
  if (!start) return null
  return { vow: start.vow, gap: sys.text, date: fmtDate(0) }
}
