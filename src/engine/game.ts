// Игра: состояние, сообщения, ход Алика, «живость». Решения — что ответить, что предложить игроку,
// что сделать Алику — принимает система правил (engine/rules/, content/rules/*).
import { make, D, low, cap, type ExcuseApi, type Promise3, type PromiseCondition, type Rel, type When } from '../content/excuses'
import { makeScenes, invKey, type Scene, type Line } from '../content/scenes'
import { COLD_WAR, TRIBUNAL } from '../content/rude'
import { MIRROR, MIRROR_AGAIN, MIRROR_OPEN, MIRROR_REPLY, type Mirror } from '../content/mirror'
import { PAYDAY_HOOKS } from '../content/rules/payday'
import { QUEST_WHEN } from '../content/rules/world'
import { LEGENDS } from '../content/legends'
import { TOPICS, P_NEU_B_LATE, P_RUDE_BLOCKED, P_RUDE_POLITE, P_POL_POLITE, P_NIGHT, P_FRIDAY, P_MONEY, P_DESPERATE } from '../content/topics'
import { FINALES, ENDINGS, DEFAULT_FINALE, type Finale } from '../content/finales'
import { ARCS, ARC_DONE, CAST, type Episode, GROUP, GROUP_OOPS, WRONG_TO, WRONG_WHAT, WRONG_OOPS } from '../content/arcs'
import * as L from '../content/life'
import { ACH } from '../content/achievements'
import { SPEAKS, meet } from '../content/world'
import { ALIK_STATUS, BLOOD_PAY, FLOOR, PHOTO_A, PHOTO_B, JOB_YES_P, JOB_NO_P, PLAYER_PREFIX, PLAYER_SUFFIX, STATUS_HIDDEN, STATUS_WANDER, OATH_FORMS, OATH_STAKE_MOUSTACHE } from '../content/misc'
import { STARTS } from '../content/quests'
import { BILLS, billDue, billDueAt, billStreak, billUnpaid, lightOff, netRation, phoneWarn, type BillId } from '../content/bills'
import {
  LOANS, THINGS, MOM_DONE_TEXT,
  creditStage, creditOffer, creditBroke, momDone, creditDeclined,
  sold, momHelp, loanTaken, loanDueAt, loanPayment, loanFailed, nextLoan, nextThing, allSold, nextMom,
  type LoanId, type ThingId, type Loan,
} from '../content/credit'
import { allRules } from '../content/rules'
import type { GameEvent, Offer } from '../content/rules/events'
import { CLAIMS, claimByKey, conflicts, CALLBACK_OPEN, type Claim } from '../content/lies'
import * as memkeys from '../content/memkeys'
import {
  ENDGAME_CHOICES, ENDGAME_FALLBACK, ENDGAME_FORMALITIES, ENDGAME_GROUP, ENDGAME_INTRO, ENDGAME_JUBILEES,
  ENDGAME_LEAVE, ENDGAME_MONEY, ENDGAME_MUTE, ENDGAME_OPEN, ENDGAME_RENAMES, ENDGAME_RETURNER_LINES, ENDGAME_RETURNERS, ENDGAME_VENDETTA, ENDGAME_ALIK_BACK,
  LEND50_ASK, LEND50_ASK_AGAIN, LEND50_CHOICES, LEND50_LINK, LEND50_MEMORY, LEND50_NO, LEND50_NUNE, LEND50_RENAME, LEND50_SERIOUS, LEND50_SYS, LEND50_YES,
} from '../content/endgame'
import { type Rng, mathRng, rndInt, shuffle, chance } from './rng'
import { Decks } from './deck'
import { Battery } from './battery'
import { Seen, type Keyed } from './uniq'
import {
  RuleSet, makeHub, Lines, resolver, test, isOpen, valueOf, set,
  type Criterion, type Entry, type Facts, type Resolver, type Rule, type Query, type Priority, type Line as PoolLine, type LineOpts, type Picked,
} from './rules'
import { MENTION_RE, WORLD } from '../content/world'
import { type Clock, type GameTimer, type WallTimer, realClock, isManualClock, wallClock } from './clock'
import { type Audio, silentAudio } from './audio'
import { typo } from './typo'
import { UiState, type Moo, type Notif, type SendFeel } from './ui-state'
import { classifyUserInput, legalClaim, type ClassifiedInput } from './input'
import { holidayOf, holidayGreetKey, holidayDays, HOLIDAY_EXCUSES } from '../content/holidays'
import { dueIn, dateOf, fmtDate, fmtDayMonth, fmtShortDate, fmtTime, weekOf, nightHour, periodOf, tierOf, TIERS, type Due, type Period } from './time'
import { type GameState, type Msg, type NewMsg, type Card, type PhoneEvent, type Choice, type Ctx, type Tone, type Storage, type InputCategory, freshState, loadState, saveState, SAVE_KEY, LEND50_SEEN_KEY, MAX_PATIENCE, isLate, countOf, setCount, type PromiseRec } from './state'

/** Текст срока как буквальный шаблон без учёта регистра; кэш — topicOfLast зовётся из facts() на каждую реплику. */
const LITERAL = new Map<string, RegExp>()
const literalRe = (t: string): RegExp => {
  let re = LITERAL.get(t)
  if (!re) LITERAL.set(t, (re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')))
  return re
}

/** Строгий режим молчания: правило промолчало, но изменило `S` или тост / уведомление / «Мууу».
 *  Статус, «печатает…», звук, вибрация, unread и feel в снимок не входят (#218). */
export class SilenceBreach extends Error {}

/** Отмена async после dispose — ловится на entry points, игроку не показывается. */
export class GameDisposed extends Error {
  override name = 'GameDisposed'
  constructor() { super('Game disposed') }
}

export interface GameOptions {
  storage?: Storage | null
  rng?: Rng
  clock?: Clock
  audio?: Audio
  /** Подменить реальный час (?hour=3) */
  hour?: number | null
  /** Будто игрока не было N минут (?away=90) */
  away?: number | null
  /** Не запускать фоновые таймеры (для тестов) */
  noTimers?: boolean
  /** Записывать, какое правило выбрано и почему (?debug) */
  debug?: boolean
  /** Опечатки Алика (в тестах выключены, чтобы проверять тексты дословно) */
  typos?: boolean
  /** Промолчавшее правило, оставившее след в S, — ошибка (в тестах включено; снимок S на каждое правило стоит времени) */
  strictSilence?: boolean
}


// Регулярки событий в тексте Алика; ввод игрока классифицирует engine/input.ts.
export const TIMEY = /^(Завтра|Скоро|Вечером|Щас|Минуту|Уже почти|Сейчас не могу|Перезвоню|Наберу)/
export const SAD = /похорон|поминк|умер|реанимац|заболел|потоп|пожар|затопил|сломал|потерял|утонул|упало|сбежал|развод|похитил|застрял|сорвалась|отменили/
export const REVIVED = /встал|встаёт|воскрес|вернулась/
/** Повод поздравить (иначе «Поздравляю!» на «зуб мудрости растёт» звучит невпопад). */
export const FESTIVE = /свадьб|крестин|юбилей|обручен|день рождения|отмечаем|обмываем|празд|родился|поступил|выпускн|сватовств|помолвк|открыва|открыли|приехал|вернулся|урожа|отелилась|правнук|первое слово|дочку выдают/

export type SayItem = string | { w: string; t: string }
/** Что пришло, пока игрока не было: виды сообщений пачки непрочитанных. */
export type AwayKind = 'text' | 'sticker' | 'fwd' | 'deleted' | 'voice' | 'transfer' | 'excuse' | 'formality' | 'coldWar'

const POOR_REPEAT_DAYS = 14
/** Минимум сообщений игрока между клятвами легенды — одна защита на все пути (#179). */
const LEGEND_VOW_GAP = 8

export class Game {
  /** Только чтение: подмена состояния целиком (`this.S = …`) — один из обходов долга из аудита #142. */
  readonly S: GameState
  readonly rng: Rng
  readonly clock: Clock
  private readonly rawAudio: Audio
  get audio(): Audio {
    return this.disposed ? silentAudio : this.rawAudio
  }
  readonly decks: Decks
  readonly seen: Seen
  readonly X: ExcuseApi
  readonly scenes: Record<string, Scene>
  readonly rules: RuleSet<Game, Offer>
  /** Выбор реплик как в Hades: требования, приоритет, «уже сказано». */
  readonly lines: Lines
  readonly D = D

  /** Состояние интерфейса (не сохраняется) — ui-state.ts. */
  readonly ui = new UiState()
  /** Заряд и «телефон сел» — вся логика в battery.ts. */
  readonly battery: Battery

  private storage: Storage | null
  private hour: number | null
  private listeners = new Set<() => void>()
  private version = 0
  private idleT: GameTimer | null = null
  private statusT: GameTimer | null = null
  /** UI-таймеры вне game-clock — иначе ?fast гасит тост за десятки мс. */
  private toastWall: WallTimer | null = null
  private notifWall: WallTimer | null = null
  /** Пока на экране одно уведомление, следующие ждут — иначе кредит затирает «недостаточно средств». */
  private notifQueue: Notif[] = []
  private idleCount = 0
  private seq = 1
  private resetting = false
  private disposed = false
  private timerIds = new Set<GameTimer>()
  private sleepWaiters = new Set<(err?: GameDisposed) => void>()
  private noTimers: boolean
  private typos: boolean
  private hiddenAt = 0
  /** Ход игрока: nextDay уже был (offline / fx.days) — обычный +1…3 в конце не дублируем. */
  private inPlayerTurn = false
  private dayMovedInTurn = false
  /** Ключи банковских SMS за день — одно и то же не дважды (#251 / #178). */
  private bankSmsDay: { day: number; keys: Set<string> } | null = null

  constructor(opts: GameOptions = {}) {
    this.storage = opts.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : opts.storage
    this.rng = opts.rng ?? mathRng
    this.clock = opts.clock ?? realClock()
    this.rawAudio = opts.audio ?? silentAudio
    this.hour = opts.hour ?? null
    this.noTimers = !!opts.noTimers
    this.typos = opts.typos ?? true
    this.S = loadState(this.storage) ?? freshState()
    // колбеки батареи — в узком хосте, а не в публичном интерфейсе Game: game.dead() путался бы со смертью Алика
    this.battery = new Battery(this.S, {
      low: (level) => this.notify('🪫', 'Система', `Низкий заряд батареи: ${level}%`, { event: 'battery' }),
      dead: () => this.onPhoneDead(),
      chargeDone: () => this.onPhoneCharged(),
      sleep: (ms) => this.sleep(ms),
      emit: () => this.emit(),
      isDisposed: () => this.disposed,
      rnd: (n) => this.rnd(n),
    })
    this.decks = new Decks(this.S.bags, this.rng)
    this.seen = new Seen(this.S.seen)
    this.X = make(<T>(k: string, a: readonly Entry<T>[], nr?: boolean) => (nr ? this.decks.pick(k, a, this.lineFacts(), { noRepeat: true }) as T : this.draw(k, a)), () => this.S.tier, this.rng)
    this.scenes = makeScenes(this.X)
    this.S.rules.said ??= {} // старые сохранения
    this.lines = new Lines(this.S.rules.said, this.rng, () => ({ turn: this.S.stats.sent, day: this.S.day }))
    this.rules = new RuleSet<Game, Offer>({
      rng: this.rng,
      hub: makeHub(this.S.mem, this.S.actors),
      state: this.S.rules,
      now: () => ({ turn: this.S.stats.sent, day: this.S.day }),
      silence: opts.strictSilence ? (_, r) => this.silenceCheck(r.name) : undefined,
    }).add(...allRules)
    if (opts.debug) {
      this.rules.tracer = (t) => {
        this.ui.trace = [{ ...t, id: this.seq++, day: this.S.day }, ...this.ui.trace].slice(0, 40)
      }
    }
    this.rawAudio.setMuted(this.S.muted)

    if (!this.S.msgs.length) this.seed()
    else { this.restoreDueEvents(); this.scheduleBills(); this.scheduleCredits(); this.migrateCreditSave() }
    // Старое сохранение с готовой просьбой уже прошло вступление; новый маркер появился позже (#358).
    if (this.S.mem[memkeys.endgame.active] && this.S.mem[memkeys.lend50.asked] && !this.S.mem[memkeys.endgame.intro]) {
      this.S.mem[memkeys.endgame.intro] = true
    }
    // Незаконченные вступление/просьба — до пачки непрочитанных: иначе opening рвётся away-burst (#248/#358).
    if (this.S.mem[memkeys.endgame.active]
      && (!this.S.mem[memkeys.endgame.intro] || !this.S.mem[memkeys.lend50.asked])) {
      this.ui.busy = true
      this.S.choices = []
      const outcome = String(this.S.mem[memkeys.paydayScene] ?? 'default')
      void this.resumeEndgameOpening(outcome, opts.away ?? null).catch((e) => {
        if (!(e instanceof GameDisposed)) console.error('[alik] вступление эндгейма не восстановлено', e)
      })
    } else void this.checkAway(opts.away ?? null)
    if (!this.S.choices) this.S.choices = this.buildChoices()
    this.restStatus()
    if (this.battery.level === 0) this.battery.die()
    else { this.armIdle(); this.armStatus() }
    this.save()
  }

  // ---------- подписка для React ----------
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getVersion = (): number => this.version
  /** Эпоха ленты: растёт только при push/замене сообщения — для изолированного списка в UI. */
  getMsgsEpoch = (): number => this.msgsEpoch
  /** Индекс, с которого UI должен пересобрать узлы (накопленный min с прошлого ack). */
  getMsgsDirtyFrom = (): number => this.msgsDirtyFrom
  /** UI: dirty-диапазон применён. */
  ackMsgsDirty = (): void => {
    this.msgsDirtyOpen = false
    this.msgsDirtyFrom = this.S.msgs.length
  }
  emit(): void {
    if (this.disposed) return
    this.version++
    for (const fn of this.listeners) fn()
  }

  private msgsEpoch = 0
  private msgsDirtyFrom = 0
  private msgsDirtyOpen = false
  private touchMsgs(from = 0): void {
    this.msgsDirtyFrom = this.msgsDirtyOpen ? Math.min(this.msgsDirtyFrom, from) : from
    this.msgsDirtyOpen = true
    this.msgsEpoch++
  }

  /** Лента изменена снаружи (тесты): перерисовать MessageList. */
  notifyMsgs(): void {
    this.touchMsgs(0)
    this.emit()
  }

  /** Активные таймеры этого экземпляра (для тестов). */
  pendingTimers(): number {
    return this.timerIds.size
  }

  private schedule(fn: () => void, ms: number): GameTimer {
    const id = this.clock.setTimeout(() => {
      this.timerIds.delete(id)
      if (!this.disposed) fn()
    }, ms)
    this.timerIds.add(id)
    return id
  }

  private clearSchedule(id: GameTimer | null): void {
    if (id === null) return
    this.clock.clearTimeout(id)
    this.timerIds.delete(id)
  }

  private swallowDisposed(e: unknown): void {
    if (!(e instanceof GameDisposed)) throw e
  }

  /** Ошибка в середине хода: партия не должна умереть вместе с ним. */
  private recoverTurn(e: unknown): void {
    if (e instanceof SilenceBreach) throw e
    this.ui.busy = false
    this.inPlayerTurn = false
    if (e instanceof GameDisposed) return
    console.error('[alik] ход прерван ошибкой', e)
    try {
      this.restStatus()
      this.S.choices = this.choicesAfterCrash()
      this.save()
      this.emit()
      this.armIdle()
    } catch (inner) { console.error('[alik] восстановление после ошибки не удалось', inner) }
  }

  /** Кнопки после падения: сломанная сцена собирается снова при каждой отрисовке, а пустой список — всё ещё игра, свой текст пишется. */
  private choicesAfterCrash(): Choice[] {
    try { return this.buildChoices() } catch (e) { console.error('[alik] сцена не собирается — выходим из неё', e) }
    this.clearScene()
    try { return this.buildChoices() } catch (e) { console.error('[alik] кнопки не собираются', e); return [] }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const id of [...this.timerIds]) this.clock.clearTimeout(id)
    this.timerIds.clear()
    this.idleT = this.statusT = null
    if (this.toastWall !== null) { wallClock.clearTimeout(this.toastWall); this.toastWall = null }
    if (this.notifWall !== null) { wallClock.clearTimeout(this.notifWall); this.notifWall = null }
    this.notifQueue = []
    const err = new GameDisposed()
    for (const finish of this.sleepWaiters) finish(err)
    this.sleepWaiters.clear()
    this.listeners.clear()
    this.rawAudio.dispose()
  }

  save(): void {
    if (this.disposed || this.resetting) return
    this.S.lastSeen = this.clock.now()
    saveState(this.storage, this.S)
  }

  reset(): void {
    this.resetting = true
    this.storage?.removeItem(SAVE_KEY)
  }

  /** Интро показано или пропущено: единственный факт, который интро ставит партии. */
  introDone(): void {
    if (this.S.introShown) return
    this.S.introShown = true
    this.save()
  }

  // ---------- helpers ----------
  /** Следующий уместный сейчас элемент колоды (needs/gate). */
  draw = <T>(key: string, arr: readonly Entry<T>[]): T => {
    const x = this.decks.pick(key, arr, this.lineFacts())
    if (x === null) throw new Error(`Колода ${key}: ни одного элемента, уместного сейчас`)
    return x
  }
  /**
   * Снимок видимого игроку состояния для строгого режима молчания: весь `S` (включая тексты ленты)
   * и эфемерный UI, который игрок замечает (тост, уведомление, «Мууу»). RNG в снимок не входит.
   */
  private silenceCheck(rule: string): () => void {
    const stamp = () => JSON.stringify({
      S: this.S,
      visible: { toast: this.ui.toast, notif: this.ui.notif, moos: this.ui.moos },
    })
    const before = stamp()
    return () => { if (stamp() !== before) throw new SilenceBreach(`Правило ${rule} промолчало, но оставило след в S или тосте/уведомлении/«Мууу»`) }
  }
  lineFacts(): Resolver {
    return resolver(this.rules.hub, { event: 'line' }, this.facts())
  }
  holds = (c: Criterion): boolean => test(c, this.lineFacts())
  /** Уместные сейчас элементы списка, который звучит целиком. */
  open<T>(arr: readonly Entry<T>[]): T[] {
    const facts = this.lineFacts()
    return arr.filter((e) => isOpen(e, facts)).map(valueOf)
  }
  canSpeak = (who: string): boolean => !SPEAKS[who] || this.holds(SPEAKS[who])
  /**
   * Реплика из пула по правилам Hades: подходящие условия, не сказанные, верхний приоритет.
   * Пул исчерпан — fallback (обычно генератор отмазок) или null.
   */
  line(key: string, pool: readonly PoolLine[], o: LineOpts & { fallback?: () => string } = {}): string | null {
    const p = this.linePicked(key, pool, o)
    if (!p) return o.fallback ? this.uniq(o.fallback) : null
    return p.text
  }
  /** То же, но с самой репликой (её поля: сумма в День выплаты, кто говорит). */
  linePicked(key: string, pool: readonly PoolLine[], o: LineOpts = {}): Picked | null {
    const p = this.lines.pick(key, pool, this.lineFacts(), o)
    if (!p) return null
    this.lines.mark(p.id)
    this.seen.mark(p.text)
    if (p.spec.remember) this.rules.applyOps(p.spec.remember, {})
    return p
  }
  rnd = (n: number): number => rndInt(this.rng, n)
  chance = (p: number): boolean => chance(this.rng, p)
  sleep = (ms: number): Promise<void> => {
    if (this.disposed) return Promise.reject(new GameDisposed())
    return new Promise((resolve, reject) => {
      let settled = false
      let id: GameTimer | null = null
      const finish = (err?: GameDisposed) => {
        if (settled) return
        settled = true
        this.sleepWaiters.delete(finish)
        this.clearSchedule(id)
        if (err) reject(err)
        else resolve()
      }
      this.sleepWaiters.add(finish)
      id = this.schedule(() => finish(), ms)
      // manualClock: синхронные тесты — не ждём runTimers для каждой паузы
      if (isManualClock(this.clock)) {
        this.clearSchedule(id)
        queueMicrotask(() => finish(this.disposed ? new GameDisposed() : undefined))
      }
    })
  }

  alikDecor = <T extends Keyed>(t: T): T => {
    const f = (s: string) => `${this.X.g('ADDR')}, ${low(s)}`
    if (typeof t === 'string') return f(t) as T
    if (t.texts) return { ...(t as object), texts: [f(t.texts[0]), ...t.texts.slice(1)] } as T
    return { ...(t as object), text: f(t.text ?? '') } as T
  }
  playerDecor = (t: string): string => {
    if (/^Алик/.test(t)) return t + this.draw('PSUF', PLAYER_SUFFIX)
    const pre = this.draw('PPRE', PLAYER_PREFIX)
    return pre + (pre.endsWith(', ') ? low(t) : t)
  }
  /** Реплика Алика, которой ещё не было. */
  uniq = <T extends Keyed>(gen: () => T): T => {
    const t = this.seen.pickFresh(gen, this.alikDecor)
    this.seen.mark(t)
    return t
  }
  /** Реплика игрока, которой ещё не было (помечается как виденная только при отправке). */
  /** Реплика игрока: не отправленная раньше и не мелькавшая среди вариантов последних ходов. */
  playerLine = (gen: () => string): string => {
    // «Эм… <то, что игрок только что отправил>» — не перефразировка, а эхо: такие варианты не предлагаем
    const recent = this.S.msgs.slice(-40).flatMap((m) => (m.kind === 'text' && m.from === 'me' ? [m.text] : []))
    const echo = (t: string) => recent.some((r) => t !== r && (t.endsWith(r) || t.startsWith(r)))
    let t = ''
    for (let i = 0; i < 8; i++) { t = this.seen.pickFresh(gen, this.playerDecor); if (!this.shown.has(t) && !echo(t)) break }
    this.shown.add(t)
    if (this.shown.size > 60) this.shown.delete(this.shown.values().next().value!)
    return t
  }
  private shown = new Set<string>()
  /** Ход, в котором уже была серия (две серии разных сериалов подряд — каша). */
  private arcAt = -1
  /** Свежая реплика игрока из пула или null, если весь пул недавно показывали или отправляли. */
  freshPlayer(key: string, arr: readonly Entry<string>[]): string | null {
    const t = this.decks.pick(key, arr, this.lineFacts(), { eligible: (e) => !this.shown.has(valueOf(e)) && !this.seen.has(valueOf(e)) })
    if (t === null) return null
    this.shown.add(t)
    if (this.shown.size > 60) this.shown.delete(this.shown.values().next().value!)
    return t
  }
  /**
   * Бедность: свежие без повторов; исчерпанный пул — одна строка на окно POOR_REPEAT_DAYS,
   * повтор в той же сборке дня — null (#184/#348).
   */
  private poorShownDay = -1
  private poorShown = new Set<string>()
  poorLine(key: string, arr: readonly Entry<string>[]): string | null {
    if (this.poorShownDay !== this.S.day) {
      this.poorShown.clear()
      this.poorShownDay = this.S.day
    }
    const fresh = this.freshPlayer(key, arr)
    if (fresh !== null) return fresh
    const open = arr.filter((e) => isOpen(e, this.lineFacts())).map(valueOf)
    if (!open.length) return null
    const t = open[Math.floor(this.S.day / POOR_REPEAT_DAYS) % open.length]!
    if (this.poorShown.has(t)) return null
    this.poorShown.add(t)
    return t
  }
  pair = (ka: string, a: readonly Entry<string>[], kb: string, b: readonly Entry<string>[]): string =>
    this.uniq(() => `${this.draw(ka, a)} ${this.draw(kb, b)}`)
  addrLine = (key: string, arr: readonly Entry<string>[]): string => this.uniq(() => `${this.X.g('ADDR')}, ${this.draw(key, arr)}`)

  /** Подставить состояние в текст: {debt} и {money} — деньги, {night} — который час по часам переписки. */
  fillMoney = (t: string): string =>
    t.replace('{debt}', this.S.debt.toLocaleString('ru-RU')).replace('{money}', this.S.money.toLocaleString('ru-RU')).replace('{night}', nightHour(this.S.clock)).replace('{Night}', cap(nightHour(this.S.clock)))

  get ctx(): Ctx | null { return this.S.ctx }
  setCtx(c: Ctx | null): void { this.S.ctx = c }

  /** День выплаты закрыт — долг больше не меняется (docs/design/endgame.md). */
  debtSealed(): boolean {
    return this.S.mem[memkeys.paydayScene] != null
  }
  /** Изменить долг. После выплаты — false, значение не тронуто. */
  adjustDebt(delta: number): boolean {
    if (this.debtSealed()) return false
    setCount(this.S, 'debt', countOf(this.S, 'debt') + delta)
    return true
  }
  // Дно ≤ 6000 (как старый FLOOR); «мало» ≤ 9000 — предупреждение до дна. Старт — START_MONEY.
  // После первого дна (`money.poor`) до выплаты уровень не возвращается в «норму» (#279).
  static readonly MONEY_LOW = 9000
  static readonly MONEY_BOTTOM = 6000
  moneyLevel(): 'normal' | 'low' | 'bottom' {
    const m = this.S.money
    if (m <= Game.MONEY_BOTTOM) return 'bottom'
    if (this.S.mem[memkeys.moneyPoor] && !this.moneySealed()) return 'low'
    if (m <= Game.MONEY_LOW) return 'low'
    return 'normal'
  }
  /** После Дня выплаты механика денег выключена. */
  moneySealed(): boolean {
    return this.debtSealed() || !!this.S.mem[memkeys.endgame.active]
  }
  /** Единственная точка изменения S.money: строка недельной сводки + смена уровня (#287). `group` — строка сводки вместо `reason`; `onDay` — неделя срока, не день обработки (#300). Сумму не режет — потолок бедности у `relief` (#322). */
  adjustMoney(delta: number, reason: string, opts?: { group?: string; onDay?: number }): boolean {
    if (this.moneySealed()) return false
    if (delta < 0 && -delta > this.S.money) return false
    if (delta === 0) return true
    const before = this.moneyLevel()
    setCount(this.S, 'money', Math.max(0, countOf(this.S, 'money') + delta))
    if (this.S.money <= Game.MONEY_BOTTOM) this.S.mem[memkeys.moneyPoor] = true
    const after = this.moneyLevel()
    this.bankLine(opts?.group ?? reason, delta, false, opts?.onDay)
    const rank = { normal: 2, low: 1, bottom: 0 }
    if (rank[after] < rank[before]) {
      const bal = this.rub(this.S.money)
      if (after === 'low') this.bankCard(`Банк обеспокоен остатком: ${bal}. Рекомендуем не ждать Алика.`, { event: 'bank.level' })
      // шапка предложения — без остатка: карточку жмут позже, а число в ней стареет (#337)
      else if (!this.newFall()) { /* дно не новость */ }
      else if (this.loanOffer()) this.maybeCreditOffer(`Остаток критический после «${reason}»`)
      else {
        this.criticalCard(`Остаток критический: ${bal}. Гречка и достоинство — разные статьи расходов.`, { event: 'bank.level' })
        this.maybeCreditOffer()
      }
    }
    return true
  }
  /** «Новое падение»: после первого дна баланс живёт у дна, и каждая неделя счетов — не новость. Банк объявляет остаток критическим (и предлагает ступень) не чаще раза в POOR_REPEAT_DAYS (#337). */
  private newFall(): boolean {
    const at = this.S.mem[memkeys.criticalAt]
    return at == null || this.S.day - Number(at) >= POOR_REPEAT_DAYS
  }
  private criticalCard(text: string, extra: Partial<Card> & { event: PhoneEvent }): void {
    this.S.mem[memkeys.criticalAt] = this.S.day
    this.bankCard(text, extra)
  }
  private rub(n: number): string { return `${n.toLocaleString('ru-RU')} ₽` }
  private bankCard(text: string, extra: Partial<Card> & { event: PhoneEvent }): void { this.notify('🏦', 'Банк', text, extra) }
  /** Строка недельной сводки; `refused` — трата не прошла; `onDay` — день срока платежа (#300). */
  private bankLine(label: string, delta: number, refused = false, onDay = this.S.day): void {
    if (this.moneySealed()) return
    const week = weekOf(onDay)
    if (this.S.bank && this.S.bank.week !== week) this.flushBankWeek()
    const b = (this.S.bank ??= { week, lines: {}, bal: this.S.money })
    const key = `${refused ? '!' : delta < 0 ? '-' : '+'}${label}`
    const l = (b.lines[key] ??= { sum: 0, n: 0 })
    l.sum += Math.abs(delta)
    l.n++
    b.bal = this.S.money
  }
  /** Сводка прошедшей недели — одна карточка, когда календарь перешёл в новую (#287). */
  flushBankWeek(): void {
    const b = this.S.bank
    // только прошедшие недели: буфер будущей недели (если появится) не сбрасываем
    if (!b || b.week >= weekOf(this.S.day)) return
    this.S.bank = null
    if (this.moneySealed()) return
    const part = (sign: string, head: string): string[] => {
      const rows = Object.entries(b.lines).filter(([k]) => k[0] === sign)
      return rows.length ? [`${head}: ${rows.map(([k, v]) => `${k.slice(1)} ${this.rub(v.sum)}${v.n > 1 ? ` (${v.n} ${[2, 3, 4].includes(v.n % 10) && ![12, 13, 14].includes(v.n % 100) ? 'раза' : 'раз'})` : ''}`).join(', ')}`] : []
    }
    const lines = [...part('-', 'Списано'), ...part('+', 'Поступило'), ...part('!', 'Не прошло')]
    if (!lines.length) return
    this.bankCard(`Сводка за неделю ${fmtShortDate(b.week)} – ${fmtShortDate(b.week + 6)}: баланс ${this.rub(b.bal)}`, { lines, event: 'bank.summary' })
  }
  /** Перевод от Алика: paid — любой; fifty — только ровно 50 ₽ (ачивка «пять раз»). */
  noteAlikPay(amount: number): void {
    this.S.stats.paid++
    if (amount === 50 && ++this.S.stats.fifty >= 5) this.unlock('fifty5')
  }
  /** Поставить в расписание ближайшие платежи (и предупреждение за день). */
  scheduleBills(): void {
    if (this.moneySealed()) return
    for (const bill of BILLS) {
      if (bill.skip?.(this.S.mem)) continue
      const atKey = billDueAt(bill.id)
      // срок стоит — его событие ещё впереди или ждёт в этой же пачке: второе расписание удвоит платёж
      if (this.S.mem[atKey] != null) continue
      const at = this.S.day + dueIn(bill.due, this.S.day)
      this.S.mem[atKey] = at
      this.scheduleBillDue(bill.id, at)
    }
  }
  private scheduleBillDue(id: BillId, at: number): void {
    this.scheduleEvent(at, 'BillDue', { bill: id, at })
    // предупреждение SMS — только коммуналка (#178/#251); иначе игрок кричит «списание завтра» без SMS
    if (id === 'rent' && at - 1 > this.S.day) this.scheduleEvent(at - 1, 'BillWarn', { bill: id, at })
  }
  /** Срок стоит, а события в сохранении нет — платёж молчал бы навсегда: вернуть событие на срок (#272). */
  private restoreDueEvents(): void {
    if (this.moneySealed()) return
    const has = (event: GameEvent, k: 'bill' | 'credit', id: string, at: number): boolean =>
      this.rules.state.schedule.some((it) => it.kind === 'event' && it.event === event && it.facts?.[k] === id
        && (it.facts.at == null || Number(it.facts.at) === at))
    for (const bill of BILLS) {
      const at = this.S.mem[billDueAt(bill.id)]
      if (at == null || bill.skip?.(this.S.mem) || has('BillDue', 'bill', bill.id, Number(at))) continue
      this.scheduleBillDue(bill.id, Number(at))
    }
    for (const loan of LOANS) {
      const at = this.S.mem[loanDueAt(loan.id)]
      if (at == null || !this.S.mem[loanTaken(loan.id)] || has('CreditDue', 'credit', loan.id, Number(at))) continue
      this.scheduleEvent(Number(at), 'CreditDue', { credit: loan.id, at: Number(at) })
    }
  }
  /** Событие по сроку — текущий срок, не устаревший дубль (без `at` — из старого сохранения); «завтра» — только накануне (#272). */
  private dueLive(key: string, at: unknown, dayBefore = false): boolean {
    const cur = this.S.mem[key]
    if (cur == null) return false
    if (at != null && Number(at) !== Number(cur)) return false
    if (dayBefore) return Number(cur) === this.S.day + 1
    return at != null || Number(cur) <= this.S.day
  }
  billEventLive(id: BillId, at: unknown, event: 'BillDue' | 'BillWarn'): boolean {
    return this.dueLive(billDueAt(id), at, event === 'BillWarn')
  }
  creditEventLive(id: LoanId, at: unknown): boolean {
    return this.dueLive(loanDueAt(id), at)
  }
  /** Списать платёж или записать неоплату и последствия. */
  chargeBill(id: BillId): void {
    if (this.moneySealed()) return
    const bill = BILLS.find((b) => b.id === id)
    if (!bill || bill.skip?.(this.S.mem)) return
    const dueAt = this.S.mem[billDueAt(id)]
    const dueDay = dueAt != null ? Number(dueAt) : this.S.day
    // неделя срока, но не будущего буфера: досрочное списание в тесте остаётся в текущей неделе
    const onDay = Math.min(dueDay, this.S.day)
    this.rules.applyOps([set(billDue(id), false)], {})
    delete this.S.mem[billDueAt(id)]
    if (this.adjustMoney(-bill.amount, bill.label, { onDay })) {
      this.rules.applyOps([set(billUnpaid(id), false), set(billStreak(id), 0)], {})
      this.scheduleBills()
      if (this.moneyLevel() === 'bottom' && this.newFall()) this.maybeCreditOffer()
      return
    }
    const streak = Number(this.S.mem[billStreak(id)] ?? 0) + 1
    this.rules.applyOps([set(billUnpaid(id), true), set(billStreak(id), streak)], {})
    if (id === 'rent' && streak >= 1) this.rules.applyOps([set(lightOff, true)], {})
    if (id === 'phone' && streak >= 1) this.rules.applyOps([set(phoneWarn, true)], {})
    if (id === 'phone' && streak >= 2) this.rules.applyOps([set(netRation, true)], {})
    if (id === 'transit' && streak >= 2) this.rules.applyOps([set(netRation, true)], {})
    this.scheduleBills()
    // неоплата — факт и последствия, а не ежедневное эхо: банк говорит один раз за полосу (#184/#178)
    this.refused(`Не прошло: ${bill.label}, ${this.rub(bill.amount)}`, 'Недостаточно средств. Достоинство не принимается.', streak === 1)
  }
  /** Отказ платежа: карточка с причиной — или сразу предложение кредита с ней же (#287). */
  private refused(why: string, tail: string, say: boolean): void {
    if (say && this.loanOffer() && this.newFall()) { this.maybeCreditOffer(why); return }
    if (say) this.bankCard(`${why}. ${tail}`, { event: 'bank.refusal' })
    if (this.moneyLevel() === 'bottom' && this.newFall()) this.maybeCreditOffer()
  }
  /** Расписание платежей по взятым кредитам. */
  scheduleCredits(): void {
    if (this.moneySealed()) return
    for (const loan of LOANS) {
      if (!this.S.mem[loanTaken(loan.id)]) continue
      // после перевербовки микрозайм с игрока не требуют (#128)
      if (loan.id === 'micro' && this.S.mem[memkeys.collectorsRecruited]) continue
      const atKey = loanDueAt(loan.id)
      if (this.S.mem[atKey] != null) continue
      const at = this.S.day + dueIn(loan.due, this.S.day)
      this.S.mem[atKey] = at
      this.scheduleEvent(at, 'CreditDue', { credit: loan.id, at })
    }
  }
  /** Списать платёж по займу; отказ по микрозайму → ступень «нечем платить». */
  chargeCredit(id: LoanId): void {
    if (this.moneySealed()) return
    const loan = LOANS.find((l) => l.id === id)
    if (!loan || !this.S.mem[loanTaken(id)]) return
    if (id === 'micro' && this.S.mem[memkeys.collectorsRecruited]) {
      delete this.S.mem[loanDueAt(id)]
      return
    }
    const payment = Number(this.S.mem[loanPayment(id)] ?? loan.payment)
    const dueAt = this.S.mem[loanDueAt(id)]
    const dueDay = dueAt != null ? Number(dueAt) : this.S.day
    const onDay = Math.min(dueDay, this.S.day)
    delete this.S.mem[loanDueAt(id)]
    if (this.adjustMoney(-payment, loan.label, { onDay })) {
      this.rules.applyOps([set(loanFailed(id), false)], {}) // платёж прошёл — полоса неоплат закрыта
      this.scheduleCredits()
      return
    }
    // банк говорит один раз за полосу неоплат, а не каждую неделю (#184/#178)
    const first = !this.S.mem[loanFailed(id)]
    if (first) this.rules.applyOps([set(loanFailed(id), true)], {})
    this.scheduleCredits()
    const why = `Не прошло: ${loan.label}, ${this.rub(payment)}`
    if (id === 'micro' && !this.S.mem[creditBroke]) {
      this.rules.applyOps([set(creditBroke, true), set(creditStage, 4)], {})
      this.notify('🏦', 'МФО', `${why}. Мы не злимся. Мы записываем`, { event: 'bank.refusal' })
      if (this.moneyLevel() === 'bottom' && this.newFall()) this.maybeCreditOffer()
      return
    }
    this.refused(why, 'Недостаточно средств.', first)
  }
  /** Ступень, которую банк может предложить сейчас; null — дна нет, лестница кончилась или пора маме. */
  private loanOffer(): Loan | null {
    if (this.moneySealed() || this.moneyLevel() !== 'bottom') return null
    const stage = Number(this.S.mem[creditStage] ?? 0)
    if (this.S.mem[creditBroke] || (allSold(this.S.mem) && stage === 0) || stage >= 3) return null
    return nextLoan(stage)
  }
  /**
   * На дне: карточка со следующей ступенью лестницы и причиной рядом, либо мама, если лестница кончилась
   * или игрок продал всё, так и не взяв кредит. Открытое или отложенное «не сейчас» предложение банк
   * повторяет только с новой причиной — ниже в ленте, старая карточка закрывается. true — карточка есть.
   */
  maybeCreditOffer(why?: string): boolean {
    if (this.moneySealed() || this.moneyLevel() !== 'bottom') return false
    const stage = Number(this.S.mem[creditStage] ?? 0)
    // мама: лестница кончилась, или всё продано без единого займа
    if (this.S.mem[creditBroke] || (allSold(this.S.mem) && stage === 0)) {
      this.tryMomHelp()
      return false
    }
    // после микрозайма новых кредитов нет — капают платежи
    const loan = this.loanOffer()
    if (!loan) return false
    if (!why && (this.S.mem[creditOffer] || this.S.mem[creditDeclined])) return false
    // сумма фиксируется здесь и даётся ровно она: обещанное и зачисленное — одно число (#337)
    const sum = this.relief(loan.amount)
    this.closeOffers()
    this.rules.applyOps([set(creditOffer, true), set(creditDeclined, false), set(memkeys.creditOfferSum, sum)], {})
    const thing = nextThing(this.S.mem)
    const take = loan.id === 'consumer' ? 'Взять кредит «Всё будет»'
      : loan.id === 'refi' ? 'Взять кредит на погашение кредита'
      : 'Взять микрозайм «Деньги-Ара»'
    this.criticalCard(`${why ?? 'Остаток критический'}. ${loan.offer.replace('{sum}', this.rub(sum))}`, { offer: { take, sell: thing?.choice }, event: 'bank.offer' })
    return true
  }
  private closeOffers(): void {
    for (const m of this.S.msgs) if (m.kind === 'card' && m.offer && !m.answered) this.replaceMsg(m, { answered: true })
  }
  /** Старое сохранение до #287: кнопки кредита в S.choices и credit.offer без карточки (#300). */
  private migrateCreditSave(): void {
    // только кредитные кнопки из старых сохранений — не весь пул вариантов (#323)
    const creditAct = (c: { act?: string }) => c.act === 'creditTake' || c.act === 'creditSell' || c.act === 'creditLater'
    if (this.S.choices?.some(creditAct)) {
      this.S.choices = this.S.choices.filter((c) => !creditAct(c))
      if (!this.S.choices.length) this.S.choices = null
    }
    if (!this.S.mem[creditOffer]) return
    if (this.S.msgs.some((m) => m.kind === 'card' && m.offer && !m.answered)) return
    delete this.S.mem[creditOffer]
    delete this.S.mem[creditDeclined]
    this.maybeCreditOffer('Предложение банка ещё открыто')
  }
  private clearScene(alsoCtx = false): void {
    this.S.scene = null
    if (alsoCtx) this.S.ctx = null
    this.flushSceneCards()
  }
  private flushSceneCards(): void {
    const q = this.S.pendingCards.splice(0)
    for (const c of q) {
      // после выплаты банк/МФО из очереди не выпускаем (#323)
      if ((c.app === 'Банк' || c.app === 'МФО') && this.moneySealed()) continue
      // уже прошли дедуп при откладывании — повторный notify снова отбросил бы банк (#300)
      this.push({ kind: 'card', time: fmtTime(this.S.clock), icon: c.icon, app: c.app, text: c.text, lines: c.lines, offer: c.offer, answered: c.answered, result: c.result })
      this.audio.vibrate(30)
    }
  }
  /** Передышка после дна (кредит, Авито, мама) — до порога «мало» (#299); считается там, где пишется текст: названное и зачисленное — одно число (#322). Деньги Алика сюда не ходят. */
  relief(amount: number): number {
    return this.S.mem[memkeys.moneyPoor] ? Math.min(amount, Math.max(0, Game.MONEY_LOW - this.S.money)) : amount
  }
  takeCredit(): void {
    if (this.moneySealed() || !this.S.mem[creditOffer]) return
    const stage = Number(this.S.mem[creditStage] ?? 0)
    const loan = nextLoan(stage)
    if (!loan) return
    const offered = this.S.mem[memkeys.creditOfferSum]
    const amount = offered != null ? Number(offered) : this.relief(loan.amount)
    if (amount === 0) return
    delete this.S.mem[memkeys.creditOfferSum]
    const payment = amount === loan.amount ? loan.payment : Math.max(1, Math.round(loan.payment * amount / loan.amount))
    this.rules.applyOps([
      set(creditOffer, false),
      set(creditStage, loan.stage),
      set(loanTaken(loan.id), true),
      set(loanPayment(loan.id), payment),
    ], {})
    this.adjustMoney(amount, `Кредит: ${loan.label.replace(/^Платёж по /, '').replace(/^Платёж /, '')}`)
    this.scheduleCredits()
  }
  sellThing(id?: ThingId): void {
    if (this.moneySealed() || !this.S.mem[creditOffer]) return
    const thing = id ? THINGS.find((t) => t.id === id) : nextThing(this.S.mem)
    if (!thing || this.S.mem[sold(thing.id)]) return
    const got = this.relief(thing.amount)
    if (got === 0) return
    this.rules.applyOps([set(creditOffer, false), set(sold(thing.id), true)], {})
    delete this.S.mem[memkeys.creditOfferSum]
    this.adjustMoney(got, 'Авито')
    // продажа могла не вытащить со дна — снова предложить, с этой причиной (ход игрока, не падение — без перерыва)
    if (this.moneyLevel() === 'bottom') this.maybeCreditOffer('Продано, а остаток всё ещё критический')
  }
  /** Кнопка карточки банка: выбор пишется в мир, Алику не уходит (#287). */
  answerCard(id: number, pick: 'take' | 'sell' | 'later'): void {
    const m = this.S.msgs.find((x) => x.id === id)
    if (!m || m.kind !== 'card' || !m.offer || m.answered || this.disposed) return
    if (!this.S.mem[creditOffer] || this.moneySealed()) {
      this.replaceMsg(m, { answered: true })
    } else {
      const loan = nextLoan(Number(this.S.mem[creditStage] ?? 0))
      const thing = nextThing(this.S.mem)
      let result: string
      if (pick === 'take' && m.offer.take && loan) {
        const before = this.S.money
        this.takeCredit()
        if (!this.S.mem[loanTaken(loan.id)]) return
        result = `${loan.id === 'micro' ? 'Микрозайм' : 'Кредит'} взят: +${this.rub(this.S.money - before)}. Баланс: ${this.rub(this.S.money)}`
      } else if (pick === 'sell' && m.offer.sell && thing) {
        const before = this.S.money
        this.sellThing(thing.id)
        if (!this.S.mem[sold(thing.id)]) return
        result = `${thing.done}. +${this.rub(this.S.money - before)}. Баланс: ${this.rub(this.S.money)}`
      } else if (pick === 'later') {
        this.rules.applyOps([set(creditOffer, false), set(creditDeclined, true)], {})
        delete this.S.mem[memkeys.creditOfferSum]
        result = 'Не сейчас'
      } else return
      const cur = this.S.msgs.find((x) => x.id === id)
      if (cur?.kind === 'card') this.replaceMsg(cur, { answered: true, result })
      // уровень денег сменился — варианты отчаяния уходят сразу, не через ход
      if (!this.ui.busy) this.S.choices = this.buildChoices()
    }
    this.save()
    this.emit()
  }
  tryMomHelp(): void {
    if (this.moneySealed() || this.S.mem[momDone]) return
    const help = nextMom(this.S.mem)
    if (!help) {
      this.rules.applyOps([set(momDone, true)], {})
      this.notify('👩', 'Мама', MOM_DONE_TEXT, { event: 'mom' })
      return
    }
    const got = this.relief(help.amount)
    if (got === 0) return
    this.rules.applyOps([set(momHelp(help.id), true)], {})
    this.adjustMoney(got, 'Мама')
    const done = !nextMom(this.S.mem)
    if (done) this.rules.applyOps([set(momDone, true)], {})
    this.notify('👩', 'Мама', help.text.replace('{sum}', this.rub(got)), { event: 'mom', ...(done ? { lines: [MOM_DONE_TEXT] } : {}) })
  }
  /** Закрыть кнопки допработ в ленте (после Дня выплаты). */
  sealOpenJobs(): void {
    for (const m of this.S.msgs) if (m.kind === 'job' && !m.answered) this.replaceMsg(m, { answered: true })
    this.closeOffers()
  }

  // ---------- время ----------
  realHour(): number {
    return this.hour ?? new Date(this.clock.now()).getHours()
  }
  /** Время суток — по часам переписки (день начинается с настоящего времени), день недели — по календарю игры. */
  period(): Period {
    return periodOf(Math.floor(this.S.clock / 60), dateOf(this.S.day).getDay())
  }
  isNight = (): boolean => this.period() === 'night'
  /** Время суток игрока в минутах: новый день переписки начинается «сейчас». */
  realMinutes(): number {
    return this.realHour() * 60 + new Date(this.clock.now()).getMinutes()
  }
  realHHMM(): string {
    const d = new Date(this.clock.now())
    return `${String(this.realHour()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  tick(min: number): void {
    this.S.clock += min
    if (this.S.clock >= 23 * 60 + 50) this.nextDay(1)
  }
  nextDay(n: number): void {
    this.S.day += n
    this.rules.settle()
    this.S.clock = this.realMinutes()
    this.push({ kind: 'sep', text: fmtDate(this.S.day) })
    if (this.inPlayerTurn) this.dayMovedInTurn = true
    const t = tierOf(this.S.day)
    if (t > this.S.tier) {
      this.S.tier = t
      this.push({ kind: 'sys', text: TIERS[t - 1][1] })
      this.unlock('tier' + t)
    }
    if (this.S.day >= 365) this.unlock('year')
  }

  /** После ответа Алика и хора: всегда +1…3, если день ещё не сдвинули и нет сцены/пропажи. */
  private advanceTurnDay(): void {
    if (this.dayMovedInTurn || this.S.offlineDays > 0 || this.S.scene) return
    this.nextDay(1 + this.rnd(3))
  }

  // ---------- сообщения ----------
  push<M extends NewMsg>(m: M): Msg {
    if (this.disposed) throw new GameDisposed()
    const msg = { ...m, id: this.S.nextId++ } as Msg
    if ((msg.kind === 'text' || msg.kind === 'sys') && msg.text.includes('{')) msg.text = this.fillMoney(msg.text)
    this.quietHeader()
    this.S.msgs.push(msg)
    this.touchMsgs(this.S.msgs.length - 1)
    this.emit()
    return msg
  }
  /** Замена сообщения в ленте новым объектом — чтобы memo в UI увидел изменение. */
  private replaceMsg<T extends Msg>(m: T, patch: Partial<T>): T {
    const next = { ...m, ...patch } as T
    const i = this.S.msgs.findIndex((x) => x.id === m.id)
    if (i >= 0) this.S.msgs[i] = next
    this.touchMsgs(i >= 0 ? i : 0)
    return next
  }
  sys(text: string): Msg { return this.push({ kind: 'sys', text }) }

  alikMsg<M extends NewMsg>(m: M): Msg {
    // персонаж написал сам — он в истории (intro) и игрок его встречал (met, для переклички в День выплаты)
    if (m.kind === 'text' && m.who) { this.S.mem[memkeys.met(m.who)] = true; this.S.mem[memkeys.intro(m.who)] = true }
    this.tick(1 + this.rnd(3))
    const msg = this.noteAlik(this.push({ from: 'alik', time: fmtTime(this.S.clock), ...m } as NewMsg))
    this.audio.beep()
    this.audio.vibrate(40)
    if (this.chance(this.mooChance())) this.schedule(() => this.moo(), 300 + this.rnd(900))
    return msg
  }

  /** Что сообщение Алика записывает в мир, каким бы путём ни пришло: день речи, заявления, упоминания, «брат джан». */
  private noteAlik(msg: Msg): Msg {
    this.S.mem[memkeys.alikDay] = this.S.day
    if (msg.kind === 'text' && /брат джан/i.test(msg.text)) this.unlock('brat')
    if (msg.kind === 'text' || msg.kind === 'photo') this.noteClaims(msg.text, msg.kind === 'text' ? msg.who : undefined)
    // хор: Алик кого-то упомянул — тот, может быть, вклинится после его ответа
    if (msg.kind === 'text' && !msg.who) {
      for (const [who, re] of Object.entries(MENTION_RE)) if (re.test(msg.text)) this.pending.push({ event: 'Mentioned', target: who })
    }
    return msg
  }

  async typingFor(ms: number, label = 'печатает…'): Promise<void> {
    ms = Math.min(5000, Math.max(800, ms)) * (this.isNight() ? 1.5 : 1)
    // в блоке / «смерти» / у Карине шапка не врёт «печатает…» → «в сети» (#257)
    if (this.alikSilent()) { this.quietHeader(); this.emit(); await this.sleep(ms); return }
    const show = () => { this.ui.typing = label; this.ui.status = { text: label, cls: 'typing' }; this.emit() }
    const hide = () => { this.ui.typing = null; this.ui.status = { text: 'в сети', cls: 'online' }; this.emit() }
    show()
    if (this.chance(0.2)) {
      await this.sleep(ms * 0.6); hide(); await this.sleep(1000 + this.rnd(1200)); show()
    }
    await this.sleep(ms)
    hide()
  }

  /** Реплики Алика (или участника { w, t }). Иногда с опечаткой и исправлением. */
  async say(items: SayItem[], legend = false, who?: string): Promise<Msg[]> {
    if (this.disposed) throw new GameDisposed()
    // слова перекрывают «ответь на стикер/реакцию/фото» — иначе вариант живёт до следующего дня
    if (this.S.ctx?.type && ['reactOnly', 'sticker', 'photo', 'voice', 'transfer', 'fwd', 'short', 'readonly'].includes(this.S.ctx.type)) {
      delete this.S.ctx.type
      delete this.S.ctx.amount
      delete this.S.ctx.s
      if (!Object.keys(this.S.ctx).length) this.S.ctx = null
    }
    // ответить можно на последнее сказанное: воспоминание, реплика легенды или персонажа ставятся после своей реплики
    if (this.S.ctx) { delete this.S.ctx.memory; delete this.S.ctx.legend; delete this.S.ctx.chorus; delete this.S.ctx.wrong }
    const out: Msg[] = []
    for (const x of items) {
      let text = typeof x === 'string' ? x : x.t
      const from = typeof x === 'string' ? who : x.w
      let fix: string | null = null
      if (!from && this.typos && this.chance(this.isNight() ? 0.2 : 0.06)) {
        const t = typo(text, this.rng, this.decks)
        if (t) ({ text, fix } = t)
      }
      await this.typingFor(600 + text.length * 22)
      if (this.disposed) throw new GameDisposed()
      out.push(this.alikMsg({ kind: 'text', from: 'alik', text, legend, who: from }))
      if (fix) {
        await this.typingFor(500)
        if (this.disposed) throw new GameDisposed()
        this.alikMsg({ kind: 'text', from: 'alik', text: fix })
        this.unlock('typo')
      }
      await this.sleep(250)
    }
    return out
  }

  setStatus(text: string, cls = ''): void {
    this.ui.status = { text, cls }
    this.emit()
  }
  /** Алик не на связи: блок, «смерть», телефон у Карине, пропал. Одно место для шапки, typing, праздников (#257/#255). */
  alikSilent(): boolean {
    const m = this.S.mem
    return !!(m[memkeys.blocked] || m[memkeys.alikDead] || m[memkeys.phoneKarine] || this.S.offlineDays > 0)
  }
  /** Молчание могло начаться посреди хода (блок, «смерть»): шапка не остаётся «прочитано»/«в сети» до его конца (#308). */
  private quietHeader(): void {
    if (!this.alikSilent()) return
    const text = this.S.offlineDays > 0 ? 'был давно' : 'не в сети'
    this.ui.typing = null
    if (this.ui.status.text !== text) this.ui.status = { text, cls: '' }
  }
  restStatus(): void {
    if (this.S.offlineDays > 0) {
      this.setStatus('был давно')
      return
    }
    if (this.alikSilent()) {
      this.setStatus('не в сети')
      return
    }
    if (this.isNight()) this.setStatus(`был(а) в ${this.realHHMM()}`)
    else this.setStatus(this.chance(0.5) ? 'был недавно' : 'в сети', 'online')
  }

  /** Короткий тост поверх чата (ачивка, «Скопировано»…). Длительность — wall clock. */
  flash(text: string, ms = 2600): void {
    this.ui.toast = text
    if (this.toastWall !== null) wallClock.clearTimeout(this.toastWall)
    this.toastWall = wallClock.setTimeout(() => {
      this.toastWall = null
      this.ui.toast = null
      this.emit()
    }, ms)
    this.emit()
  }
  unlock(key: string): void {
    if (!ACH[key] || this.S.ach[key]) return
    this.S.ach[key] = this.S.day
    this.flash(`🏆 ${ACH[key][0]}`)
  }
  mood(d: number): void {
    this.S.mood = Math.max(0, Math.min(10, this.S.mood + d))
  }

  // ---------- звук ----------
  mooChance(): number {
    return (this.S.stats.sent > 50 ? 0.15 : 0.07) * (this.period() === 'friday' ? 1.5 : 1)
  }
  moo(): void {
    this.S.stats.moo++
    this.S.mem[memkeys.mooAt] = this.S.stats.sent
    if (!this.ui.busy && !this.S.scene) this.S.choices = null // появится «Это корова?»
    if (this.S.stats.moo >= 10) this.unlock('moo10')
    const m: Moo = { id: this.seq++, text: 'М' + 'у'.repeat(4 + this.rnd(8)), left: 5 + this.rnd(45), top: 15 + this.rnd(60) }
    this.ui.moos.push(m)
    this.schedule(() => { this.ui.moos = this.ui.moos.filter((x) => x !== m); this.emit() }, 3100)
    this.audio.moo()
    this.emit()
  }
  playVoice(m: Msg): void {
    if (m.kind !== 'voice') return
    const pick = (a: readonly string[]) => this.draw('VOICE_PICK', a)
    if (m.feast) this.audio.feast(pick)
    else if (this.chance(0.5)) this.audio.alikVoice(pick)
    else this.moo()
  }
  toggleMute(): void {
    this.S.muted = !this.S.muted
    this.audio.setMuted(this.S.muted)
    this.save()
    this.emit()
  }
  /** Касание разрешает браузеру воспроизводить звуки игры. */
  gesture(): void {
    this.audio.unlock()
  }

  // ---------- уведомления, батарея ----------
  /** Ключ банковского SMS: событие без баланса; суммы различают события (#265). */
  private bankSmsKey(text: string): string {
    return text.replace(/\s*Баланс:\s*[\d\s\u00a0]*₽\.?/gi, '').trim()
  }
  /** Баннер сверху — только батарея и непрочитанные; остальное телефона — карточка в ленте, без нажатий (#287). */
  static isBanner(app: string): boolean { return app === 'Система' || app === 'Алик Воздухонесян' }
  /** false — отброшено дедупом; true — показано, в очереди или карточкой в ленте. */
  notify(icon: string, app: string, text: string, card: Partial<Card> & { event: PhoneEvent }): boolean {
    if (this.disposed) return false
    // после выплаты банк/МФО молчат везде, не только в очереди сцены (#323/#366)
    if ((app === 'Банк' || app === 'МФО') && this.moneySealed()) return false
    // банк: одно и то же событие (не баланс) — один раз за игровой день (#251/#265)
    if (app === 'Банк' || app === 'МФО') {
      if (!this.bankSmsDay || this.bankSmsDay.day !== this.S.day) this.bankSmsDay = { day: this.S.day, keys: new Set() }
      const key = this.bankSmsKey(text)
      if (this.bankSmsDay.keys.has(key)) return false
      this.bankSmsDay.keys.add(key)
    }
    // событие денег не перебивает сцену — карточки после её конца (#300)
    if (!Game.isBanner(app) && this.S.scene) {
      this.S.pendingCards.push({ icon, app, text, ...card })
      return true
    }
    if (!Game.isBanner(app)) {
      this.push({ kind: 'card', time: fmtTime(this.S.clock), icon, app, text, ...card })
      this.audio.vibrate(30)
      return true
    }
    const n: Notif = { id: this.seq++, icon, app, text }
    if (!this.ui.notif) { this.showNotif(n); return true }
    // предел ожидания 4,2 с × очередь: лишнее уходит самое старое
    const q = this.notifQueue
    q.push(n)
    while (q.length > Game.NOTIF_QUEUE_MAX) q.shift()
    return true
  }
  static readonly NOTIF_QUEUE_MAX = 4
  private showNotif(n: Notif): void {
    this.ui.notif = n
    if (this.notifWall !== null) wallClock.clearTimeout(this.notifWall)
    this.notifWall = wallClock.setTimeout(() => {
      this.notifWall = null
      this.ui.notif = null
      const next = this.notifQueue.shift()
      if (next) this.showNotif(next)
      else this.emit()
    }, 4200)
    this.audio.vibrate(30)
    this.emit()
  }
  dismissNotif(): void {
    if (this.notifWall !== null) { wallClock.clearTimeout(this.notifWall); this.notifWall = null }
    this.ui.notif = null
    const next = this.notifQueue.shift()
    if (next) this.showNotif(next)
    else this.emit()
  }
  randomNotif(): void {
    // remember после notify: плейтест судит when до факта строки (#339)
    const p = this.lines.pick('NOTIF', L.NOTIF, this.lineFacts())
    if (!p) return
    this.lines.mark(p.id)
    this.seen.mark(p.text)
    const n = p.spec as L.Notif
    if (n.spend) {
      if (!this.moneySealed()) { // после выплаты мелочь не шумит «недостаточно» (#252)
        const spend = 90 + this.rnd(40) * 10
        const why = this.draw('SPEND', L.SPEND)
        // отказ не молчит (#185), но мелочь — строка сводки, а не карточка (#287)
        if (!this.adjustMoney(-spend, why, { group: 'По мелочи' })) this.bankLine('По мелочи', -spend, true)
      }
    } else {
      this.notify(n.icon, n.app, p.text, { event: 'life' })
    }
    if (p.spec.remember) this.rules.applyOps(p.spec.remember, {})
  }
  // ---------- телефон: что Game делает по событиям Battery ----------
  private onPhoneDead(): void {
    this.clearSchedule(this.idleT)
    this.clearSchedule(this.statusT)
    this.unlock('dead')
    this.save()
    this.emit()
  }
  private async onPhoneCharged(): Promise<void> {
    this.ui.busy = false
    await this.awayBurst(2 + this.rnd(3), 1 + this.rnd(2), 'Пока телефон заряжался')
    this.armIdle()
    this.armStatus()
  }

  // ---------- факты для правил ----------
  availableArcs(): string[] {
    // when проверяем по mem+day, не через facts(): там arcAvailable → availableArcs
    const slim = { ...this.S.mem, day: this.S.day }
    return Object.keys(ARCS).filter((id) => {
      const a = ARCS[id]
      const st = this.S.arcs[id]
      if (st) return st.i < a.eps.length && this.S.day - st.last >= 3
      if (this.S.day < (a.minDay ?? 0)) return false
      if (a.when?.length && !a.when.every((c) => test(c, slim))) return false
      return true
    })
  }
  unfinishedArc(): string | undefined {
    return Object.keys(this.S.arcs).find((id) => this.arcCanAdvance(id, true))
  }
  /** Квест можно запустить из разговора: ещё не брали и условия слота выполнены. Без побочных эффектов. */
  questAllowed(id: string): boolean {
    if (this.S.rules.once['Quest_' + id]) return false
    const facts = resolver(this.rules.hub, { event: 'line' }, this.facts())
    return (QUEST_WHEN[id] ?? []).every((c) => test(c, facts))
  }
  /**
   * Отметить квест взятым тем же once, что у правила `Quest_*` (commit движка).
   * Звать после успешного enterNode — срыв до отметки оставляет квест доступным.
   */
  takeQuest(id: string): void {
    const r = this.rules.all.find((x) => x.name === 'Quest_' + id && x.event === 'PickQuest')
    if (!r?.once) throw new Error(`takeQuest: no once PickQuest rule Quest_${id}`)
    this.rules.commit(r, { event: 'PickQuest' })
  }
  /** Вопрос «Как там…?» к чему-то приведёт: сериал не закончен и сегодня по вопросу ещё не показывали серию. */
  arcCanAdvance(id: string, asked = false): boolean {
    const st = this.S.arcs[id]
    // серия в тот же день, что предыдущая, — каша («Свадьба. Третий день» и тут же «Десятый день»):
    // по вопросу игрока — назавтра, сама — через три дня
    return !!st && st.i < ARCS[id].eps.length && this.S.day - st.last >= (asked ? 1 : 3)
  }
  latePromises(): PromiseRec[] {
    return this.S.promises.filter((p) => isLate(p, this.S.day))
  }
  lateCount(): number {
    return this.latePromises().length
  }
  /** Амнистия: просроченные записи помечаются днём амнистии; число — в переменные сцены для системной строки. */
  amnesty(): number {
    const late = this.latePromises()
    for (const p of late) p.amnesty = this.S.day
    if (this.S.scene) this.S.scene.vars.amnestied = late.length
    return late.length
  }

  facts = (extra: Facts = {}): Facts => {
    const S = this.S
    const c = S.ctx ?? {}
    const pr = extra.promise !== undefined ? S.promises[Number(extra.promise)] : undefined
    const date = dateOf(S.day)
    // прогресс сериалов (arc.grandpa = номер серии), ачивки и трофеи — условия для финалов и концовок.
    // Циклом, а не fromEntries со spread: facts() зовётся на каждую выборку реплики
    const progress: Facts = {}
    for (const id in S.arcs) progress['arc.' + id] = S.arcs[id].i
    for (const k in S.ach) progress['ach.' + k] = true
    for (const k in S.ach) progress['since.' + k] = S.day - S.ach[k]
    const moneyLv = this.moneyLevel()
    const whenDays = c.whenAt === undefined ? undefined : Math.max(0, c.whenAt - S.day)
    return {
      day: S.day, tier: S.tier, mood: S.mood, sent: S.stats.sent, moo: S.stats.moo, patience: S.patience, money: S.money, debt: S.debt, fifty: S.stats.fifty, paid: S.stats.paid,
      moneyNormal: moneyLv === 'normal', moneyLow: moneyLv === 'low', moneyBottom: moneyLv === 'bottom',
      // завтра списывают: только если банк уже предупредил (bill.due после BillWarn с SMS, #251)
      paymentDueTomorrow: (() => {
        const tom = S.day + 1
        for (const b of BILLS) {
          if (Number(S.mem[billDueAt(b.id)]) === tom && S.mem[billDue(b.id)]) return true
        }
        return false
      })(),
      dow: date.getDay(), month: date.getMonth() + 1, dom: date.getDate(),
      holiday: holidayOf(S.day) ?? false,
      ...progress,
      items: S.items.length,
      latestItem: S.items.at(-1),
      legend: this.legend(),
      'ctx.topic': this.topicOfLast(),
      // «Мууу» прозвучало после последнего сообщения игрока — только тогда про корову и спрашивают
      mooFresh: S.mem[memkeys.mooAt] === S.stats.sent,
      sinceRude: S.stats.sent - Number(S.mem[memkeys.rudeAt] ?? -99),
      // сколько раз игрок извинялся за последние 6 ходов («крик → мир → крик → мир»)
      sorrySwing: String(S.mem[memkeys.sorryAt] ?? '').split(',').filter((n) => n && S.stats.sent - Number(n) <= 6).length,
      // температура ссоры не уходит ниже нуля (после примирения ещё тикают отложенные «остывания»)
      [memkeys.HEAT]: Math.max(0, Number(S.mem[memkeys.HEAT] ?? 0)),
      'has.boris': S.items.some((n) => /Борис/.test(n)),
      'has.niva': S.items.some((n) => /Нива/.test(n)),
      // Календарное обещание живо в день срока; событийное — в ход, когда его факт стал истиной.
      promiseLive: !!pr && (pr.condition ? pr.met === S.day : pr.due === S.day),
      // срок вышел: advanceTurnDay идёт раньше события срока и может перескочить день срока
      promisePassed: !!pr && (pr.condition ? pr.met !== undefined : pr.due != null && pr.due <= S.day),
      promiseStake: pr?.stake ?? false,
      period: this.period(), night: this.isNight(), offline: S.offlineDays > 0, scene: S.scene?.id,
      sinceAlik: S.day - Number(S.mem[memkeys.alikDay] ?? S.day),
      lateCount: this.lateCount(),
      somedayCount: S.promises.filter((p) => p.due == null && !p.condition).length,
      // сама — не больше одной серии в день: три легенды денег за день — уже не сюжет, а шум
      arcAvailable: this.availableArcs().length > 0 && !Object.values(S.arcs).some((a) => a.last === S.day),
      // начатая линия коллекторов идёт своим битом, но той же нормой: не больше серии в день (#324)
      collectorsCanAdvance: this.arcCanAdvance('collectors') && !Object.values(S.arcs).some((a) => a.last === S.day),
      arcsStarted: Object.keys(S.arcs).length,
      arcsDone: Object.entries(S.arcs).filter(([id, a]) => !ARCS[id].mechanic && a.i >= ARCS[id].eps.length).length,
      quests: Object.keys(S.ach).filter((k) => k.startsWith('q_')).length,
      callbackReady: !!this.callbackCandidate(),
      arcUnfinished: this.unfinishedArc(),
      deathCanAdvance: !!S.mem[memkeys.alikDead] && this.arcCanAdvance('alik_death', true),
      'ctx.type': c.type, 'ctx.amount': c.amount, 'ctx.s': c.s, 'ctx.shortTimey': c.s ? TIMEY.test(c.s) : false,
      'ctx.when': c.when, 'ctx.whenNever': c.whenNever,
      // срок ещё впереди (или «когда-нибудь»): иначе «Запомнил: завтра» звучит уже после завтра.
      // нет дат — нельзя: потеря whenMade/whenDue не должна тихо разрешать кнопку
      'ctx.whenFresh': (() => {
        if (!c.when) return false
        if (c.whenNever) return true
        if (c.whenDue != null) return c.whenDue >= S.day
        if (c.whenMade != null) return c.whenMade >= S.day
        return false
      })(),
      // дата в кнопке — срок, и только у ясного срока и увёртки; у остальных родов даты нет
      'ctx.whenDate': c.whenAt !== undefined && (c.whenKind === 'clear' || c.whenKind === 'dodge') ? fmtDayMonth(c.whenAt) : undefined,
      'ctx.whenKind': c.whenKind, 'ctx.whenDays': whenDays,
      'ctx.whenHorizon': whenDays === undefined ? undefined : whenDays <= 7 ? 'near' : whenDays <= 30 ? 'far' : 'veryFar',
      'ctx.rel': c.rel?.n, 'ctx.relYou': c.rel?.you ?? c.rel?.n, 'ctx.sad': c.sad, 'ctx.festive': c.festive, 'ctx.revived': c.revived,
      'ctx.constr': c.constr, 'ctx.legendary': c.legendary, 'ctx.arc': c.arc, 'ctx.quote': c.quote,
      // спросить про сериал есть смысл: будет новая серия, или сериал закончен и сегодня про финал ещё не спрашивали
      'ctx.arcCanAdvance': c.arc ? this.arcCanAdvance(c.arc, true) || (S.arcs[c.arc]?.i >= ARCS[c.arc].eps.length && S.mem[memkeys.doneAsked(c.arc)] !== S.day) : false,
      'arc.done': c.arc ? this.S.arcs[c.arc]?.i >= ARCS[c.arc].eps.length : false,
      'ctx.legend': c.legend, 'ctx.chorus': c.chorus, 'ctx.memory': c.memory,
      'ctx.group': c.group, 'ctx.wrong': c.wrong, 'ctx.deleted': c.deleted, 'ctx.offended': c.offended,
      // слоты события: всегда в снимке (сверка EVENT_KEYS без ручной подстановки в тестах)
      intent: extra.intent ?? false,
      tone: extra.tone ?? false,
      arg: extra.arg ?? false,
      category: extra.category ?? false,
      arc: extra.arc ?? false,
      argArcDone: extra.argArcDone ?? false,
      greet: extra.greet ?? false,
      promise: extra.promise ?? false,
      ...extra,
    }
  }
  /** Реплики, за тему которых игрок может зацепиться (отмазка, серия, ответ по теме) — не реакции на крик и извинения. */
  markTopical(msgs: Msg[]): void {
    for (const m of msgs) if (m.kind === 'text') m.topical = true
  }
  /** Тема последней реплики самого Алика (после сообщения игрока): бетон, «Нива», свадьба… */
  topicOfLast(): string | undefined {
    for (let i = this.S.msgs.length - 1; i >= 0; i--) {
      const m = this.S.msgs[i]
      if (m.kind !== 'text') continue
      if (m.from === 'me') return undefined
      if (m.who || m.deleted || !m.topical) continue
      // клятвы и сроки («Клянусь лавашом», «как бетон застынет») — не тема разговора
      if ((D.OATH as Entry<string>[]).some((o) => m.text.startsWith(valueOf(o)))) continue
      let text = m.text
      // срок в сообщении — не тема: «После обеда…» иначе цепляет еду; регистр и точка в конце не мешают
      for (const p of this.S.promises) text = text.replace(literalRe(p.t), '')
      text = text.replace(/^[.\s,;:!?…—–-]+|[.\s,;:!?…—–-]+$/g, '').trim()
      if (!text) continue
      const hit = Object.entries(TOPICS).find(([k, t]) => t.re.test(text) && !this.topicMuted(k))
      if (hit) { this.topicText = text; return hit[0] }
    }
    return undefined
  }
  /** Текст, из которого взята тема: конкретный вопрос («Какой ещё ковчег?») — только если в нём есть ковчег. */
  topicText = ''
  /** Тема заглушена: Алик сказал «больше не скажу», или игрок уже дважды подряд спрашивал про это. */
  topicMuted(k: string): boolean {
    const m = this.S.mem
    return this.S.day < Number(m['topicMute.' + k] ?? -1) || (m.topicLast === k && Number(m.topicRun ?? 0) >= 2)
  }
  saysFacts(o: Choice): Facts {
    const f: Facts = { intent: o.act, arg: o.arg, category: o.category, tone: o.tone, greet: !!o.text && !o.text.includes('?') }
    if (o.act === 'arc' && typeof o.arg === 'string' && ARCS[o.arg]) f.argArcDone = (this.S.arcs[o.arg]?.i ?? 0) >= ARCS[o.arg].eps.length
    return f
  }
  /** Порог приоритета речи: пока идёт сцена, фоновая болтовня Алика отклоняется. */
  floor(): Priority {
    return this.S.scene ? 'cinematic' : 'idle'
  }
  /** Событие на будущий день: имя — из того же union, иначе опечатка молчит — событие просто не наступит. */
  scheduleEvent(at: number, event: GameEvent, facts?: Facts): void {
    this.rules.schedule({ at, kind: 'event', event, facts })
  }
  fire(event: GameEvent, extra: Facts = {}, q: Omit<Query, 'event' | 'facts'> = {}): Promise<Rule<Game> | null> {
    return this.rules.fire(this, { event, facts: extra, ...q }, this.facts, { floor: this.floor() })
      .catch((e) => { this.swallowDisposed(e); return null })
  }
  /** События, отложенные до «безопасной точки» (после ответа Алика): хор, наступившие обещания. */
  private pending: (Query & { event: GameEvent })[] = []
  /** Хор из упоминаний — не больше одного персонажа; тот же игровой день, что ответ Алика. */
  private async flushChorus(): Promise<void> {
    const queue = this.pending.splice(0)
    for (const q of queue) if (await this.rules.fire(this, q, this.facts, { floor: this.floor() })) break
  }
  private async fulfillConditionalPromise(): Promise<void> {
    const promise = !this.S.mem[memkeys.alikDead] && !this.S.mem[memkeys.blocked]
      ? this.S.promises.findIndex((p) => p.condition && p.met === undefined && this.conditionHolds(p.condition))
      : -1
    if (promise < 0) return
    const record = this.S.promises[promise]
    for (const candidate of this.S.promises) {
      if (candidate.condition === record.condition && candidate.met === undefined) candidate.met = this.S.day
    }
    const legend = this.legend()
    if (legend && LEGENDS[legend]?.until.condition === record.condition) {
      const arc = this.S.mem[memkeys.legendArc]
      this.setLegend(null, typeof arc === 'string' ? arc : undefined)
    }
    await this.fire('PromiseConditionMet', { promise })
  }
  /** Ставка со сроком позади, которую событие срока не сыграло (сцена, смерть, блок, выплата глотают событие: оно одноразовое), играет на ближайшем свободном ходе (#327). */
  private async settleStake(): Promise<void> {
    const S = this.S
    if (this.alikSilent() || S.mem[memkeys.alikShaved] || S.mem[memkeys.endgame.active]) return
    const i = S.promises.findIndex((p) => p.stake && !p.stakeDone && !p.kept && p.amnesty === undefined
      && (p.condition ? p.met !== undefined : p.due != null && p.due <= S.day))
    if (i >= 0) await this.fire(S.promises[i].condition ? 'PromiseConditionMet' : 'PromiseDue', { promise: i })
  }
  async afterTurn(): Promise<void> {
    try {
      await this.rules.runDue(this, this.facts, { floor: this.floor() })
      this.flushBankWeek()
      await this.fulfillConditionalPromise()
      await this.settleStake()
      await this.flushChorus()
    } catch (e) { this.swallowDisposed(e) }
  }

  // ---------- варианты игрока ----------
  buildChoices(): Choice[] {
    const S = this.S
    // «займи 50»: кнопки — факт сцены (asked без answer), а не разовая запись в S.choices (#219)
    if (S.mem[memkeys.endgame.active]) {
      // Ни обычные действия группы, ни ответы на просьбу не появляются раньше её системной пометки (#358).
      if (!S.mem[memkeys.endgame.intro] || !S.mem[memkeys.lend50.asked]) return []
      if (S.mem[memkeys.lend50.asked] && !S.mem[memkeys.lend50.answer]) return LEND50_CHOICES.map((c) => ({ ...c }))
      return ENDGAME_CHOICES.map((c) => ({ ...c }))
    }
    if (S.scene) {
      const n = this.scenes[S.scene.id].nodes[S.scene.node]
      // поймать на лжи можно и посреди сцены — это её прерывает
      const catchLie = this.rules.collect({ event: 'BuildChoices' }, this.facts()).find((r) => r.name === 'Opt_CatchLie')
      const lie = catchLie?.offer?.(this.rules.ctx(this, catchLie, { event: 'BuildChoices' }, this.facts()))
      const lieOpt = lie ? [lie] : []
      return [...lieOpt, ...(n.opts ?? []).map((o, i) => {
        const gen = (): string => this.fillMoney(typeof o.t === 'function' ? o.t(S.scene!.vars) : Array.isArray(o.t) ? this.draw<string>(`${S.scene!.id}.${S.scene!.node}.o${i}`, o.t) : o.t)
        const t = gen().length > 8 ? this.playerLine(gen) : gen()
        return { text: t, tone: o.tone ?? 'polite', scene: S.scene!.id, go: o.go } as Choice
      })]
    }
    // контекстные варианты — правила события BuildChoices (самые специфичные первыми)
    const facts = this.facts()
    const out: Choice[] = []
    for (const r of this.rules.collect({ event: 'BuildChoices' }, facts)) {
      if (out.length >= 2) break
      const c = r.offer?.(this.rules.ctx(this, r, { event: 'BuildChoices' }, facts))
      if (c) out.push(c)
    }
    const P2 = (a: string, b: string) => this.playerLine(() => `${this.draw(a, D[a])} ${this.draw(b, D[b])}`)
    const one = (key: string, arr: readonly Entry<string>[]) => this.playerLine(() => this.draw(key, arr))
    // общие реплики зависят от стадии: вежливый режим Алика, блок, поздние дни, деньги на карте
    const lv = this.moneyLevel()
    const level = lv === 'normal' ? null : lv
    const money = level && P_MONEY[level]
    if (S.mem[memkeys.polite] && this.chance(0.6)) out.push({ text: one('P_POL_POLITE', P_POL_POLITE), tone: 'polite' })
    else {
      // бедность — своими словами: пул уровня без повторов, исчерпанный звучит редко (#184)
      const poor = money && this.chance(level === 'bottom' ? 0.7 : 0.4) ? this.poorLine(`P_MONEY_${level}_POL`, money.polite) : null
      out.push({ text: poor ?? P2('P_POL_A', 'P_POL_B'), tone: 'polite' })
    }
    if (out.length < 3) {
      const period = this.period()
      // отчаяние — своё намерение, чаще на дне; вежливый вариант выше остаётся при любом уровне
      const cry = money && level && this.chance(level === 'bottom' ? 0.6 : 0.3) ? this.poorLine(`P_DESPERATE_${level}`, P_DESPERATE[level]) : null
      const poor = !cry && money && this.chance(0.5) ? this.poorLine(`P_MONEY_${level}_NEU`, money.neutral) : null
      if (cry) out.push({ text: cry, tone: 'neutral', act: 'desperate' })
      else if (poor) out.push({ text: poor, tone: 'neutral' })
      else {
      // нейтральная реплика знает время: ночь, вечер пятницы, поздние дни ожидания
      const tail = period === 'night' && this.chance(0.5) ? this.freshPlayer('P_NIGHT', P_NIGHT)
        : period === 'friday' && this.chance(0.5) ? this.freshPlayer('P_FRIDAY', P_FRIDAY)
        : S.day >= 300 && this.chance(0.4) ? this.freshPlayer('P_NEU_B_LATE', P_NEU_B_LATE) : null
      out.push({ text: tail ? `${this.draw('P_NEU_A', D.P_NEU_A)} ${tail}` : P2('P_NEU_A', 'P_NEU_B'), tone: 'neutral' })
      }
    }
    if (S.mem[memkeys.blocked]) out.push({ text: one('P_RUDE_BLOCKED', P_RUDE_BLOCKED), tone: 'rude' })
    else if (S.mem[memkeys.polite]) out.push({ text: one('P_RUDE_POLITE', P_RUDE_POLITE), tone: 'rude' })
    else {
      const topic = facts['ctx.topic'] && this.chance(0.6) ? this.freshPlayer('PR_' + facts['ctx.topic'], TOPICS[String(facts['ctx.topic'])].r.filter((_, i) => TOPICS[String(facts['ctx.topic'])].rneed?.[i]?.test(this.topicText) ?? true)) : null
      out.push({ text: topic ?? P2('P_RUDE_A', 'P_RUDE_B'), tone: 'rude' })
    }
    return out.slice(0, 6).map((c) => (c.text.includes('{') ? { ...c, text: this.fillMoney(c.text) } : c))
  }
  get choices(): Choice[] {
    return (this.S.choices ??= this.buildChoices())
  }

  classifyInput(text: string): ClassifiedInput { return classifyUserInput(text) }
  /** Совместимый шорткат для тестов и отладки из консоли. */
  classify(text: string): Tone { return this.classifyInput(text).tone }

  /** Какой отклик дать на это сообщение (категорию игроку не показываем). */
  feelFor(o: Choice): SendFeel | null {
    const cat: InputCategory = o.category ?? this.classifyInput(o.text).category
    if (o.act === 'moo' || cat === 'cow') return 'moo'
    if (o.act === 'sorry' || cat === 'apology') return 'sorry'
    if (cat === 'intimidation' || cat === 'violent-threat') return 'intimidate'
    if (o.tone === 'rude' || o.tone === 'threat' || cat === 'rude') return 'shake'
    return null
  }

  private triggerFeel(o: Choice): void {
    const feel = this.feelFor(o)
    if (!feel) return
    this.ui.feel = feel
    this.ui.feelId++
    if (feel === 'shake') this.audio.vibrate([80, 40, 80])
    else if (feel === 'intimidate') this.audio.vibrate([120, 50, 120, 50, 200])
    this.emit()
  }

  // ---------- ход игрока ----------
  async send(opt: Choice | string): Promise<void> {
    try {
      await this.sendTurn(opt)
    } catch (e) { this.recoverTurn(e) }
  }

  private async sendTurn(opt: Choice | string): Promise<void> {
    const parsed = typeof opt === 'string' ? this.classifyInput(opt) : null
    const o: Choice = parsed
      ? { text: opt as string, tone: parsed.tone, category: parsed.category, act: parsed.intent }
      : opt as Choice
    if (this.ui.busy || this.battery.dead || this.disposed || !o.text.trim()) return
    const S = this.S
    this.ui.busy = true
    this.inPlayerTurn = true
    this.dayMovedInTurn = false
    this.clearSchedule(this.idleT)
    this.idleCount = 0
    this.clearUnread()
    if (o.act !== 'catchLie') this.forgetLie() // не поймал сразу — момент упущен
    let tone = o.tone
    // Готовая кнопка может быть помечена как rude, но текст с судом всё равно двигает ветку угроз.
    if (tone === 'rude' && !o.scene && this.classifyInput(o.text).category === 'threat') tone = 'threat'
    // ответ ищет ту же инстанцию, которую назвал игрок
    if (tone === 'threat' && !o.scene) S.mem[memkeys.threatClaim] = legalClaim(o.text)
    this.tick(1 + this.rnd(5))
    const mine = this.push({ kind: 'text', from: 'me', text: o.text, time: fmtTime(S.clock) })
    this.seen.mark(o.text)
    S.stats.sent++
    this.unlock('first')
    if (this.isNight()) this.unlock('nightowl')
    if (tone === 'polite') { if (++S.politeStreak >= 10) this.unlock('saint') } else S.politeStreak = 0
    if ((tone === 'rude' || tone === 'threat') && !o.scene) this.unlock(tone)
    if (tone === 'cow') this.unlock('cow')
    if (!o.scene) this.triggerFeel(o)
    if (o.act !== 'topic') S.mem[memkeys.topicRun] = 0 // серия вопросов по одной теме прервалась
    if (o.act === 'sorry') S.mem[memkeys.sorryAt] = [...String(S.mem[memkeys.sorryAt] ?? '').split(',').filter(Boolean), S.stats.sent].slice(-4).join(',') // для «качелей»
    if (tone === 'rude') S.mem[memkeys.rudeAt] = S.stats.sent
    S.choices = null
    this.poorShown.clear() // повтор бедности режет внутри сборки, не между ходами
    this.battery.drain(1)
    this.save()
    if (this.disposed) { this.inPlayerTurn = false; return }
    if (this.battery.dead) {
      this.sys('Не доставлено: у вас сел телефон.')
      S.ctx = null
      this.save()
      this.inPlayerTurn = false
      return
    }

    try {
      const startedOffline = this.S.offlineDays > 0
      await this.sleep((500 + this.rnd(700)) * (this.isNight() ? 2 : 1))
      if (this.disposed) return
      // в молчании «прочитано» — ложь: сообщение не доставлено (#257)
      if (this.S.offlineDays > 0) this.setStatus('был давно')
      else if (this.alikSilent()) this.setStatus('не в сети')
      else this.setStatus('прочитано')

      // реакция на сообщение игрока; иногда — вместо ответа
      let reactOnly = false
      // реакция — Алика: не бывает, когда он не видит (заблокирован) или телефон у Карине
      if (!o.scene && !this.alikSilent() && this.chance(0.18) && mine.kind === 'text') {
        await this.sleep(600)
        if (this.disposed) return
        this.replaceMsg(mine, { react: this.draw('R_' + tone, L.REACT[tone] ?? L.REACT.neutral) })
        this.audio.vibrate(20)
        this.emit()
        reactOnly = !o.act && tone !== 'rude' && tone !== 'threat' && !S.scene && this.chance(0.3)
      }

      if (reactOnly) {
        this.unlock('react')
        S.ctx = { type: 'reactOnly' }
      } else if (o.scene) {
        await this.enterNode(o.scene, o.go ?? null)
      } else if (o.act) {
        this.clearScene() // контекстная реплика посреди сцены (например, «Поймать на лжи») прерывает её
        await this.fire('PlayerSays', this.saysFacts(o))
      } else if (S.scene) {
        this.clearScene() // свой текст посреди сцены — сцена прерывается
        await this.alikTurn(tone, o.category)
      } else {
        await this.alikTurn(tone, o.category)
      }
      if (this.disposed) return

      await this.fulfillConditionalPromise()
      // хор ещё в том же дне → смена даты → утром наступившие обещания и сюжет
      await this.flushChorus()
      if (this.disposed) return
      this.advanceTurnDay()
      await this.rules.runDue(this, this.facts, { floor: this.floor() })
      await this.settleStake()
      this.flushBankWeek()
      if (this.disposed) return
      // сюжетный ход: только вне сцены, если Алик не «пропал» и в этом ходу ещё не было сцены или серии
      if (!S.scene && !o.scene && !S.offlineDays && !this.battery.dead && this.arcAt !== S.stats.sent) await this.fire('StoryBeat')
      await this.fire('CheckEnding')
      if (this.disposed) return

      S.patience = Math.max(0, S.patience - 1)
      if (S.patience === 0) {
        await this.sleep(600)
        if (this.disposed) return
        // без fallback: он проходит через украшение реплик Алика и получает обращение («Сынок, слушай, вы полежали…»)
        const floor = this.linePicked('FLOOR', FLOOR)
        // «за деньги» — поступление; adjustMoney без потолка бедности (как Алик), сумма под дном (#339/#279)
        if (floor?.spec.remember?.some((o) => o.key === memkeys.bloodGiven && o.op === '=' && o.value === true)) {
          this.adjustMoney(BLOOD_PAY, 'Донорский центр')
        }
        this.sys(floor?.text ?? 'Вы полежали на полу. Терпение восстановлено.')
        S.patience = MAX_PATIENCE
        this.unlock('floor')
      }
      if (!S.ram && S.stats.sent >= 25) {
        S.ram = true
        this.rules.applyOps(meet('baran'), {})
        this.sys('Алик Воздухонесян сменил фото профиля. На фото — баран')
        this.unlock('ram')
      }
      // подпись профиля — молчание: alikSilent + эндгейм; «скрыл» только в живом блоке (#223/#257).
      // «смерть»: Карине один раз меняет статус из того же пула (#353)
      const quietStatus = this.alikSilent() || !!S.mem[memkeys.endgame.active]
      if (S.mem[memkeys.blocked] && !S.mem[memkeys.endgame.active] && !S.mem[memkeys.alikDead] && !S.mem[memkeys.phoneKarine]) {
        if (!S.mem[memkeys.statusHidden]) {
          S.mem[memkeys.statusHidden] = true
          this.sys(STATUS_HIDDEN)
        }
      } else if (!quietStatus) {
        const status = this.line('ALIK_STATUS', ALIK_STATUS)
        if (status) this.sys(`Алик Воздухонесян изменил статус: «${status}»`)
      } else if (S.mem[memkeys.alikDead] && !S.mem[memkeys.endgame.active] && !S.mem[memkeys.blocked] && !S.mem[memkeys.phoneKarine] && !S.offlineDays) {
        const status = this.line('ALIK_STATUS', ALIK_STATUS, {
          filter: (s) => (s.when ?? []).some((c) => c.key === memkeys.alikDead && (c.op === 'exist' || (c.op === '==' && c.value === true))),
        })
        if (status) this.sys(`Алик Воздухонесян изменил статус: «${status}»`)
      }
      // праздник в окне звучит хотя бы раз: отмазку вытесняют серия, сцена или легенда, а окно короткое.
      // Поздравляет сам Алик: молчит там же, где шапка (alikSilent — блок/смерть/Карине/пропал)
      if (!startedOffline) {
        const festive = this.holidayGreetLine()
        if (festive) await this.say([festive])
      }
      // Idle_Notif копит в очереди; ход посреди сцены — нет (#378)
      if (!S.scene && this.chance(0.12)) this.randomNotif()
      this.restStatus()
      this.ui.busy = false
      S.choices = this.buildChoices()
      this.save()
      this.emit()
      this.armIdle()
    } finally {
      this.inPlayerTurn = false
      this.ui.busy = false // страховка: иначе падение в середине хода запирает игру до перезагрузки
    }
  }

  /** Отмазка назвала родню по роли («у прораба Мкртича свадьба») — значит, познакомила с ним. */
  meetRel(r?: Rel): void {
    if (r?.id) this.rules.applyOps(meet(r.id), {})
  }
  recordPromise(p?: { text: string; d: number | null; due?: Due; condition?: PromiseCondition; tomorrow?: boolean; stake?: 'moustache' } | null): void {
    if (!p) return
    if (p.condition && this.conditionHolds(p.condition)) return
    if (p.tomorrow) this.rules.applyOps([set(memkeys.saidTomorrow, true)], {})
    if (p.due && 'weekday' in p.due && p.due.weekday === 5) this.rules.applyOps([set(memkeys.saidFriday, true)], {})
    const due = p.d == null ? null : this.S.day + (p.due ? dueIn(p.due, this.S.day) : p.d)
    this.S.promises.push({ t: p.text, made: this.S.day, due, condition: p.condition, stake: p.stake })
    // «сегодня» (due === day) тоже планируем — иначе d:0 молчит (#307)
    if (due !== null && due >= this.S.day) this.scheduleEvent(due, 'PromiseDue', { promise: this.S.promises.length - 1 })
    if (this.S.promises.length >= 20) this.unlock('promises20')
  }
  /** Пора снова назвать срок легенды: перерыв прошёл (#179). Серия, заведшая легенду, открывает гейт сама (setLegend). */
  private legendDue(): boolean {
    return this.S.stats.sent - Number(this.S.mem[memkeys.legendPromiseAt] ?? -99) >= LEGEND_VOW_GAP
  }
  /** `finale.<сериал>` хранит id финала, а не `true`: условие срока — «факт есть». */
  private conditionHolds(c: PromiseCondition): boolean {
    return !!this.S.mem[c]
  }
  /** Срок легенды второй раз в журнал не пишем — повтор не новость (#179); прошедший срок в днях — новость. Повтор со ставкой переносит ставку в живую запись (#327). */
  private recordPromiseOnce(p: { text: string; t?: string; d: number | null; due?: Due; condition?: PromiseCondition; tomorrow?: boolean; stake?: 'moustache' }): void {
    const day = this.S.day
    const seen = p.condition
      ? this.S.promises.find((x) => x.condition === p.condition)
      : p.t ? this.S.promises.find((x) => x.t.includes(p.t!) && (x.due == null || x.due >= day)) : undefined
    if (!seen) return this.recordPromise(p)
    const pending = seen.condition ? seen.met === undefined : seen.due != null && seen.due >= day
    if (p.stake && pending) seen.stake ??= p.stake
  }
  private alignPromise(p: Promise3, until: When): Promise3 {
    p.text = p.text.replace(p.t, until.t)
    const { t, d, due, condition, kind, est, state, holiday } = until
    // срок из легенды — не «завтра»: иначе said.tomorrow без слова «завтра»
    return Object.assign(p, { t, d, due, condition, kind, est, state, holiday, tomorrow: undefined })
  }
  /** «Клянусь мамой, завтра — всё отдам» + запись в журнал. */
  /** Обещание. Пока жива легенда денег — срок чаще вытекает из неё («как ключ выйдет»); legend = true — всегда из неё. */
  async promiseLine(prefix?: string, legend?: boolean): Promise<void> {
    const legendSpec = this.legend() ? LEGENDS[this.legend()!] : undefined
    // событие легенды уже случилось («свадьба Бориса прошла») — обещать «сразу после него» поздно
    const done = legendSpec?.until.condition ? this.conditionHolds(legendSpec.until.condition) : false
    const until = done ? undefined : legendSpec?.until
    // срок из легенды — не чаще, чем раз в LEGEND_VOW_GAP сообщений игрока: одна и та же клятва приедается (#179)
    const fromLegend = !!until && this.legendDue() && (legend || this.chance(0.4))
    if (fromLegend) this.S.mem[memkeys.legendPromiseAt] = this.S.stats.sent
    const p = this.uniq(() => {
      const q = this.X.promise()
      if (fromLegend) this.alignPromise(q, until!)
      if (prefix) return { text: `${prefix} ${low(q.text)}.`, q, stake: undefined as undefined | 'moustache' }
      // форма клятвы — из пула (одна формула в каждом втором сообщении приедается); ставка — только на срок, который может наступить
      const form = this.linePicked('OATH_FORMS', OATH_FORMS, { filter: (s) => s.id !== OATH_STAKE_MOUSTACHE || q.d != null || !!q.condition })
      const stake = form?.id === OATH_STAKE_MOUSTACHE ? 'moustache' as const : undefined
      const tpl = form?.text ?? '{o}, {p}.'
      return { text: tpl.replace('{o}', this.X.g('OATH')).replace('{P}', cap(q.text)).replace('{p}', q.text), q, stake }
    })
    if (fromLegend) this.recordPromiseOnce({ ...p.q, stake: p.stake })
    else this.recordPromise({ ...p.q, stake: p.stake })
    await this.say([p.text])
    this.S.ctx = { ...(this.S.ctx ?? {}), ...this.ctxFromPromise(p.q) }
  }
  ctxFromPromise(p?: Promise3): Ctx {
    if (!p) return {}
    const due = p.d == null ? null : this.S.day + (p.due ? dueIn(p.due, this.S.day) : p.d)
    return { when: p.t, whenNever: p.d == null, whenMade: this.S.day, whenDue: due, whenKind: p.kind, whenAt: this.horizonAt(p, due) }
  }
  /** Абсолютный день горизонта: срок по дате (у увёртки — поздняя из двух), событие — остаток идущего состояния или оценка, праздник — календарь; «никогда» и абсурд — нет. */
  private horizonAt(p: Promise3, due: number | null): number | undefined {
    const day = this.S.day
    switch (p.kind) {
      case 'clear': return due ?? undefined
      case 'dodge': return p.est === undefined ? due ?? undefined : Math.max(due ?? day, day + p.est)
      case 'event': return (p.state && this.stateEnd(p.state)) ?? (p.est === undefined ? undefined : day + p.est)
      case 'holiday': return p.holiday === undefined ? undefined : day + holidayDays(p.holiday, day)
      default: return undefined
    }
  }
  /** День, когда идущее состояние мира со сроком (свадьба, болезнь) кончится: запись `restore` в расписании правил. */
  private stateEnd(state: NonNullable<When['state']>): number | undefined {
    let end: number | undefined
    for (const x of this.S.rules.schedule) {
      if (x.kind !== 'restore' || x.at <= this.S.day) continue
      if (state.key !== undefined ? x.key !== state.key : !x.key.startsWith(state.prefix ?? '')) continue
      if (state.actor !== undefined && x.actor !== state.actor) continue
      if (end === undefined || x.at < end) end = x.at
    }
    return end
  }

  // ---------- ход Алика ----------
  async alikTurn(tone: Tone, category?: Choice['category']): Promise<void> {
    const S = this.S
    S.ctx = null
    // обычный +1…3 — в конце хода (после хора); здесь только возврат из пропажи
    if (S.offlineDays > 0) {
      this.setStatus('был давно')
      await this.sleep(1500)
      this.nextDay(S.offlineDays)
      S.offlineDays = 0
      await this.say([this.uniq(this.X.back)])
    }
    await this.fire('PlayerMessage', { tone, category })
  }

  /** Обычный ход: иногда «прочитано и молчит», иногда реплика по времени суток, потом взвешенный выбор. */
  async turnRoll(): Promise<void> {
    if (await this.fire('AlikIgnores')) return
    await this.fire('PeriodLine')
    await this.fire('AlikTurn')
    if (this.chance(0.04)) await this.deletedMsg()
  }

  goOffline(days: number): void {
    this.S.offlineDays = days
    this.setStatus('был давно')
    this.S.ctx = { offended: true }
  }

  async readOnly(): Promise<void> {
    await this.sleep(1200)
    this.sys(`Прочитано в ${fmtTime(this.S.clock)}`)
    this.unlock('night')
    this.S.ctx = { type: 'readonly' }
  }

  async excuseTurn(): Promise<void> {
    if (this.legend() && this.legendDue()) return this.promiseLine(undefined, true)
    const festive = this.holidayGreetLine()
    if (festive) { await this.say([festive]); return }
    const ex = this.uniq(() => this.X.excuse({ preferLong: this.S.politeStreak >= 3 }))
    if (ex.legendary) this.unlock('legend')
    this.meetRel(ex.r)
    this.recordPromise(ex.p)
    const msgs = await this.say(ex.texts, ex.legendary)
    this.markTopical(msgs)
    this.S.ctx = {
      ...this.ctxFromPromise(ex.p), rel: ex.r, constr: ex.constr, legendary: ex.legendary,
      sad: SAD.test(ex.ev ?? ''), revived: REVIVED.test(ex.ev ?? ''), festive: !SAD.test(ex.ev ?? '') && FESTIVE.test(ex.ev ?? ''),
    }
    if (this.chance(0.09)) await this.editLast(msgs[msgs.length - 1], ex.p)
  }

  /** Праздник один раз за окно: тот же факт, что пишет тайл хода (#328). */
  private holidayGreetLine(): string | null {
    const key = holidayGreetKey(this.S.day)
    if (!key || this.alikSilent() || this.S.mem[memkeys.holidayGreeted] === key) return null
    const festive = this.line('HOLIDAY', HOLIDAY_EXCUSES)
    if (!festive) return null
    this.S.mem[memkeys.holidayGreeted] = key
    return festive
  }

  async shortReply(): Promise<void> {
    const s = this.uniq(this.X.short)
    await this.say([s])
    this.S.patience = Math.max(0, this.S.patience - 1)
    this.S.ctx = { type: 'short', s }
  }

  async job(): Promise<void> {
    const text = this.uniq(() => this.draw<string>('JOBS', D.JOBS))
    await this.typingFor(text.length * 20)
    this.alikMsg({ kind: 'job', from: 'alik', text })
  }

  async photo(): Promise<void> {
    await this.typingFor(2500)
    this.alikMsg({ kind: 'photo', from: 'alik', text: this.uniq(() => `${this.draw('PHOTOTXT', PHOTO_A)} ${this.draw('PHOTOTX2', PHOTO_B)}`) })
    this.S.ctx = { type: 'photo' }
  }

  async voice(): Promise<void> {
    await this.typingFor(3000, 'записывает голосовое…')
    this.alikMsg({ kind: 'voice', from: 'alik', len: 10 + this.rnd(50), feast: this.period() === 'friday' || this.chance(0.25) })
    this.S.ctx = { type: 'voice' }
  }

  async transfer(): Promise<void> {
    if (this.debtSealed()) return // пузырь перевода без движения денег — ложь
    await this.typingFor(1200)
    const amount = Number(this.S.mem[memkeys.nextTransfer] ?? 50)
    delete this.S.mem[memkeys.nextTransfer]
    this.alikMsg({ kind: 'transfer', from: 'alik', text: this.draw('TRANSFER_NOTE', D.TRANSFER_NOTE), amount })
    this.S.ctx = { type: 'transfer', amount }
    if (this.adjustDebt(-amount)) {
      this.adjustMoney(amount, 'Перевод от Алика')
      this.noteAlikPay(amount)
    }
  }

  async sticker(fixed?: { e: string; c: string }): Promise<void> {
    await this.typingFor(900, 'выбирает стикер…')
    const s = fixed ?? this.draw('STICKERS', L.STICKERS)
    this.alikMsg({ kind: 'sticker', from: 'alik', e: s.e, c: s.c })
    this.unlock('sticker')
    if (!fixed) this.S.ctx = { type: 'sticker' }
  }

  /** Пересылки: базовый FWD + праздничные; отдельный ключ колоды в праздник — иначе Decks сдвигается. */
  private fwdPool(): { key: string; pool: typeof L.FWD } {
    if (this.facts().holiday) return { key: 'FWD_H', pool: [...L.FWD, ...L.FWD_HOLIDAY] }
    return { key: 'FWD', pool: L.FWD }
  }
  async forward(): Promise<void> {
    await this.typingFor(700)
    const { key, pool } = this.fwdPool()
    const f = this.seen.pickFresh(() => this.draw(key, pool), (x) => x)
    this.seen.mark(f.t)
    this.alikMsg({ kind: 'fwd', from: 'alik', f: f.f, text: f.t })
    this.unlock('fwd')
    if (this.chance(0.5)) await this.say([this.uniq(() => this.draw('FWD_NOTE', L.FWD_NOTE))])
    this.S.ctx = { type: 'fwd' }
  }

  async deletedMsg(): Promise<void> {
    await this.typingFor(700)
    const text = this.seen.pickFresh(() => this.draw('DELETED', L.DELETED), (x) => x)
    this.seen.mark(text)
    const m = this.alikMsg({ kind: 'text', from: 'alik', text })
    await this.sleep(1300)
    if (m.kind === 'text') this.replaceMsg(m, { deleted: true })
    this.unlock('deleted')
    this.S.ctx = { ...(this.S.ctx ?? {}), deleted: true }
    this.emit()
  }

  /** Правка: «переведу завтра» → «переведу завтрашней весной» */
  async editLast(m: Msg | undefined, p?: Promise3): Promise<void> {
    if (!m || m.kind !== 'text') return
    await this.sleep(1800)
    const w = this.draw('EDIT_WHEN', L.EDIT_WHEN)
    // срок может стоять в начале фразы с заглавной — ищем без учёта регистра, регистр сохраняем
    const at = p ? m.text.toLowerCase().indexOf(p.t.toLowerCase()) : -1
    let text = m.text
    if (p && at >= 0) {
      const orig = m.text.slice(at, at + p.t.length)
      const repl = orig[0] !== orig[0].toLowerCase() ? cap(w) : w
      text = m.text.slice(0, at) + repl + m.text.slice(at + p.t.length)
      const rec = this.S.promises[this.S.promises.length - 1]
      if (rec && rec.t.includes(p.t)) { rec.t = rec.t.replace(p.t, w); rec.due = null }
      this.S.ctx = { ...this.S.ctx, when: w, whenNever: true, whenKind: 'never', whenAt: undefined, whenMade: this.S.day, whenDue: null }
    } else {
      text = m.text.replace(/[.!]?$/, this.draw('EDIT_SUFFIX', L.EDIT_SUFFIX) + '.')
    }
    this.replaceMsg(m, { text, edited: true })
    this.unlock('edited')
    this.emit()
  }

  async groupChat(): Promise<void> {
    await this.sleep(600)
    this.sys('Алик добавил вас в группу «Стройка под ключ 🏗️ Семья»')
    const members = shuffle(this.rng, Object.keys(GROUP).filter((w) => this.canSpeak(w))).slice(0, 4 + this.rnd(3))
    const said: string[] = []
    for (const w of members) {
      const t = this.seen.pickFresh(() => this.draw('G_' + w, GROUP[w]), (x) => x)
      if (this.seen.has(t)) continue // у участника кончились новые фразы — в этот раз молчит
      this.seen.mark(t)
      said.push(t)
      await this.say([{ w, t }])
    }
    await this.say([this.uniq(() => this.draw('GOOPS', GROUP_OOPS))])
    this.sys('Алик удалил вас из группы')
    this.unlock('group')
    const short = said.filter((t) => t.length <= 60)
    this.S.ctx = { group: true, quote: short.length ? short[this.rnd(short.length)].replace(/[.!?…]+$/, '') : undefined }
  }

  async wrongChat(): Promise<void> {
    await this.say([this.uniq(() => `${this.draw('WTO', WRONG_TO)}, ${this.draw('WWHAT', WRONG_WHAT)}.`)])
    await this.sleep(900)
    await this.say([this.uniq(() => this.draw('WOOPS', WRONG_OOPS))])
    this.unlock('wrong')
    this.S.ctx = { wrong: true }
  }

  async periodLine(p: Period): Promise<void> {
    if (!L.PERIOD[p]) return
    await this.say([this.addrLine('PER_' + p, L.PERIOD[p])])
    if (p === 'friday' && this.chance(0.5)) this.audio.feast((a) => this.draw('FEAST', a))
  }

  // ---------- бухгалтерия лжи ----------
  /** Запомнить, что Алик «заявил»; если это противоречит сказанному раньше — дать игроку поймать его. */
  noteClaims(text: string, who?: string): void {
    const mem = this.S.mem
    const found = CLAIMS.filter((c) => c.re.test(text))
    for (const c of found) {
      // где деньги — меняется по сюжету: противоречие ловится, только если старое место звучало недавно (не «Нива» полгода назад)
      const fresh = (o: Claim) => o.group !== 'money' || this.S.day - Number(mem[memkeys.saidLast(o.key)] ?? mem[memkeys.said(o.key)]) <= 14
      const old = CLAIMS.find((o) => mem[memkeys.said(o.key)] !== undefined && conflicts(o.key, c.key) && !mem[memkeys.caughtPair(o.key, c.key)] && fresh(o))
      if (old) {
        mem[memkeys.lie.old] = old.key
        mem[memkeys.lie.new] = c.key
        // «вы же говорили» — только если прошлую версию сказал сам Алик, а не родня в семейном чате
        mem[memkeys.lie.alikOld] = mem[memkeys.byClaim(old.key)] === undefined || mem[memkeys.byClaim(old.key)] === 'alik'
        mem[memkeys.lie.kind] = old.group === 'money' ? 'money' : ({ grandpa_dead: 'grandpa', grandpa_alive: 'grandpa', customer_owes: 'customer', customer_paid: 'customer', sent: 'sent', no_money: 'sent' } as Record<string, string>)[c.key] ?? 'other'
      }
    }
    for (const c of found) {
      if (mem[memkeys.said(c.key)] === undefined) mem[memkeys.said(c.key)] = this.S.day
      mem[memkeys.saidLast(c.key)] = this.S.day
      mem[memkeys.byClaim(c.key)] = who ?? 'alik'
    }
  }
  lie(): { old: Claim; new: Claim } | null {
    const o = claimByKey(String(this.S.mem[memkeys.lie.old] ?? '')), n = claimByKey(String(this.S.mem[memkeys.lie.new] ?? ''))
    return o && n ? { old: o, new: n } : null
  }
  forgetLie(): void {
    delete this.S.mem[memkeys.lie.old]
    delete this.S.mem[memkeys.lie.new]
    delete this.S.mem[memkeys.lie.kind]
  }
  /** Алик пойман: запомнить пару, отдать реплику, счётчик растёт. */
  async caught(line: string): Promise<void> {
    const l = this.lie()
    if (l) this.S.mem[memkeys.caughtPair(l.old.key, l.new.key)] = true
    this.forgetLie()
    const n = Number(this.S.mem[memkeys.caughtCount] ?? 0)
    this.unlock('liar')
    if (n >= 3) this.unlock('liar3')
    this.mood(-1)
    await this.say([line])
    this.S.ctx = null
  }
  /** Утверждение, к которому Алик может сам вернуться: сказано 10+ дней назад, ещё не вспоминал. */
  callbackCandidate(): Claim | undefined {
    const mem = this.S.mem
    // «помнишь, я говорил» — только своё; версию из семейного чата (Гарик) себе не приписывает
    return CLAIMS.find((c) => c.updates && mem[memkeys.said(c.key)] !== undefined
      && (mem[memkeys.byClaim(c.key)] === undefined || mem[memkeys.byClaim(c.key)] === 'alik')
      && this.S.day - Number(mem[memkeys.said(c.key)]) >= 10 && !mem[memkeys.cb(c.key)])
  }
  async callback(): Promise<void> {
    const c = this.callbackCandidate()
    // продолжение истории может опираться на то, чего ещё нет в мире (Борис) — тогда в другой раз
    const upd = c && this.decks.pick('CB_' + c.key, c.updates!, this.lineFacts())
    if (!c || !upd) return this.excuseTurn()
    this.S.mem[memkeys.cb(c.key)] = this.S.day
    await this.say([this.uniq(() => `${this.X.g('ADDR')}, ${this.draw('CB_OPEN', CALLBACK_OPEN)} ${c.say}? ${upd}`)])
    this.unlock('memory')
    await this.promiseLine()
  }

  // ---------- сериалы ----------
  /** Следующая серия: чаще продолжение начатого сериала, новый — когда начатых мало (не больше трёх сразу). */
  nextArc(): string | null {
    const ids = this.availableArcs()
    const going = ids.filter((id) => this.S.arcs[id])
    const running = Object.keys(this.S.arcs).filter((id) => this.S.arcs[id].i < ARCS[id].eps.length).length
    const pool = going.length && (running >= 3 || this.chance(0.75)) ? going : ids
    return pool.length ? pool[this.rnd(pool.length)] : null
  }
  async playArc(id: string): Promise<void> {
    const st = (this.S.arcs[id] ??= { i: 0, last: -99 })
    const last = st.i === ARCS[id].eps.length - 1
    const ep = ARCS[id].eps[st.i]
    st.i++
    st.last = this.S.day
    st.byAsk = false
    this.arcAt = this.S.stats.sent
    this.S.ctx = { arc: id }
    // последнюю серию выбирают правила ArcFinale: частный финал перекрывает обычный
    if (last && (await this.fire('ArcFinale', { arc: id }))) return
    await this.playEpisode(ep, id)
  }
  async playEpisode(ep: Episode, arc?: string): Promise<void> {
    if (ep.remember) this.rules.applyOps(ep.remember, {})
    if (ep.legend !== undefined) this.setLegend(ep.legend, arc)
    // серия без своей легенды возвращает легенду своего сериала: свадьба идёт — значит, деньги «после свадьбы»; гейт клятвы возврат не открывает (#327)
    else if (arc && this.S.mem[memkeys.legendOf(arc)]) this.setLegend(String(this.S.mem[memkeys.legendOf(arc)]), arc, false)
    const m = this.open(ep.m)
    for (const x of m) this.seen.mark(typeof x === 'string' ? x : x.t)
    this.markTopical(await this.say(m))
    if (typeof ep.legend === 'string' && this.S.ctx) this.S.ctx.legend = ep.legend // новая легенда — есть что переспросить
    // серия, которая двигает долг, объявляет это в sys — объявление только о том, что случилось
    const debtFx = !!(ep.fx?.debt || ep.fx?.pay)
    // после выплаты долг запечатан: adjustDebt откажет в любой ветке — серия не двигает и календарь (#189)
    const refused = debtFx && this.debtSealed()
    let debtMoved = !!ep.fx?.debt && this.adjustDebt(ep.fx.debt)
    if (ep.fx?.pay && this.adjustDebt(-ep.fx.pay)) {
      this.adjustMoney(ep.fx.pay, 'Выплата')
      // любой перевод Алика — paid; fifty только при ровно 50 ₽ (#223/#257)
      this.noteAlikPay(ep.fx.pay)
      debtMoved = true
    }
    if (ep.item) this.S.items.push(ep.item)
    if (ep.state) this.rules.applyOps([{ key: ep.state.key, op: '=', value: true, forDays: ep.state.days, scope: ep.state.actor ? 'target' : 'world' }], { target: ep.state.actor })
    if (ep.fx?.days && !refused) this.nextDay(ep.fx.days)
    if (ep.sys && (!debtFx || debtMoved)) { await this.sleep(500); this.sys(ep.sys) }
    if (ep.fx?.ach) this.unlock(ep.fx.ach)
    if (ep.fx?.offline) this.goOffline(ep.fx.offline)
    if (ep.then === 'promise') await this.promiseLine(undefined, !!ep.legend)
  }
  /** Легенда денег — факт на доске мира: где деньги и что мешает. Живёт 30 дней или до следующей серии. */
  setLegend(id: string | null, arc?: string, opensVow = true): void {
    const m = this.S.mem
    // после Дня выплаты деньги «выплачены» — новые легенды о том, где они, спорили бы с утром выплаты
    if (id !== null && m[memkeys.payday.chain]) return
    if (id === null) {
      if (arc) delete m[memkeys.legendOf(arc)]
      if (!arc || m[memkeys.legendArc] === arc) { delete m[memkeys.legendId]; delete m[memkeys.legendArc] }
      return
    }
    const prev = m[memkeys.legendId]
    if (arc) m[memkeys.legendOf(arc)] = id
    m[memkeys.legendId] = id
    m[memkeys.legendDay] = this.S.day
    // гейт клятвы открывает только серия, которая сама заводит или меняет легенду (#246, #327)
    if (opensVow && prev !== id) m[memkeys.legendPromiseAt] = this.S.stats.sent - LEGEND_VOW_GAP
    if (arc) m[memkeys.legendArc] = arc
  }
  /** Текущая легенда (если не устарела). */
  legend(): string | undefined {
    const m = this.S.mem
    const id = m[memkeys.legendId] as string | undefined
    return id && this.S.day - Number(m[memkeys.legendDay] ?? -99) <= 30 ? id : undefined
  }
  /** Финал сериала: обычный (последний эпизод) или частный из FINALES. */
  async playFinale(id: string, f: Finale | null): Promise<void> {
    const ep = f ?? ARCS[id].eps.at(-1)!
    // финал закрывает легенду своего сериала («ключ не тот» → «мы должны всем»)
    if (ep.legend === undefined) this.setLegend(null, id)
    await this.playEpisode(ep, id)
    // реплики финала звучат в мире до него: «Нуне уволена. Из декрета» — пока она ещё в декрете
    this.S.mem[memkeys.finaleOf(id)] = f?.id ?? 'default'
    if (f) this.unlock(`fin_${id}_${f.id}`)
  }
  finaleOf(id: string): Finale | undefined {
    const fid = this.S.mem[memkeys.finaleOf(id)]
    return FINALES[id]?.find((f) => f.id === fid)
  }
  finaleTitle(id: string): string | undefined {
    if (!this.S.mem[memkeys.finaleOf(id)]) return undefined
    return this.finaleOf(id)?.title ?? DEFAULT_FINALE[id]
  }
  /** Ответы на «Как там…?» после финала — свои у каждого финала. */
  arcDoneLines(id: string): readonly Entry<string>[] {
    return this.finaleOf(id)?.done ?? ARC_DONE[id]
  }

  // ---------- лестница грубости ----------
  /** Семейный суд в групповом чате: прелюдия, потом сцена «приговор». */
  async tribunal(): Promise<void> {
    await this.sleep(600)
    this.sys('Дядя Самвел добавил вас в группу «Стройка под ключ 🏗️ Семья». Тема: «Дело №1. Плиточник против уважения»')
    for (const [w, t] of this.open(TRIBUNAL)) await this.say([{ w, t }])
    const yes = this.holds(WORLD.garik) ? '1 (Гарик)' : '1 (кто-то из родни)'
    this.sys(`Голосование «Простить плиточника?» — Да: ${yes}. Нет: ${5 + this.rnd(4)}.${this.canSpeak('boris') ? ' Бее: 1.' : ''}`)
    await this.enterNode('tribunal', 'verdict')
  }

  // ---------- концовки ----------
  async reachEnding(id: string): Promise<void> {
    const e = ENDINGS.find((x) => x.id === id)!
    await this.sleep(800)
    await this.say(this.open(e.m))
    this.S.endings[id] = this.S.day
    this.S.ending = id
    this.unlock('end_' + id)
    this.emit()
  }
  async closeEnding(): Promise<void> {
    const id = this.S.ending
    this.S.ending = null
    // вход в эндгейм: вступление, потом просьба «займи 50»; формальности — AlikAway/Idle при висящей просьбе (#321)
    if (id?.startsWith('payday_') && !this.S.mem[memkeys.endgame.active]) {
      try { await this.startEndgame(id.slice(7)) } catch (e) { this.swallowDisposed(e) }
    }
    this.save()
    this.emit()
  }

  private async startEndgame(outcome: string): Promise<void> {
    const S = this.S
    // Пока вступление и просьба — busy: иначе кнопки эндгейма и таймеры вклиниваются в цепочку.
    this.ui.busy = true
    try {
      S.mem[memkeys.endgame.active] = true
      S.mem[memkeys.endgame.started] = S.day
      S.mem[memkeys.endgame.forms] = 0
      S.mem[memkeys.endgame.exits] = 0
      S.mem[memkeys.endgame.mutes] = 0
      S.mem[memkeys.endgame.renames] = 0
      this.clearScene(true)
      S.offlineDays = 0
      S.rules.schedule = S.rules.schedule.filter((item) => item.kind !== 'event')
      S.choices = [] // до системной пометки просьбы кнопок нет
      this.save()
      this.emit()
      await this.completeEndgameOpening(outcome)
    } finally {
      if (!this.disposed) this.ui.busy = false
      this.save()
      this.emit()
    }
  }

  /**
   * Продолжить opening после перезагрузки, а затем только пустить пачку непрочитанных.
   * Незавершённая часть перед повтором удаляется, поэтому в ленте нет дублей и обрывков (#358).
   */
  private async resumeEndgameOpening(outcome: string, away: number | null): Promise<void> {
    try {
      await this.completeEndgameOpening(outcome)
    } finally {
      if (!this.disposed) this.ui.busy = false
      this.save()
      this.emit()
    }
    if (!this.disposed) await this.checkAway(away)
  }

  private async completeEndgameOpening(outcome: string): Promise<void> {
    if (!this.S.mem[memkeys.endgame.intro]) {
      this.stripIncompleteEndgameIntro()
      await this.deliverEndgameIntro(outcome)
      await this.sleep(1500)
    }
    if (!this.S.mem[memkeys.lend50.asked]) await this.deliverLend50Ask()
  }

  /** Одна точная реплика Алика: typing, сообщение, сохранение видимого шага, пауза. */
  private async endgameLine(text: string): Promise<void> {
    await this.typingFor(600 + text.length * 22)
    if (this.disposed) throw new GameDisposed()
    this.alikMsg({ kind: 'text', from: 'alik', text })
    this.save()
    await this.sleep(250)
  }

  /** Создание группы и вступление — по одному сообщению; маркер ставится только после полной цепочки. */
  private async deliverEndgameIntro(outcome: string): Promise<void> {
    const S = this.S
    this.sys(`Алик создал группу «${ENDGAME_GROUP}»`)
    this.save()
    await this.sleep(500)
    this.sys('Алик добавил вас')
    this.save()
    const intro = S.endings.vendetta ? ENDGAME_VENDETTA : ENDGAME_INTRO[outcome] ?? ENDGAME_FALLBACK
    for (const text of [...ENDGAME_OPEN, intro]) await this.endgameLine(text)
    S.mem[memkeys.endgame.intro] = true
    S.choices = []
    this.save()
  }

  /**
   * Просьба «займи 50» идёт реплика за репликой с typing; системная пометка и ссылка завершают цепочку.
   * asked ставится только после ссылки, поэтому кнопки не могут появиться у неполной просьбы (#219/#248/#358).
   * Звать только при endgame.active и !asked.
   */
  private async deliverLend50Ask(): Promise<void> {
    const S = this.S
    if (!S.mem[memkeys.endgame.active] || S.mem[memkeys.lend50.asked]) return
    this.stripIncompleteLend50()
    const again = !!this.storage?.getItem(LEND50_SEEN_KEY)
    const lines = again ? LEND50_ASK_AGAIN : LEND50_ASK
    for (const text of lines) await this.endgameLine(text)
    await this.sleep(500)
    this.sys(LEND50_SYS)
    this.save()
    await this.sleep(250)
    this.sys(LEND50_LINK)
    this.storage?.setItem(LEND50_SEEN_KEY, '1') // отметка устройства, а не партии: она только выбирает текст
    S.mem[memkeys.lend50.asked] = true
    S.choices = null // buildChoices отдаст LEND50_CHOICES
    this.save()
  }

  /** Убрать незавершённое вступление целиком: при повторе оно не дублируется и не остаётся оборванным. */
  private stripIncompleteEndgameIntro(): void {
    if (this.S.mem[memkeys.endgame.intro]) return
    const marker = `Алик создал группу «${ENDGAME_GROUP}»`
    let at = -1
    for (let i = this.S.msgs.length - 1; i >= 0; i--) {
      const m = this.S.msgs[i]
      if (m.kind === 'sys' && m.text === marker) { at = i; break }
    }
    if (at < 0) { this.stripIncompleteLend50(); return }
    this.S.msgs.splice(at)
    this.touchMsgs(at)
  }

  /** Убрать хвост просьбы без asked — перед воспроизведением с начала. */
  private stripIncompleteLend50(): void {
    if (this.S.mem[memkeys.lend50.asked]) return
    const pool = new Set<string>([...LEND50_ASK, ...LEND50_ASK_AGAIN])
    let at = -1
    for (let i = this.S.msgs.length - 1; i >= 0; i--) {
      const m = this.S.msgs[i]
      if (m.kind === 'text' && m.from === 'alik' && pool.has(m.text)) at = i
      else if (at >= 0) break
    }
    if (at < 0) return
    this.S.msgs.splice(at)
    this.touchMsgs(at)
  }

  /** Ответ на «займи 50»: реплики и ачивка — без движения денег и долга; без опечаток (#248). */
  async endgameLend50(answer: string): Promise<void> {
    const S = this.S
    S.ctx = null
    S.mem[memkeys.lend50.answer] = answer
    const typos = this.typos
    this.typos = false
    try {
      if (answer === 'yes') {
        await this.say([LEND50_YES])
        S.mem[memkeys.endgame.renames] = Number(S.mem[memkeys.endgame.renames] ?? 0) + 1
        this.sys(`Алик изменил название группы на «${LEND50_RENAME}»`)
        if (this.canSpeak('nune')) await this.say([{ w: 'nune', t: LEND50_NUNE }])
      } else if (answer === 'no') await this.say([this.draw('LEND50_NO', LEND50_NO)])
      else await this.say([LEND50_SERIOUS])
    } finally {
      this.typos = typos
    }
    this.unlock('lend50')
  }

  async endgameAction(action: 'money' | 'mute' | 'leave'): Promise<void> {
    const S = this.S
    S.ctx = null
    if (action === 'money') {
      await this.say([this.draw('ENDGAME_MONEY', ENDGAME_MONEY)])
      return
    }
    if (action === 'mute') {
      const mutes = Number(S.mem[memkeys.endgame.mutes] ?? 0) + 1
      S.mem[memkeys.endgame.mutes] = mutes
      this.sys(mutes === 1 ? 'Вы отключили уведомления' : 'Уведомления снова включены. Кем — неизвестно. Вы отключили их ещё раз')
      await this.say([this.draw('ENDGAME_MUTE', ENDGAME_MUTE)])
      const name = this.draw('ENDGAME_RENAMES', ENDGAME_RENAMES)
      S.mem[memkeys.endgame.renames] = Number(S.mem[memkeys.endgame.renames] ?? 0) + 1
      this.sys(`Алик изменил название группы на «${name}»`)
      return
    }

    S.mem[memkeys.endgame.exits] = Number(S.mem[memkeys.endgame.exits] ?? 0) + 1
    this.sys('Вы покинули группу')
    const back = this.decks.pick('ENDGAME_RETURNERS', ENDGAME_RETURNERS, this.lineFacts())
    // noRefill: реплика возвращателя звучит один раз; исчерпав свой запас, он перестаёт возвращать
    const line = back ? this.decks.tryDraw(`ENDGAME_RETURNER.${back.who}`, ENDGAME_RETURNER_LINES[back.who], true) : null
    if (back && line) {
      this.sys(`${valueOf(back.name)} ${back.she ? 'добавила' : 'добавил'} вас обратно`)
      await this.say([{ w: back.who, t: line }])
    } else {
      this.sys('Алик добавил вас обратно')
      const quip = this.decks.tryDraw('ENDGAME_ALIK_BACK', ENDGAME_ALIK_BACK, true)
      if (quip) await this.say([quip])
    }
    await this.say([this.draw('ENDGAME_LEAVE', ENDGAME_LEAVE)])
  }

  /** Очередной закрывающий акт (на круглом счёте — и юбилей); счёт актов растёт здесь. */
  formalityLines(): string[] {
    const n = Number(this.S.mem[memkeys.endgame.forms] ?? 0) + 1
    this.S.mem[memkeys.endgame.forms] = n
    const jubilee = ENDGAME_JUBILEES[n]
    const memory = this.line('LEND50_MEMORY', LEND50_MEMORY)
    return [this.draw('ENDGAME_FORMALITIES', ENDGAME_FORMALITIES), ...(memory ? [memory] : []), ...(jubilee ? [jubilee] : [])]
  }
  async endgameFormality(): Promise<void> {
    for (const text of this.formalityLines()) await this.say([text])
    this.S.ctx = null
  }

  // ---------- сцены ----------
  async startScene(): Promise<void> {
    // сцену выбирают правила PickScene (по сюжету и с перерывом); все на перерыве — обычная отмазка
    if (!(await this.fire('PickScene'))) await this.excuseTurn()
  }
  async enterNode(sid: string, nid: string | null): Promise<void> {
    const S = this.S
    if (nid === null) { this.clearScene(true); await this.say([this.uniq(this.X.short)]); return }
    if (nid.includes(':')) [sid, nid] = nid.split(':')
    const sc = this.scenes[sid]
    // новая сцена — старый контекст («что вы удалили?», «при чём тут тётя?») больше не к месту
    if (!S.scene || S.scene.id !== sid) {
      S.scene = { id: sid, node: nid, vars: sc.init ? sc.init(this.rng, (arr) => this.open(arr), S.day) : {} }
      S.ctx = null
    }
    S.scene.node = nid
    const n = sc.nodes[nid]
    const v = S.scene.vars
    const res = (x: Line) => this.fillMoney(typeof x === 'function' ? x(v) : x)
    const gen = (key: string, arr: Line | Entry<Line>[]) => () => res(Array.isArray(arr) ? this.draw(`${sid}.${nid}.${key}`, arr) : arr)
    const variant = (key: string, arr: Entry<Line>[]) => this.uniq(gen(key, arr))

    const fx = n.fx ?? {}
    const debtFx = !!(fx.debt || fx.barter || fx.invoice)
    // та же природа отказа, что и у серии: запечатанный долг — узел не двигает и календарь (#189)
    const refused = debtFx && this.debtSealed()
    if (fx.days && !refused) this.nextDay(fx.days)
    // платёж с карты идёт первым: не прошёл — узел не брал денег и не берёт их следствий (#185)
    const pays = (fx.money ?? 0) < 0
    const paid = !pays || this.adjustMoney(fx.money!, 'По карте')
    // запечатано — тишина; мало денег — «недостаточно» (#252)
    if (pays && !paid && !this.moneySealed()) {
      this.notify('🏦', 'Банк', `Не прошло: недостаточно средств. Перевод ${Math.abs(fx.money!).toLocaleString('ru-RU')} ₽ не ушёл.`, { event: 'bank.refusal' })
    }
    if (!pays && fx.money) this.adjustMoney(fx.money, 'По карте')
    let debtMoved = !!fx.debt && paid && this.adjustDebt(fx.debt)
    if (fx.mood) this.mood(fx.mood)
    if (fx.barter && this.adjustDebt(-v.v)) { S.items.push(v.n); debtMoved = true }
    const invoiced = !!fx.invoice && this.adjustDebt(-v.total)
    debtMoved ||= invoiced
    if (fx.ach && paid) this.unlock(fx.ach)
    if (fx.amnesty) this.amnesty()
    if (fx.legend !== undefined) this.setLegend(fx.legend)
    if (fx.set) this.rules.applyOps(Object.entries(fx.set).map(([key, value]) => ({ key, op: '=' as const, value })), {})
    if (fx.during) this.rules.applyOps([{ key: fx.during.key, op: '=', value: true, forDays: fx.during.days }], {})
    if (n.sys && (!debtFx || debtMoved)) { await this.sleep(700); this.sys(gen('sys', n.sys)()) }
    // перевод не прошёл или долг запечатан — Алик не объявляет счёт, которого не было (#252, #266)
    if (n.a && (!pays || paid) && (!debtFx || debtMoved)) await this.say([n.who ? gen('a', n.a)() : variant('a', n.a)], false, n.who)
    if (n.doc) {
      await this.typingFor(2000, 'отправляет документ…')
      this.alikMsg({ kind: 'doc', from: 'alik', title: `АКТ ВЗАИМОЗАЧЁТА № ${100 + this.rnd(900)}`, rows: v.rows, total: v.total })
      // позиция вычтена — во втором акте её уже не будет
      this.rules.applyOps((v.rows as Array<[string, number]>).map(([t]) => set(invKey(t), true)), {})
      await this.sleep(600)
      if (invoiced) this.sys(`Алик вычел из долга ${v.total.toLocaleString('ru-RU')} ₽ по акту.`)
    }
    if (n.a2) await this.say([n.who2 ? gen('a2', n.a2)() : variant('a2', n.a2)], false, n.who2)
    if (n.sys2) { await this.sleep(700); this.sys(gen('sys2', n.sys2)()) }
    // шаг, собранный на лету (День выплаты); если шаг перевёл сцену в другой узел — дальше управляет он
    if (n.hook) { await PAYDAY_HOOKS[n.hook]?.(this); if (S.scene?.id !== sid || S.scene?.node !== nid) return }
    if (n.then === 'moo') { await this.sleep(400); this.moo() }
    if (n.then === 'transfer') await this.transfer()
    if (n.then === 'promise') await this.promiseLine()
    if (!n.opts) this.clearScene(n.then !== 'promise')
    this.emit()
  }

  // ---------- допработа ----------
  /** Отмазки-зеркала, открытые сейчас: правдивые в этой партии и когда Алику есть чем возмутиться. */
  mirrors(): Mirror[] {
    return this.holds(MIRROR_OPEN) ? this.open(MIRROR) : []
  }
  canMirror(): boolean {
    return this.mirrors().length > 0
  }
  /** Ответ на допработу: сделать, отказать или отказать отмазкой Алика ('mirror' — из открытых на момент нажатия). */
  async answerJob(id: number, answer: boolean | 'mirror'): Promise<void> {
    try {
      const m = this.S.msgs.find((x) => x.id === id)
      if (!m || m.kind !== 'job' || m.answered || this.ui.busy || this.battery.dead || this.disposed) return
      // бросок генератора — только для зеркала: иначе обычный ответ сдвигает розыгрыш всей партии
      const open = answer === 'mirror' ? this.mirrors() : []
      const unseen = open.filter((m) => !this.seen.has(m.me))
      const pickFrom = unseen.length ? unseen : open
      const mirror = pickFrom.length ? pickFrom[this.rnd(pickFrom.length)] : undefined
      const again = !!mirror && unseen.length === 0
      if (answer === 'mirror' && !mirror) return
      this.replaceMsg(m, { answered: true })
      this.ui.busy = true
      this.clearSchedule(this.idleT)
      const yes = answer === true
      const reply = mirror ? mirror.me : this.playerLine(() => (yes ? this.draw('JY', JOB_YES_P) : this.draw('JN', JOB_NO_P)))
      this.seen.mark(reply)
      this.push({ kind: 'text', from: 'me', text: reply, time: fmtTime(this.S.clock) })
      if (mirror) {
        // зеркало — реплика, не событие: ни долга, ни календаря, ни настроения; повтор — отдельный ответ (#191)
        await this.say([this.uniq(() => {
          if (again) return this.draw('MIRROR_AGAIN', MIRROR_AGAIN)
          return this.chance(0.5) ? mirror.alik : this.draw('MIRROR_REPLY', MIRROR_REPLY)
        })])
      } else if (yes) {
        const add = 5000 + this.rnd(16) * 1000
        // после Дня выплаты работа ничего не двигает — ни долг, ни календарь
        if (!this.debtSealed()) this.nextDay(2 + this.rnd(3))
        if (this.adjustDebt(add)) {
          this.sys(`Вы сделали работу. Долг Алика вырос на ${add.toLocaleString('ru-RU')} ₽`)
          this.mood(2)
          this.unlock('fence')
          await this.say([this.uniq(this.X.jobYes)])
        } else {
          // кнопка в ленте после Дня выплаты: мир уже закрыт, долг не трогаем
          this.sys('Работа сделана. Долг уже закрыт Днём выплаты — ничего не выросло.')
          await this.say([this.uniq(this.X.jobYes)])
        }
      } else {
        this.mood(-1)
        await this.say([this.uniq(this.X.jobNo)])
      }
      this.S.ctx = null
      this.ui.busy = false
      this.S.choices = this.buildChoices()
      this.save()
      this.emit()
      this.armIdle()
    } catch (e) { this.recoverTurn(e) }
  }

  // ---------- Алик живёт сам ----------
  armIdle(): void {
    this.clearSchedule(this.idleT)
    // Алик пишет сам редко: не в начале игры, не раньше чем через 1,5–3 минуты тишины, не больше двух раз подряд
    if (this.disposed || this.noTimers || this.battery.dead || this.idleCount >= 2 || this.S.stats.sent < 5) return
    this.idleT = this.schedule(() => void this.onIdle(), (90000 + this.rnd(90000)) * (this.idleCount + 1) * 1.5 ** this.idleCount)
  }
  async onIdle(): Promise<void> {
    try {
      if (this.disposed || this.ui.busy || this.battery.dead || this.ui.sheetOpen || (typeof document !== 'undefined' && document.hidden)) return this.armIdle()
      this.idleCount++
      this.ui.busy = true
      this.battery.drain(1)
      if (!this.battery.dead) {
        await this.fire('AlikIdle')
        if (this.disposed) { this.ui.busy = false; return }
        await this.afterTurn()
        this.S.choices = this.buildChoices()
        this.save()
      }
      this.ui.busy = false
      this.emit()
      if (!this.battery.dead && !this.disposed) { this.restStatus(); this.armIdle() }
    } catch (e) { this.recoverTurn(e) }
  }
  armStatus(): void {
    this.clearSchedule(this.statusT)
    if (this.disposed || this.noTimers || this.battery.dead) return
    this.statusT = this.schedule(async () => {
      try {
        if (this.disposed) return
        if (!this.ui.busy && !this.battery.dead && this.S.offlineDays === 0) {
          if (this.alikSilent()) {
            this.setStatus('не в сети')
          } else if (this.chance(0.2)) {
            // «печатает…» — и ничего не приходит
            this.ui.typing = 'печатает…'
            this.setStatus('печатает…', 'typing')
            await this.sleep(1500 + this.rnd(2500))
            if (this.disposed) return
            this.ui.typing = null
            if (!this.ui.busy) this.setStatus('в сети', 'online')
          } else if (this.isNight()) this.setStatus(`был(а) в ${this.realHHMM()}`)
          else this.setStatus(this.draw('WANDER', STATUS_WANDER), 'online')
        }
        this.armStatus()
      } catch (e) { this.swallowDisposed(e) }
    }, 7000 + this.rnd(9000))
  }

  // ---------- возвращение после паузы ----------
  clearUnread(): void {
    this.ui.unread = 0
    this.ui.title = 'Алик, где деньги?'
  }
  /**
   * Сообщение пачки непрочитанных: пришло в момент `S.clock`, без «печатает…», часов и писка — они у пачки свои.
   * В мир записывает то же, что обычное сообщение Алика (noteAlik). Что именно пришло — решает правило AlikAway.
   * false — пул исчерпан, правило промолчало.
   */
  awayMsg(kind: AwayKind): boolean | void {
    const deliver = (m: NewMsg) => this.noteAlik(this.push({ from: 'alik', time: fmtTime(this.S.clock), ...m } as NewMsg))
    switch (kind) {
      case 'text': deliver({ kind: 'text', from: 'alik', text: this.addrLine('IDLE', L.IDLE) }); return
      case 'sticker': { const s = this.draw('STICKERS', L.STICKERS); deliver({ kind: 'sticker', from: 'alik', e: s.e, c: s.c }); return }
      case 'fwd': {
        const { key, pool } = this.fwdPool()
        const f = this.seen.pickFresh(() => this.draw(key, pool), (x) => x)
        this.seen.mark(f.t)
        deliver({ kind: 'fwd', from: 'alik', f: f.f, text: f.t })
        return
      }
      case 'deleted': deliver({ kind: 'text', from: 'alik', text: '', deleted: true }); return
      case 'voice': deliver({ kind: 'voice', from: 'alik', len: 10 + this.rnd(50) }); return
      case 'transfer':
        if (!this.adjustDebt(-50)) return // после выплаты перевода нет — и пузыря тоже
        this.adjustMoney(50, 'Перевод от Алика')
        this.noteAlikPay(50)
        deliver({ kind: 'transfer', from: 'alik', text: this.draw('TRANSFER_NOTE', D.TRANSFER_NOTE), amount: 50 })
        return
      case 'formality': for (const text of this.formalityLines()) deliver({ kind: 'text', from: 'alik', text }); return
      case 'coldWar': {
        const text = this.decks.pick('COLD_WAR', COLD_WAR, this.lineFacts(), { mode: 'sequential', noRepeat: true })
        if (!text) return false
        deliver({ kind: 'text', from: 'alik', text })
        return
      }
      case 'excuse': {
        const legend = this.legend()
        if (legend && this.legendDue()) {
          const spec = LEGENDS[legend]
          const promise = this.alignPromise(this.X.promise(), spec.until)
          this.S.mem[memkeys.legendPromiseAt] = this.S.stats.sent
          this.recordPromiseOnce(promise)
          deliver({ kind: 'text', from: 'alik', text: promise.text })
          return
        }
        const festive = this.holidayGreetLine()
        if (festive) { deliver({ kind: 'text', from: 'alik', text: festive }); return }
        const ex = this.uniq(() => this.X.excuse())
        this.meetRel(ex.r)
        this.recordPromise(ex.p)
        deliver({ kind: 'text', from: 'alik', text: ex.texts.join(' ') })
      }
    }
  }
  /** Пачка «пока тебя не было»: n событий AlikAway. Мир решает, пишет ли Алик (смерть, блок, эндгейм) — заголовок и счётчик только по тому, что пришло. */
  async awayBurst(n: number, days: number, why?: string): Promise<void> {
    this.nextDay(days)
    const at = this.S.msgs.length
    // пришли, пока игрока не было, — до «сейчас»: иначе часы переписки убегают вперёд настоящих
    const now = this.S.clock
    const times = Array.from({ length: n }, () => now - this.rnd(Math.min(now, 360) + 1)).sort((a, b) => a - b)
    for (const t of times) { this.S.clock = t; await this.fire('AlikAway') }
    this.S.clock = now
    const got = this.S.msgs.length - at
    if (got) {
      this.S.msgs.splice(at, 0, { kind: 'sys', text: `${why ? why + ' — ' : ''}непрочитанные сообщения`, unread: true, id: this.S.nextId++ })
      this.touchMsgs(at)
      this.ui.unread = got
      this.ui.title = `(${got}) Алик, где деньги?`
      this.unlock('away')
      this.notify('💬', 'Алик Воздухонесян', `${got} ${got < 5 ? 'новых сообщения' : 'новых сообщений'}`, { event: 'unread' })
      this.audio.beep()
      this.S.ctx = { type: 'idle' }
    }
    this.S.choices = this.buildChoices()
    this.save()
    this.emit()
  }
  async checkAway(awayOverride: number | null): Promise<void> {
    const gapMin = awayOverride ?? (this.S.lastSeen ? (this.clock.now() - this.S.lastSeen) / 60000 : 0)
    if (gapMin < 15 || !this.S.stats.sent) return
    if (gapMin > 120) this.battery.restore() // телефон заряжался
    await this.awayBurst(Math.min(5, 1 + Math.floor(gapMin / 30)), Math.min(10, 1 + Math.floor(gapMin / 120)))
  }
  async onVisibility(hidden: boolean): Promise<void> {
    if (hidden) { this.hiddenAt = this.clock.now(); this.save(); return }
    const gapMin = (this.clock.now() - this.hiddenAt) / 60000
    if (this.hiddenAt && gapMin >= 3 && !this.ui.busy && !this.battery.dead && this.S.stats.sent) await this.awayBurst(Math.min(4, 1 + Math.floor(gapMin / 10)), 1)
  }

  // ---------- начало ----------
  /** Начало партии: одна из завязок (что Алик обещал в день сдачи и что было потом). */
  private seed(): void {
    const st = STARTS[this.rnd(STARTS.length)]
    this.push({ kind: 'sep', text: fmtDate(0) })
    this.push({ kind: 'text', from: 'alik', time: '18:02', text: st.intro })
    this.push({ kind: 'text', from: 'me', time: '18:05', text: st.reply })
    this.sys(st.gap.replace('{d}', String(this.S.day)))
    this.push({ kind: 'sep', text: fmtDate(this.S.day) })
    this.S.clock = this.realMinutes()
    if (st.first) this.push({ kind: 'text', from: 'alik', time: fmtTime(this.S.clock), text: st.first })
    this.scheduleBills()
    this.scheduleCredits()
  }

  // для отображения
  get gameDate(): string {
    return dateOf(this.S.day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }
  get clockText(): string { return fmtTime(this.S.clock) }
  castOf(who?: string) { return who ? CAST[who] : undefined }
}
