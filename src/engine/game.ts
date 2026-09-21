// Игра: состояние, сообщения, ход Алика, «живость». Решения — что ответить, что предложить игроку,
// что сделать Алику — принимает система правил (engine/rules/, content/rules/*).
import { make, D, low, cap, type ExcuseApi, type Promise3, type PromiseCondition } from '../content/excuses'
import { makeScenes, type Scene, type Line } from '../content/scenes'
import { TRIBUNAL } from '../content/rude'
import { PAYDAY_HOOKS } from '../content/rules/payday'
import { QUEST_WHEN } from '../content/rules/world'
import { LEGENDS } from '../content/legends'
import { TOPICS, P_NEU_B_LATE, P_RUDE_BLOCKED, P_RUDE_POLITE, P_POL_POLITE, P_NIGHT, P_FRIDAY } from '../content/topics'
import { FINALES, ENDINGS, DEFAULT_FINALE, type Finale } from '../content/finales'
import { ARCS, ARC_DONE, CAST, type Episode, GROUP, GROUP_OOPS, WRONG_TO, WRONG_WHAT, WRONG_OOPS } from '../content/arcs'
import * as L from '../content/life'
import { ACH } from '../content/achievements'
import { SPEAKS, meet } from '../content/world'
import { FLOOR, PHOTO_A, PHOTO_B, JOB_YES_P, JOB_NO_P, PLAYER_PREFIX, PLAYER_SUFFIX, STATUS_WANDER, OATH_FORMS } from '../content/misc'
import { STARTS } from '../content/quests'
import { allRules } from '../content/rules'
import { CLAIMS, claimByKey, conflicts, pairKey, CALLBACK_OPEN, type Claim } from '../content/lies'
import { type Rng, mathRng, rndInt, shuffle, chance } from './rng'
import { Decks } from './deck'
import { Seen, type Keyed } from './uniq'
import {
  RuleSet, makeHub, Lines, resolver, test, isOpen, valueOf,
  type Criterion, type Entry, type Facts, type Resolver, type Rule, type Trace, type Query, type Priority, type Line as PoolLine, type LineOpts, type Picked,
} from './rules'
import { MENTION_RE } from '../content/world'
import { type Clock, realClock, isManualClock } from './clock'
import { type Audio, silentAudio } from './audio'
import { typo } from './typo'
import { classifyUserInput, type ClassifiedInput } from './input'
import { dueIn, dateOf, fmtDate, fmtTime, periodOf, tierOf, TIERS, type Due, type Period } from './time'
import {
  type GameState, type Msg, type NewMsg, type Choice, type Ctx, type Tone, type Storage,
  type InputCategory, freshState, loadState, saveState, SAVE_KEY, MAX_PATIENCE,
} from './state'

/** Отклик на отправку: смысл понят, категория на экране не показывается. */
export type SendFeel = 'shake' | 'intimidate' | 'sorry' | 'moo'

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
}

export interface TraceEntry extends Trace { id: number; day: number }

export interface Notif { id: number; icon: string; app: string; text: string }
export interface Moo { id: number; text: string; left: number; top: number }

// Регулярки событий в тексте Алика; ввод игрока классифицирует engine/input.ts.
export const TIMEY = /^(Завтра|Скоро|Вечером|Щас|Минуту|Уже почти|Сейчас не могу|Перезвоню|Наберу)/
export const SAD = /похорон|поминк|умер|реанимац|заболел|потоп|пожар|затопил|сломал|потерял|утонул|упало|сбежал|развод|похитил|застрял|сорвалась|отменили/
export const REVIVED = /встал|встаёт|воскрес|вернулась/
/** Повод поздравить (иначе «Поздравляю!» на «зуб мудрости растёт» звучит невпопад). */
export const FESTIVE = /свадьб|крестин|юбилей|обручен|день рождения|отмечаем|обмываем|празд|родился|поступил|выпускн|сватовств|помолвк|открыва|открыли|приехал|вернулся|урожа|отелилась|правнук|первое слово|дочку выдают/

export type SayItem = string | { w: string; t: string }

export class Game {
  S: GameState
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
  readonly rules: RuleSet<Game>
  /** Выбор реплик как в Hades: требования, приоритет, «уже сказано». */
  readonly lines: Lines
  readonly D = D

  // --- состояние интерфейса (не сохраняется)
  status = { text: 'был недавно', cls: '' }
  typing: string | null = null
  toast: string | null = null
  notif: Notif | null = null
  moos: Moo[] = []
  busy = false
  dead = false
  charging: number | null = null
  unread = 0
  feel: SendFeel | null = null
  feelId = 0
  title = 'Алик, где деньги?'
  /** Последние выборы правил — для отладочной панели (?debug). */
  trace: TraceEntry[] = []

  private storage: Storage | null
  private hour: number | null
  private listeners = new Set<() => void>()
  private version = 0
  private idleT = 0
  private statusT = 0
  /** UI-таймеры вне game-clock — иначе ?fast гасит тост за десятки мс. */
  private toastWall = 0
  private notifWall = 0
  private idleCount = 0
  private seq = 1
  private resetting = false
  private disposed = false
  private timerIds = new Set<number>()
  private sleepWaiters = new Set<(err?: GameDisposed) => void>()
  private noTimers: boolean
  private typos: boolean
  private hiddenAt = 0

  constructor(opts: GameOptions = {}) {
    this.storage = opts.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : opts.storage
    this.rng = opts.rng ?? mathRng
    this.clock = opts.clock ?? realClock()
    this.rawAudio = opts.audio ?? silentAudio
    this.hour = opts.hour ?? null
    this.noTimers = !!opts.noTimers
    this.typos = opts.typos ?? true
    this.S = loadState(this.storage) ?? freshState()
    this.decks = new Decks(this.S.bags, this.rng)
    this.seen = new Seen(this.S.seen)
    this.X = make(<T>(k: string, a: readonly Entry<T>[], nr?: boolean) => (nr ? this.decks.pick(k, a, this.lineFacts(), { noRepeat: true }) as T : this.draw(k, a)), () => this.S.tier, this.rng)
    this.scenes = makeScenes(this.X)
    this.S.rules.said ??= {} // старые сохранения
    this.lines = new Lines(this.S.rules.said, this.rng, () => ({ turn: this.S.stats.sent, day: this.S.day }))
    this.rules = new RuleSet<Game>({
      rng: this.rng,
      hub: makeHub(this.S.mem, this.S.actors),
      state: this.S.rules,
      now: () => ({ turn: this.S.stats.sent, day: this.S.day }),
    }).add(...allRules)
    if (opts.debug) {
      this.rules.tracer = (t) => {
        this.trace = [{ ...t, id: this.seq++, day: this.S.day }, ...this.trace].slice(0, 40)
      }
    }
    this.rawAudio.setMuted(this.S.muted)

    if (!this.S.msgs.length) this.seed()
    this.checkAway(opts.away ?? null)
    if (!this.S.choices) this.S.choices = this.buildChoices()
    this.restStatus()
    if (this.S.battery === 0) this.die()
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

  private schedule(fn: () => void, ms: number): number {
    const id = this.clock.setTimeout(() => {
      this.timerIds.delete(id)
      if (!this.disposed) fn()
    }, ms)
    this.timerIds.add(id)
    return id
  }

  private clearSchedule(id: number): void {
    this.clock.clearTimeout(id)
    this.timerIds.delete(id)
  }

  private swallowDisposed(e: unknown): void {
    if (!(e instanceof GameDisposed)) throw e
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const id of [...this.timerIds]) this.clock.clearTimeout(id)
    this.timerIds.clear()
    this.idleT = this.statusT = 0
    if (this.toastWall) { clearTimeout(this.toastWall); this.toastWall = 0 }
    if (this.notifWall) { clearTimeout(this.notifWall); this.notifWall = 0 }
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

  // ---------- helpers ----------
  /** Следующий уместный сейчас элемент колоды (needs/gate). */
  draw = <T>(key: string, arr: readonly Entry<T>[]): T => {
    const x = this.decks.pick(key, arr, this.lineFacts())
    if (x === null) throw new Error(`Колода ${key}: ни одного элемента, уместного сейчас`)
    return x
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
      let id = 0
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
  pair = (ka: string, a: readonly Entry<string>[], kb: string, b: readonly Entry<string>[]): string =>
    this.uniq(() => `${this.draw(ka, a)} ${this.draw(kb, b)}`)
  addrLine = (key: string, arr: readonly Entry<string>[]): string => this.uniq(() => `${this.X.g('ADDR')}, ${this.draw(key, arr)}`)

  get ctx(): Ctx | null { return this.S.ctx }
  setCtx(c: Ctx | null): void { this.S.ctx = c }

  // ---------- время ----------
  realHour(): number {
    return this.hour ?? new Date(this.clock.now()).getHours()
  }
  /** Время суток — настоящее (как в мессенджере), день недели — по календарю игры. */
  period(): Period {
    return periodOf(this.realHour(), dateOf(this.S.day).getDay())
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
    this.S.clock = this.realMinutes()
    this.push({ kind: 'sep', text: fmtDate(this.S.day) })
    const t = tierOf(this.S.day)
    if (t > this.S.tier) {
      this.S.tier = t
      this.push({ kind: 'sys', text: TIERS[t - 1][1] })
      this.unlock('tier' + t)
    }
    if (this.S.day >= 365) this.unlock('year')
  }

  // ---------- сообщения ----------
  push<M extends NewMsg>(m: M): Msg {
    if (this.disposed) throw new GameDisposed()
    const msg = { ...m, id: this.S.nextId++ } as Msg
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
    if (m.kind === 'text' && m.who) this.S.mem['met.' + m.who] = true // «кого игрок встречал» — для переклички в День выплаты
    this.tick(1 + this.rnd(3))
    const msg = this.push({ from: 'alik', time: fmtTime(this.S.clock), ...m } as NewMsg)
    if (msg.kind === 'text' && /брат джан/i.test(msg.text)) this.unlock('brat')
    if (msg.kind === 'text' || msg.kind === 'photo') this.noteClaims(msg.text)
    // хор: Алик кого-то упомянул — тот, может быть, вклинится после его ответа
    if (msg.kind === 'text' && !msg.who) {
      for (const [who, re] of Object.entries(MENTION_RE)) if (re.test(msg.text)) this.pending.push({ event: 'Mentioned', target: who })
    }
    this.audio.beep()
    this.audio.vibrate(40)
    if (this.chance(this.mooChance())) this.schedule(() => this.moo(), 300 + this.rnd(900))
    return msg
  }

  async typingFor(ms: number, label = 'печатает…'): Promise<void> {
    ms = Math.min(5000, Math.max(800, ms)) * (this.isNight() ? 1.5 : 1)
    const show = () => { this.typing = label; this.status = { text: label, cls: 'typing' }; this.emit() }
    const hide = () => { this.typing = null; this.status = { text: 'в сети', cls: 'online' }; this.emit() }
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
    if (this.S.ctx?.type === 'reactOnly') this.S.ctx = null // Алик ответил словами — «а ответить словами?» уже не к месту
    // ответить можно на последнее сказанное: воспоминание, реплика легенды или персонажа ставятся после своей реплики
    if (this.S.ctx) { delete this.S.ctx.memory; delete this.S.ctx.legend; delete this.S.ctx.chorus }
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
    this.status = { text, cls }
    this.emit()
  }
  restStatus(): void {
    if (this.S.offlineDays > 0) this.setStatus('был давно')
    else if (this.isNight()) this.setStatus(`был(а) в ${this.realHHMM()}`)
    else this.setStatus(this.chance(0.5) ? 'был недавно' : 'в сети', 'online')
  }

  /** Короткий тост поверх чата (ачивка, «Скопировано»…). Длительность — wall clock. */
  flash(text: string, ms = 2600): void {
    this.toast = text
    if (this.toastWall) clearTimeout(this.toastWall)
    this.toastWall = window.setTimeout(() => {
      this.toastWall = 0
      this.toast = null
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
    this.S.mem.mooAt = this.S.stats.sent
    if (!this.busy && !this.S.scene) this.S.choices = null // появится «Это корова?»
    if (this.S.stats.moo >= 10) this.unlock('moo10')
    const m: Moo = { id: this.seq++, text: 'М' + 'у'.repeat(4 + this.rnd(8)), left: 5 + this.rnd(45), top: 15 + this.rnd(60) }
    this.moos.push(m)
    this.schedule(() => { this.moos = this.moos.filter((x) => x !== m); this.emit() }, 3100)
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
  notify(icon: string, app: string, text: string): void {
    this.notif = { id: this.seq++, icon, app, text }
    if (this.notifWall) clearTimeout(this.notifWall)
    this.notifWall = window.setTimeout(() => {
      this.notifWall = 0
      this.notif = null
      this.emit()
    }, 4200)
    this.audio.vibrate(30)
    this.emit()
  }
  dismissNotif(): void {
    if (this.notifWall) { clearTimeout(this.notifWall); this.notifWall = 0 }
    this.notif = null
    this.emit()
  }
  randomNotif(): void {
    const p = this.linePicked('NOTIF', L.NOTIF)
    if (!p) return
    const n = p.spec as L.Notif
    let text = p.text
    if (n.spend) {
      const spend = 90 + this.rnd(40) * 10
      this.S.money = Math.max(0, this.S.money - spend)
      text = this.X.fill(text, { spend: String(spend), what: this.draw('SPEND', L.SPEND), money: this.S.money.toLocaleString('ru-RU') })
    }
    this.notify(n.icon, n.app, text)
  }
  drain(n = 1): void {
    if (this.dead) return
    const before = this.S.battery
    this.S.battery = Math.max(0, this.S.battery - n)
    if (before > 15 && this.S.battery <= 15) this.notify('🪫', 'Система', `Низкий заряд батареи: ${this.S.battery}%`)
    if (this.S.battery === 0) this.die()
    this.emit()
  }
  die(): void {
    this.dead = true
    this.clearSchedule(this.idleT)
    this.clearSchedule(this.statusT)
    this.unlock('dead')
    this.save()
    this.emit()
  }
  async charge(): Promise<void> {
    if (!this.dead || this.charging !== null || this.disposed) return
    try {
      for (let p = 1; p <= 100; p += 9) {
        if (this.disposed) return
        this.charging = p; this.emit(); await this.sleep(120)
      }
      if (this.disposed) return
      this.charging = null
      this.S.battery = 100
      this.dead = false
      this.busy = false
      this.emit()
      this.awayBurst(2 + this.rnd(3), 1 + this.rnd(2), 'Пока телефон заряжался')
      this.armIdle()
      this.armStatus()
    } catch (e) { this.swallowDisposed(e) }
  }

  // ---------- факты для правил ----------
  availableArcs(): string[] {
    return Object.keys(ARCS).filter((id) => {
      const st = this.S.arcs[id]
      return st ? st.i < ARCS[id].eps.length && this.S.day - st.last >= 3 : this.S.day >= (ARCS[id].minDay ?? 0)
    })
  }
  unfinishedArc(): string | undefined {
    return Object.keys(this.S.arcs).find((id) => this.arcCanAdvance(id, true))
  }
  /** Квест можно запустить из разговора: он ещё не проходил и его условия выполнены (как у слота квестов). */
  questAllowed(id: string): boolean {
    if (this.S.rules.once['Quest_' + id]) return false
    const facts = resolver(this.rules.hub, { event: 'line' }, this.facts())
    if (!(QUEST_WHEN[id] ?? []).every((c) => test(c, facts))) return false
    this.S.rules.once['Quest_' + id] = true // из разговора — тоже «один раз за игру»
    return true
  }
  /** Вопрос «Как там…?» к чему-то приведёт: сериал не закончен и сегодня по вопросу ещё не показывали серию. */
  arcCanAdvance(id: string, asked = false): boolean {
    const st = this.S.arcs[id]
    // серия в тот же день, что предыдущая, — каша («Свадьба. Третий день» и тут же «Десятый день»):
    // по вопросу игрока — назавтра, сама — через три дня
    return !!st && st.i < ARCS[id].eps.length && this.S.day - st.last >= (asked ? 1 : 3)
  }
  lateCount(): number {
    return this.S.promises.filter((p) => p.due != null && p.due < this.S.day && !p.asked).length
  }

  facts = (extra: Facts = {}): Facts => {
    const S = this.S
    const c = S.ctx ?? {}
    const pr = extra.promise !== undefined ? S.promises[Number(extra.promise)] : undefined
    return {
      day: S.day, tier: S.tier, mood: S.mood, sent: S.stats.sent, moo: S.stats.moo, patience: S.patience,
      dow: dateOf(S.day).getDay(), month: dateOf(S.day).getMonth() + 1,
      // прогресс сериалов: arc.grandpa = номер серии
      ...Object.fromEntries(Object.entries(S.arcs).map(([id, st]) => ['arc.' + id, st.i])),
      // ачивки и трофеи — условия для финалов сериалов и концовок
      ...Object.fromEntries(Object.keys(S.ach).map((k) => ['ach.' + k, true])),
      items: S.items.length,
      legend: this.legend(),
      'ctx.topic': this.topicOfLast(),
      // «Мууу» прозвучало после последнего сообщения игрока — только тогда про корову и спрашивают
      mooFresh: S.mem.mooAt === S.stats.sent,
      sinceRude: S.stats.sent - Number(S.mem.rudeAt ?? -99),
      // сколько раз игрок извинялся за последние 6 ходов («крик → мир → крик → мир»)
      sorrySwing: String(S.mem.sorryAt ?? '').split(',').filter((n) => n && S.stats.sent - Number(n) <= 6).length,
      // температура ссоры не уходит ниже нуля (после примирения ещё тикают отложенные «остывания»)
      'rude.heat': Math.max(0, Number(S.mem['rude.heat'] ?? 0)),
      'has.boris': S.items.some((n) => /Борис/.test(n)),
      'has.niva': S.items.some((n) => /Нива/.test(n)),
      // Календарное обещание живо в день срока; событийное — в ход, когда его факт стал истиной.
      promiseLive: !!pr && (pr.condition ? pr.met === S.day : pr.due === S.day),
      period: this.period(), night: this.isNight(), offline: S.offlineDays > 0, scene: S.scene?.id,
      lateCount: this.lateCount(),
      // сама — не больше одной серии в день: три легенды денег за день — уже не сюжет, а шум
      arcAvailable: this.availableArcs().length > 0 && !Object.values(S.arcs).some((a) => a.last === S.day),
      arcsStarted: Object.keys(S.arcs).length,
      arcsDone: Object.entries(S.arcs).filter(([id, a]) => a.i >= ARCS[id].eps.length).length,
      quests: Object.keys(S.ach).filter((k) => k.startsWith('q_')).length,
      callbackReady: !!this.callbackCandidate(),
      arcUnfinished: this.unfinishedArc(),
      deathCanAdvance: !!S.mem.alik_dead && this.arcCanAdvance('alik_death', true),
      'ctx.type': c.type, 'ctx.s': c.s, 'ctx.shortTimey': c.s ? TIMEY.test(c.s) : false,
      'ctx.when': c.when, 'ctx.whenNever': c.whenNever, 'ctx.rel': c.rel?.n, 'ctx.relYou': c.rel?.you ?? c.rel?.n, 'ctx.sad': c.sad, 'ctx.festive': c.festive, 'ctx.revived': c.revived,
      'ctx.constr': c.constr, 'ctx.legendary': c.legendary, 'ctx.arc': c.arc,
      // спросить про сериал есть смысл: будет новая серия, или сериал закончен и сегодня про финал ещё не спрашивали
      'ctx.arcCanAdvance': c.arc ? this.arcCanAdvance(c.arc, true) || (S.arcs[c.arc]?.i >= ARCS[c.arc].eps.length && S.mem['doneAsked.' + c.arc] !== S.day) : false,
      'arc.done': c.arc ? this.S.arcs[c.arc]?.i >= ARCS[c.arc].eps.length : false,
      'ctx.legend': c.legend, 'ctx.chorus': c.chorus, 'ctx.memory': c.memory,
      'ctx.group': c.group, 'ctx.wrong': c.wrong, 'ctx.deleted': c.deleted, 'ctx.offended': c.offended,
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
      for (const p of this.S.promises) text = text.split(p.t).join('')
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
  fire(event: string, extra: Facts = {}, q: Omit<Query, 'event' | 'facts'> = {}): Promise<Rule<Game> | null> {
    return this.rules.fire(this, { event, facts: extra, ...q }, this.facts, { floor: this.floor() })
      .catch((e) => { this.swallowDisposed(e); return null })
  }
  /** События, отложенные до «безопасной точки» (после ответа Алика): хор, наступившие обещания. */
  private pending: Query[] = []
  async afterTurn(): Promise<void> {
    try {
      await this.rules.runDue(this, this.facts, { floor: this.floor() })
      const promise = !this.S.mem.alik_dead && !this.S.mem.blocked
        ? this.S.promises.findIndex((p) => p.condition && p.met === undefined && this.S.mem[p.condition] === true)
        : -1
      if (promise >= 0) {
        const record = this.S.promises[promise]
        for (const candidate of this.S.promises) {
          if (candidate.condition === record.condition && candidate.met === undefined) candidate.met = this.S.day
        }
        const legend = this.legend()
        if (legend && LEGENDS[legend]?.condition === record.condition) {
          const arc = this.S.mem['legend.arc']
          this.setLegend(null, typeof arc === 'string' ? arc : undefined)
        }
        await this.fire('PromiseConditionMet', { promise })
      }
      // из упоминаний — не больше одного вклинившегося персонажа за ход
      const queue = this.pending.splice(0)
      for (const q of queue) if (await this.rules.fire(this, q, this.facts, { floor: this.floor() })) break
    } catch (e) { this.swallowDisposed(e) }
  }

  // ---------- варианты игрока ----------
  buildChoices(): Choice[] {
    const S = this.S
    if (S.scene) {
      const n = this.scenes[S.scene.id].nodes[S.scene.node]
      // поймать на лжи можно и посреди сцены — это её прерывает
      const catchLie = this.rules.collect({ event: 'BuildChoices' }, this.facts()).find((r) => r.name === 'Opt_CatchLie')
      const lieOpt = catchLie ? [catchLie.offer!(this.rules.ctx(this, catchLie, { event: 'BuildChoices' }, this.facts())) as Choice] : []
      return [...lieOpt, ...(n.opts ?? []).map((o, i) => {
        const gen = (): string => (typeof o.t === 'function' ? o.t(S.scene!.vars) : Array.isArray(o.t) ? this.draw<string>(`${S.scene!.id}.${S.scene!.node}.o${i}`, o.t) : o.t)
        const t = gen().length > 8 ? this.playerLine(gen) : gen()
        return { text: t, tone: o.tone ?? 'polite', scene: S.scene!.id, go: o.go } as Choice
      })]
    }
    // контекстные варианты — правила события BuildChoices (самые специфичные первыми)
    const facts = this.facts()
    const out: Choice[] = []
    for (const r of this.rules.collect({ event: 'BuildChoices' }, facts)) {
      if (out.length >= 2) break
      const c = r.offer?.(this.rules.ctx(this, r, { event: 'BuildChoices' }, facts)) as Choice | null
      if (c) out.push(c)
    }
    const P2 = (a: string, b: string) => this.playerLine(() => `${this.draw(a, D[a])} ${this.draw(b, D[b])}`)
    const one = (key: string, arr: readonly Entry<string>[]) => this.playerLine(() => this.draw(key, arr))
    // общие реплики зависят от стадии: вежливый режим Алика, блок, поздние дни
    if (S.mem.polite && this.chance(0.6)) out.push({ text: one('P_POL_POLITE', P_POL_POLITE), tone: 'polite' })
    else out.push({ text: P2('P_POL_A', 'P_POL_B'), tone: 'polite' })
    if (out.length < 3) {
      // нейтральная реплика знает время: ночь, вечер пятницы, поздние дни ожидания
      const period = this.period()
      const tail = period === 'night' && this.chance(0.5) ? this.freshPlayer('P_NIGHT', P_NIGHT)
        : period === 'friday' && this.chance(0.5) ? this.freshPlayer('P_FRIDAY', P_FRIDAY)
        : S.day >= 300 && this.chance(0.4) ? this.freshPlayer('P_NEU_B_LATE', P_NEU_B_LATE) : null
      out.push({ text: tail ? `${this.draw('P_NEU_A', D.P_NEU_A)} ${tail}` : P2('P_NEU_A', 'P_NEU_B'), tone: 'neutral' })
    }
    if (S.mem.blocked) out.push({ text: one('P_RUDE_BLOCKED', P_RUDE_BLOCKED), tone: 'rude' })
    else if (S.mem.polite) out.push({ text: one('P_RUDE_POLITE', P_RUDE_POLITE), tone: 'rude' })
    else {
      const topic = facts['ctx.topic'] && this.chance(0.6) ? this.freshPlayer('PR_' + facts['ctx.topic'], TOPICS[String(facts['ctx.topic'])].r.filter((_, i) => TOPICS[String(facts['ctx.topic'])].rneed?.[i]?.test(this.topicText) ?? true)) : null
      out.push({ text: topic ?? P2('P_RUDE_A', 'P_RUDE_B'), tone: 'rude' })
    }
    return out.slice(0, 4)
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
    this.feel = feel
    this.feelId++
    if (feel === 'shake') this.audio.vibrate([80, 40, 80])
    else if (feel === 'intimidate') this.audio.vibrate([120, 50, 120, 50, 200])
    this.emit()
  }

  // ---------- ход игрока ----------
  async send(opt: Choice | string): Promise<void> {
    try {
      await this.sendTurn(opt)
    } catch (e) { this.swallowDisposed(e) }
  }

  private async sendTurn(opt: Choice | string): Promise<void> {
    const parsed = typeof opt === 'string' ? this.classifyInput(opt) : null
    const o: Choice = parsed
      ? { text: opt as string, tone: parsed.tone, category: parsed.category, act: parsed.intent }
      : opt as Choice
    if (this.busy || this.dead || this.disposed || !o.text.trim()) return
    const S = this.S
    this.busy = true
    this.clearSchedule(this.idleT)
    this.idleCount = 0
    this.clearUnread()
    if (o.act !== 'catchLie') this.forgetLie() // не поймал сразу — момент упущен
    let tone = o.tone
    // Готовая кнопка может быть помечена как rude, но текст с судом всё равно двигает ветку угроз.
    if (tone === 'rude' && !o.scene && this.classifyInput(o.text).category === 'threat') tone = 'threat'
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
    if (o.act !== 'topic') S.mem.topicRun = 0 // серия вопросов по одной теме прервалась
    if (o.act === 'sorry') S.mem.sorryAt = [...String(S.mem.sorryAt ?? '').split(',').filter(Boolean), S.stats.sent].slice(-4).join(',') // для «качелей»
    if (tone === 'rude') S.mem.rudeAt = S.stats.sent
    S.choices = null
    this.drain(1)
    this.save()
    if (this.disposed) return
    if (this.dead) {
      this.sys('Не доставлено: телефон Алика выключен.')
      S.ctx = null
      this.save()
      return
    }

    await this.sleep((500 + this.rnd(700)) * (this.isNight() ? 2 : 1))
    if (this.disposed) return
    this.setStatus('прочитано')

    // реакция на сообщение игрока; иногда — вместо ответа
    let reactOnly = false
    // заблокировал — значит, не видит: реакции на недоставленное не бывает
    if (!o.scene && !S.mem.blocked && this.chance(0.18) && mine.kind === 'text') {
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
      S.scene = null // контекстная реплика посреди сцены (например, «Поймать на лжи») прерывает её
      await this.fire('PlayerSays', this.saysFacts(o))
    } else if (S.scene) {
      S.scene = null // свой текст посреди сцены — сцена прерывается
      await this.alikTurn(tone, o.category)
    } else {
      await this.alikTurn(tone, o.category)
    }
    if (this.disposed) return

    await this.afterTurn()
    if (this.disposed) return
    // сюжетный ход: только вне сцены, если Алик не «пропал» и в этом ходу ещё не было сцены или серии
    if (!S.scene && !o.scene && !S.offlineDays && !this.dead && this.arcAt !== S.stats.sent) await this.fire('StoryBeat')
    await this.fire('CheckEnding')
    if (this.disposed) return

    S.patience = Math.max(0, S.patience - 1)
    if (S.patience === 0) {
      await this.sleep(600)
      if (this.disposed) return
      this.sys(this.draw('FLOOR', FLOOR))
      S.patience = MAX_PATIENCE
      this.unlock('floor')
    }
    if (!S.ram && S.stats.sent >= 25) {
      S.ram = true
      this.rules.applyOps(meet('baran'), {})
      this.sys('Алик Воздухонесян сменил фото профиля. На фото — баран')
      this.unlock('ram')
    }
    if (this.chance(0.12)) this.randomNotif()
    this.restStatus()
    this.busy = false
    S.choices = this.buildChoices()
    this.save()
    this.emit()
    this.armIdle()
  }

  recordPromise(p?: { text: string; d: number | null; due?: Due; condition?: PromiseCondition } | null): void {
    if (!p) return
    if (p.condition && this.S.mem[p.condition] === true) return
    const due = p.d == null ? null : this.S.day + (p.due ? dueIn(p.due, this.S.day) : p.d)
    this.S.promises.push({ t: p.text, made: this.S.day, due, condition: p.condition })
    if (due !== null && due > this.S.day) this.rules.schedule({ at: due, kind: 'event', event: 'PromiseDue', facts: { promise: this.S.promises.length - 1 } })
    if (this.S.promises.length >= 20) this.unlock('promises20')
  }
  /** «Клянусь мамой, завтра — всё отдам» + запись в журнал. */
  /** Обещание. Пока жива легенда денег — срок чаще вытекает из неё («как ключ выйдет»); legend = true — всегда из неё. */
  async promiseLine(prefix?: string, legend?: boolean): Promise<void> {
    const legendSpec = this.legend() ? LEGENDS[this.legend()!] : undefined
    const until = legendSpec?.until
    // срок из легенды — после серии обязательно, дальше изредка: одна и та же клятва «как „Нива“ заведётся» приедается
    const recent = this.S.stats.sent - Number(this.S.mem.legendPromiseAt ?? -99) < 4
    const fromLegend = !!until && (legend || (!recent && this.chance(0.4)))
    if (fromLegend) this.S.mem.legendPromiseAt = this.S.stats.sent
    const p = this.uniq(() => {
      const q = this.X.promise()
      if (fromLegend) {
        q.text = q.text.replace(q.t, until!)
        q.t = until!
        q.d = null
        q.due = undefined
        q.condition = legendSpec?.condition
      }
      if (prefix) return { text: `${prefix} ${low(q.text)}.`, q }
      // форма клятвы — из пула (одна формула в каждом втором сообщении приедается)
      const form = this.line('OATH_FORMS', OATH_FORMS) ?? '{o}, {p}.'
      return { text: form.replace('{o}', this.X.g('OATH')).replace('{P}', cap(q.text)).replace('{p}', q.text), q }
    })
    this.recordPromise(p.q)
    await this.say([p.text])
    this.S.ctx = { ...(this.S.ctx ?? {}), when: p.q.t, whenNever: p.q.d == null }
  }
  ctxFromPromise(p?: Promise3): Ctx {
    return p ? { when: p.t, whenNever: p.d == null } : {}
  }

  // ---------- ход Алика ----------
  async alikTurn(tone: Tone, category?: Choice['category']): Promise<void> {
    const S = this.S
    S.ctx = null
    if (S.offlineDays > 0) {
      this.setStatus('был давно')
      await this.sleep(1500)
      this.nextDay(S.offlineDays)
      S.offlineDays = 0
      await this.say([this.uniq(this.X.back)])
    } else if (this.chance(0.65)) {
      this.nextDay(1 + this.rnd(3))
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
    const ex = this.uniq(() => this.X.excuse({ preferLong: this.S.politeStreak >= 3 }))
    if (ex.legendary) this.unlock('legend')
    this.recordPromise(ex.p)
    const msgs = await this.say(ex.texts, ex.legendary)
    this.markTopical(msgs)
    this.S.ctx = {
      ...this.ctxFromPromise(ex.p), rel: ex.r, constr: ex.constr, legendary: ex.legendary,
      sad: SAD.test(ex.ev ?? ''), revived: REVIVED.test(ex.ev ?? ''), festive: !SAD.test(ex.ev ?? '') && FESTIVE.test(ex.ev ?? ''),
    }
    if (this.chance(0.09)) await this.editLast(msgs[msgs.length - 1], ex.p)
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
    await this.typingFor(1200)
    this.S.debt -= 50
    this.S.money += 50
    if (++this.S.stats.fifty >= 5) this.unlock('fifty5')
    this.alikMsg({ kind: 'transfer', from: 'alik', text: this.draw('TRANSFER_NOTE', D.TRANSFER_NOTE) })
    this.S.ctx = { type: 'transfer' }
  }

  async sticker(fixed?: { e: string; c: string }): Promise<void> {
    await this.typingFor(900, 'выбирает стикер…')
    const s = fixed ?? this.draw('STICKERS', L.STICKERS)
    this.alikMsg({ kind: 'sticker', from: 'alik', e: s.e, c: s.c })
    this.unlock('sticker')
    if (!fixed) this.S.ctx = { type: 'sticker' }
  }

  async forward(): Promise<void> {
    await this.typingFor(700)
    const f = this.seen.pickFresh(() => this.draw('FWD', L.FWD), (x) => x)
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
      this.S.ctx = { ...this.S.ctx, when: w, whenNever: true }
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
    for (const w of members) {
      const t = this.seen.pickFresh(() => this.draw('G_' + w, GROUP[w]), (x) => x)
      if (this.seen.has(t)) continue // у участника кончились новые фразы — в этот раз молчит
      this.seen.mark(t)
      await this.say([{ w, t }])
    }
    await this.say([this.uniq(() => this.draw('GOOPS', GROUP_OOPS))])
    this.sys('Алик удалил вас из группы')
    this.unlock('group')
    this.S.ctx = { group: true }
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
  noteClaims(text: string): void {
    const mem = this.S.mem
    const found = CLAIMS.filter((c) => c.re.test(text))
    for (const c of found) {
      // где деньги — меняется по сюжету: противоречие ловится, только если старое место звучало недавно (не «Нива» полгода назад)
      const fresh = (o: Claim) => o.group !== 'money' || this.S.day - Number(mem['saidLast.' + o.key] ?? mem['said.' + o.key]) <= 14
      const old = CLAIMS.find((o) => mem['said.' + o.key] !== undefined && conflicts(o.key, c.key) && !mem['caught.' + pairKey(o.key, c.key)] && fresh(o))
      if (old) {
        mem['lie.old'] = old.key
        mem['lie.new'] = c.key
        mem['lie.kind'] = old.group === 'money' ? 'money' : ({ grandpa_dead: 'grandpa', grandpa_alive: 'grandpa', customer_owes: 'customer', customer_paid: 'customer', sent: 'sent', no_money: 'sent' } as Record<string, string>)[c.key] ?? 'other'
      }
    }
    for (const c of found) { if (mem['said.' + c.key] === undefined) mem['said.' + c.key] = this.S.day; mem['saidLast.' + c.key] = this.S.day }
  }
  lie(): { old: Claim; new: Claim } | null {
    const o = claimByKey(String(this.S.mem['lie.old'] ?? '')), n = claimByKey(String(this.S.mem['lie.new'] ?? ''))
    return o && n ? { old: o, new: n } : null
  }
  forgetLie(): void {
    delete this.S.mem['lie.old']
    delete this.S.mem['lie.new']
    delete this.S.mem['lie.kind']
  }
  /** Алик пойман: запомнить пару, отдать реплику, счётчик растёт. */
  async caught(line: string): Promise<void> {
    const l = this.lie()
    if (l) this.S.mem['caught.' + pairKey(l.old.key, l.new.key)] = true
    this.forgetLie()
    const n = Number(this.S.mem.caught ?? 0)
    this.unlock('liar')
    if (n >= 3) this.unlock('liar3')
    this.mood(-1)
    await this.say([line])
    this.S.ctx = null
  }
  /** Утверждение, к которому Алик может сам вернуться: сказано 10+ дней назад, ещё не вспоминал. */
  callbackCandidate(): Claim | undefined {
    const mem = this.S.mem
    return CLAIMS.find((c) => c.updates && mem['said.' + c.key] !== undefined && this.S.day - Number(mem['said.' + c.key]) >= 10 && !mem['cb.' + c.key])
  }
  async callback(): Promise<void> {
    const c = this.callbackCandidate()
    // продолжение истории может опираться на то, чего ещё нет в мире (Борис) — тогда в другой раз
    const upd = c && this.decks.pick('CB_' + c.key, c.updates!, this.lineFacts())
    if (!c || !upd) return this.excuseTurn()
    this.S.mem['cb.' + c.key] = this.S.day
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
    // серия без своей легенды возвращает легенду своего сериала: свадьба идёт — значит, деньги «после свадьбы»
    else if (arc && this.S.mem['legend.of.' + arc]) this.setLegend(String(this.S.mem['legend.of.' + arc]), arc)
    const m = this.open(ep.m)
    for (const x of m) this.seen.mark(typeof x === 'string' ? x : x.t)
    this.markTopical(await this.say(m))
    if (typeof ep.legend === 'string' && this.S.ctx) this.S.ctx.legend = ep.legend // новая легенда — есть что переспросить
    if (ep.fx?.debt) this.S.debt += ep.fx.debt
    if (ep.fx?.pay) { this.S.debt -= ep.fx.pay; this.S.money += ep.fx.pay }
    if (ep.item) this.S.items.push(ep.item)
    if (ep.state) this.rules.applyOps([{ key: ep.state.key, op: '=', value: true, forDays: ep.state.days, scope: ep.state.actor ? 'target' : 'world' }], { target: ep.state.actor })
    if (ep.fx?.days) this.nextDay(ep.fx.days)
    if (ep.sys) { await this.sleep(500); this.sys(ep.sys) }
    if (ep.fx?.ach) this.unlock(ep.fx.ach)
    if (ep.fx?.offline) this.goOffline(ep.fx.offline)
    if (ep.then === 'promise') await this.promiseLine(undefined, !!ep.legend)
  }
  /** Легенда денег — факт на доске мира: где деньги и что мешает. Живёт 30 дней или до следующей серии. */
  setLegend(id: string | null, arc?: string): void {
    const m = this.S.mem
    // после Дня выплаты деньги «выплачены» — новые легенды о том, где они, спорили бы с утром выплаты
    if (id !== null && m['payday.chain']) return
    if (id === null) {
      if (arc) delete m['legend.of.' + arc]
      if (!arc || m['legend.arc'] === arc) { delete m['legend.id']; delete m['legend.arc'] }
      return
    }
    if (arc) m['legend.of.' + arc] = id
    m['legend.id'] = id
    m['legend.day'] = this.S.day
    if (arc) m['legend.arc'] = arc
  }
  /** Текущая легенда (если не устарела). */
  legend(): string | undefined {
    const m = this.S.mem
    const id = m['legend.id'] as string | undefined
    return id && this.S.day - Number(m['legend.day'] ?? -99) <= 30 ? id : undefined
  }
  /** Финал сериала: обычный (последний эпизод) или частный из FINALES. */
  async playFinale(id: string, f: Finale | null): Promise<void> {
    this.S.mem['finale.' + id] = f?.id ?? 'default'
    const ep = f ?? ARCS[id].eps.at(-1)!
    // финал закрывает легенду своего сериала («ключ не тот» → «мы должны всем»)
    if (ep.legend === undefined) this.setLegend(null, id)
    await this.playEpisode(ep, id)
    if (f) this.unlock(`fin_${id}_${f.id}`)
  }
  finaleOf(id: string): Finale | undefined {
    const fid = this.S.mem['finale.' + id]
    return FINALES[id]?.find((f) => f.id === fid)
  }
  finaleTitle(id: string): string | undefined {
    if (!this.S.mem['finale.' + id]) return undefined
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
    this.sys(`Голосование «Простить плиточника?» — Да: 1 (Гарик). Нет: ${5 + this.rnd(4)}.${this.canSpeak('boris') ? ' Бее: 1.' : ''}`)
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
  closeEnding(): void {
    this.S.ending = null
    this.save()
    this.emit()
  }

  // ---------- сцены ----------
  async startScene(): Promise<void> {
    // сцену выбирают правила PickScene (по сюжету и с перерывом); все на перерыве — обычная отмазка
    if (!(await this.fire('PickScene'))) await this.excuseTurn()
  }
  async enterNode(sid: string, nid: string | null): Promise<void> {
    const S = this.S
    if (nid === null) { S.scene = null; S.ctx = null; await this.say([this.uniq(this.X.short)]); return }
    if (nid.includes(':')) [sid, nid] = nid.split(':')
    const sc = this.scenes[sid]
    // новая сцена — старый контекст («что вы удалили?», «при чём тут тётя?») больше не к месту
    if (!S.scene || S.scene.id !== sid) {
      S.scene = { id: sid, node: nid, vars: sc.init ? sc.init(this.rng, (arr) => this.open(arr)) : {} }
      S.ctx = null
    }
    S.scene.node = nid
    const n = sc.nodes[nid]
    const v = S.scene.vars
    const res = (x: Line) => (typeof x === 'function' ? x(v) : x)
    const gen = (key: string, arr: Line | Entry<Line>[]) => () => res(Array.isArray(arr) ? this.draw(`${sid}.${nid}.${key}`, arr) : arr)
    const variant = (key: string, arr: Entry<Line>[]) => this.uniq(gen(key, arr))

    const fx = n.fx ?? {}
    if (fx.days) this.nextDay(fx.days)
    if (fx.debt) S.debt += fx.debt
    if (fx.mood) this.mood(fx.mood)
    if (fx.barter) { S.debt -= v.v; S.items.push(v.n) }
    if (fx.invoice) S.debt -= v.total
    if (fx.ach) this.unlock(fx.ach)
    if (fx.legend !== undefined) this.setLegend(fx.legend)
    if (fx.set) this.rules.applyOps(Object.entries(fx.set).map(([key, value]) => ({ key, op: '=' as const, value })), {})
    if (fx.during) this.rules.applyOps([{ key: fx.during.key, op: '=', value: true, forDays: fx.during.days }], {})
    if (n.sys) { await this.sleep(700); this.sys(gen('sys', n.sys)()) }
    // обращение «Брат мой, …» — манера Алика; реплики других персонажей (Борис: «Бее.») не украшаем
    if (n.a) await this.say([n.who ? gen('a', n.a)() : variant('a', n.a)], false, n.who)
    if (n.doc) {
      await this.typingFor(2000, 'отправляет документ…')
      this.alikMsg({ kind: 'doc', from: 'alik', title: `АКТ ВЗАИМОЗАЧЁТА № ${100 + this.rnd(900)}`, rows: v.rows, total: v.total })
      await this.sleep(600)
      this.sys(`Алик вычел из долга ${v.total.toLocaleString('ru-RU')} ₽ по акту.`)
    }
    if (n.a2) await this.say([n.who2 ? gen('a2', n.a2)() : variant('a2', n.a2)], false, n.who2)
    if (n.sys2) { await this.sleep(700); this.sys(gen('sys2', n.sys2)()) }
    // шаг, собранный на лету (День выплаты); если шаг перевёл сцену в другой узел — дальше управляет он
    if (n.hook) { await PAYDAY_HOOKS[n.hook]?.(this); if (S.scene?.id !== sid || S.scene?.node !== nid) return }
    if (n.then === 'moo') { await this.sleep(400); this.moo() }
    if (n.then === 'transfer') await this.transfer()
    if (n.then === 'promise') await this.promiseLine()
    if (!n.opts) { S.scene = null; if (n.then !== 'promise') S.ctx = null }
    this.emit()
  }

  // ---------- допработа ----------
  async answerJob(id: number, yes: boolean): Promise<void> {
    try {
      const m = this.S.msgs.find((x) => x.id === id)
      if (!m || m.kind !== 'job' || m.answered || this.busy || this.dead || this.disposed) return
      this.replaceMsg(m, { answered: true })
      this.busy = true
      this.clearSchedule(this.idleT)
      const reply = this.playerLine(() => (yes ? this.draw('JY', JOB_YES_P) : this.draw('JN', JOB_NO_P)))
      this.seen.mark(reply)
      this.push({ kind: 'text', from: 'me', text: reply, time: fmtTime(this.S.clock) })
      if (yes) {
        const add = 5000 + this.rnd(16) * 1000
        this.nextDay(2 + this.rnd(3))
        this.sys(`Вы сделали работу. Долг Алика вырос на ${add.toLocaleString('ru-RU')} ₽`)
        this.S.debt += add
        this.mood(2)
        this.unlock('fence')
        await this.say([this.uniq(this.X.jobYes)])
      } else {
        this.mood(-1)
        await this.say([this.uniq(this.X.jobNo)])
      }
      this.S.ctx = null
      this.busy = false
      this.S.choices = this.buildChoices()
      this.save()
      this.emit()
      this.armIdle()
    } catch (e) { this.swallowDisposed(e) }
  }

  // ---------- Алик живёт сам ----------
  armIdle(): void {
    this.clearSchedule(this.idleT)
    // Алик пишет сам редко: не в начале игры, не раньше чем через 1,5–3 минуты тишины, не больше двух раз подряд
    if (this.disposed || this.noTimers || this.dead || this.idleCount >= 2 || this.S.stats.sent < 5) return
    this.idleT = this.schedule(() => void this.onIdle(), (90000 + this.rnd(90000)) * (this.idleCount + 1) * 1.5 ** this.idleCount)
  }
  sheetOpen = false
  async onIdle(): Promise<void> {
    try {
      if (this.disposed || this.busy || this.dead || this.sheetOpen || (typeof document !== 'undefined' && document.hidden)) return this.armIdle()
      this.idleCount++
      this.busy = true
      this.drain(1)
      if (!this.dead) {
        await this.fire('AlikIdle')
        if (this.disposed) { this.busy = false; return }
        await this.afterTurn()
        this.S.choices = this.buildChoices()
        this.save()
      }
      this.busy = false
      this.emit()
      if (!this.dead && !this.disposed) { this.restStatus(); this.armIdle() }
    } catch (e) { this.swallowDisposed(e) }
  }
  armStatus(): void {
    this.clearSchedule(this.statusT)
    if (this.disposed || this.noTimers || this.dead) return
    this.statusT = this.schedule(async () => {
      try {
        if (this.disposed) return
        if (!this.busy && !this.dead && this.S.offlineDays === 0) {
          if (this.chance(0.2)) {
            // «печатает…» — и ничего не приходит
            this.typing = 'печатает…'
            this.setStatus('печатает…', 'typing')
            await this.sleep(1500 + this.rnd(2500))
            if (this.disposed) return
            this.typing = null
            if (!this.busy) this.setStatus('в сети', 'online')
          } else if (this.isNight()) this.setStatus(`был(а) в ${this.realHHMM()}`)
          else this.setStatus(this.draw('WANDER', STATUS_WANDER), 'online')
        }
        this.armStatus()
      } catch (e) { this.swallowDisposed(e) }
    }, 7000 + this.rnd(9000))
  }

  // ---------- возвращение после паузы ----------
  clearUnread(): void {
    this.unread = 0
    this.title = 'Алик, где деньги?'
  }
  private awayMsg(): void {
    const r = this.rng.random()
    this.tick(20 + this.rnd(200))
    const base = { from: 'alik' as const, time: fmtTime(this.S.clock) }
    if (r < 0.35) { this.push({ ...base, kind: 'text', text: this.addrLine('IDLE', L.IDLE) }); return }
    if (r < 0.5) { const s = this.draw('STICKERS', L.STICKERS); this.push({ ...base, kind: 'sticker', e: s.e, c: s.c }); return }
    if (r < 0.65) {
      const f = this.seen.pickFresh(() => this.draw('FWD', L.FWD), (x) => x)
      this.seen.mark(f.t)
      this.push({ ...base, kind: 'fwd', f: f.f, text: f.t })
      return
    }
    if (r < 0.75) { this.push({ ...base, kind: 'text', text: '', deleted: true }); return }
    if (r < 0.85) { this.push({ ...base, kind: 'voice', len: 10 + this.rnd(50) }); return }
    if (r < 0.92) {
      this.S.debt -= 50; this.S.money += 50; this.S.stats.fifty++
      this.push({ ...base, kind: 'transfer', text: this.draw('TRANSFER_NOTE', D.TRANSFER_NOTE) })
      return
    }
    const ex = this.uniq(() => this.X.excuse())
    this.recordPromise(ex.p)
    this.push({ ...base, kind: 'text', text: ex.texts.join(' ') })
  }
  awayBurst(n: number, days: number, why?: string): void {
    this.nextDay(days)
    this.push({ kind: 'sys', text: `${why ? why + ' — ' : ''}непрочитанные сообщения`, unread: true })
    for (let i = 0; i < n; i++) this.awayMsg()
    this.unread = n
    this.title = `(${n}) Алик, где деньги?`
    this.unlock('away')
    this.notify('💬', 'Алик Воздухонесян', `${n} ${n < 5 ? 'новых сообщения' : 'новых сообщений'}`)
    this.audio.beep()
    this.S.ctx = { type: 'idle' }
    this.S.choices = this.buildChoices()
    this.save()
    this.emit()
  }
  checkAway(awayOverride: number | null): void {
    const gapMin = awayOverride ?? (this.S.lastSeen ? (this.clock.now() - this.S.lastSeen) / 60000 : 0)
    if (gapMin < 15 || !this.S.stats.sent) return
    if (gapMin > 120) this.S.battery = 100 // телефон заряжался
    this.awayBurst(Math.min(5, 1 + Math.floor(gapMin / 30)), Math.min(10, 1 + Math.floor(gapMin / 120)))
  }
  onVisibility(hidden: boolean): void {
    if (hidden) { this.hiddenAt = this.clock.now(); this.save(); return }
    const gapMin = (this.clock.now() - this.hiddenAt) / 60000
    if (this.hiddenAt && gapMin >= 3 && !this.busy && !this.dead && this.S.stats.sent) this.awayBurst(Math.min(4, 1 + Math.floor(gapMin / 10)), 1)
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
  }

  // для отображения
  get gameDate(): string {
    return dateOf(this.S.day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }
  get clockText(): string { return fmtTime(this.S.clock) }
  castOf(who?: string) { return who ? CAST[who] : undefined }
}
