// Игра: состояние, сообщения, ход Алика, «живость». Решения — что ответить, что предложить игроку,
// что сделать Алику — принимает система правил (engine/rules.ts, content/rules/*).
import { make, D, low, cap, type ExcuseApi, type Promise3 } from '../content/excuses'
import { makeScenes, type Scene, type Line } from '../content/scenes'
import { ARCS, CAST, GROUP, GROUP_OOPS, WRONG_TO, WRONG_WHAT, WRONG_OOPS } from '../content/arcs'
import * as L from '../content/life'
import { ACH } from '../content/achievements'
import { FLOOR, PHOTO_A, PHOTO_B, JOB_YES_P, JOB_NO_P, PLAYER_PREFIX, PLAYER_SUFFIX, STATUS_WANDER, SEED_INTRO, SEED_REPLY } from '../content/misc'
import { allRules } from '../content/rules'
import { CLAIMS, claimByKey, conflicts, pairKey, CALLBACK_OPEN, type Claim } from '../content/lies'
import { type Rng, mathRng, rndInt, shuffle, chance } from './rng'
import { Decks } from './deck'
import { Seen, type Keyed } from './uniq'
import { RuleSet, type Facts, type Rule, type Trace } from './rules'
import { type Clock, realClock } from './clock'
import { type Audio, silentAudio } from './audio'
import { typo } from './typo'
import { dateOf, fmtDate, fmtTime, periodOf, tierOf, TIERS, type Period } from './time'
import {
  type GameState, type Msg, type NewMsg, type Choice, type Ctx, type Tone, type Storage,
  freshState, loadState, saveState, SAVE_KEY, MAX_PATIENCE,
} from './state'

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
}

export interface TraceEntry extends Trace { id: number; day: number }

export interface Notif { id: number; icon: string; app: string; text: string }
export interface Moo { id: number; text: string; left: number; top: number }

// Регулярки классификации текста игрока и событий
export const THREAT_RE = /суд|полиц|заявлен|прокур|юрист|адвокат|коллектор/i
export const TIMEY = /^(Завтра|Скоро|Вечером|Щас|Минуту|Уже почти|Сейчас не могу|Перезвоню|Наберу)/
export const SAD = /похорон|поминк|умер|реанимац|заболел|потоп|пожар|затопил|сломал|потерял|утонул|упало|сбежал|развод|похитил|застрял|сорвалась|отменили/
export const REVIVED = /встал|встаёт|воскрес|вернулась/

export type SayItem = string | { w: string; t: string }

export class Game {
  S: GameState
  readonly rng: Rng
  readonly clock: Clock
  readonly audio: Audio
  readonly decks: Decks
  readonly seen: Seen
  readonly X: ExcuseApi
  readonly scenes: Record<string, Scene>
  readonly rules: RuleSet<Game>
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
  shakeId = 0
  title = 'Алик, где деньги?'
  /** Последние выборы правил — для отладочной панели (?debug). */
  trace: TraceEntry[] = []

  private storage: Storage | null
  private hour: number | null
  private listeners = new Set<() => void>()
  private version = 0
  private idleT = 0
  private statusT = 0
  private ambientT = 0
  private toastT = 0
  private notifT = 0
  private idleCount = 0
  private seq = 1
  private resetting = false
  private noTimers: boolean
  private hiddenAt = 0

  constructor(opts: GameOptions = {}) {
    this.storage = opts.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : opts.storage
    this.rng = opts.rng ?? mathRng
    this.clock = opts.clock ?? realClock()
    this.audio = opts.audio ?? silentAudio
    this.hour = opts.hour ?? null
    this.noTimers = !!opts.noTimers
    this.S = loadState(this.storage) ?? freshState()
    this.decks = new Decks(this.S.bags, this.rng)
    this.seen = new Seen(this.S.seen)
    this.X = make((k, a, nr) => this.decks.draw(k, a, nr), () => this.S.tier, this.rng)
    this.scenes = makeScenes(this.X)
    this.rules = new RuleSet<Game>(this.rng, this.S.mem).add(...allRules)
    if (opts.debug) {
      this.rules.tracer = (t) => {
        this.trace = [{ ...t, id: this.seq++, day: this.S.day }, ...this.trace].slice(0, 40)
      }
    }
    this.audio.setMuted(this.S.muted)

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
  emit(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  dispose(): void {
    for (const t of [this.idleT, this.statusT, this.ambientT, this.toastT, this.notifT]) this.clock.clearTimeout(t)
    this.listeners.clear()
  }

  save(): void {
    if (this.resetting) return
    this.S.lastSeen = this.clock.now()
    saveState(this.storage, this.S)
  }

  reset(): void {
    this.resetting = true
    this.storage?.removeItem(SAVE_KEY)
  }

  // ---------- helpers ----------
  draw = <T>(key: string, arr: readonly T[]): T => this.decks.draw(key, arr)
  rnd = (n: number): number => rndInt(this.rng, n)
  chance = (p: number): boolean => chance(this.rng, p)
  sleep = (ms: number): Promise<void> => this.clock.sleep(ms)

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
  playerLine = (gen: () => string): string => this.seen.pickFresh(gen, this.playerDecor)
  pair = (ka: string, a: readonly string[], kb: string, b: readonly string[]): string =>
    this.uniq(() => `${this.draw(ka, a)} ${this.draw(kb, b)}`)
  addrLine = (key: string, arr: readonly string[]): string => this.uniq(() => `${this.X.g('ADDR')}, ${this.draw(key, arr)}`)

  get ctx(): Ctx | null { return this.S.ctx }
  setCtx(c: Ctx | null): void { this.S.ctx = c }

  // ---------- время ----------
  realHour(): number {
    return this.hour ?? new Date(this.clock.now()).getHours()
  }
  period(): Period {
    return periodOf(this.realHour(), new Date(this.clock.now()).getDay())
  }
  isNight = (): boolean => this.period() === 'night'
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
    this.S.clock = 8 * 60 + this.rnd(180)
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
    const msg = { ...m, id: this.S.nextId++ } as Msg
    this.S.msgs.push(msg)
    this.emit()
    return msg
  }
  sys(text: string): Msg { return this.push({ kind: 'sys', text }) }

  alikMsg<M extends NewMsg>(m: M): Msg {
    this.tick(1 + this.rnd(3))
    const msg = this.push({ from: 'alik', time: fmtTime(this.S.clock), ...m } as NewMsg)
    if (msg.kind === 'text' && /брат джан/i.test(msg.text)) this.unlock('brat')
    if (msg.kind === 'text' || msg.kind === 'photo') this.noteClaims(msg.text)
    this.audio.beep()
    this.audio.vibrate(40)
    if (this.chance(this.mooChance())) this.clock.setTimeout(() => this.moo(), 300 + this.rnd(900))
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
    const out: Msg[] = []
    for (const x of items) {
      let text = typeof x === 'string' ? x : x.t
      const from = typeof x === 'string' ? who : x.w
      let fix: string | null = null
      if (!from && this.chance(this.isNight() ? 0.2 : 0.06)) {
        const t = typo(text, this.rng, this.decks)
        if (t) ({ text, fix } = t)
      }
      await this.typingFor(600 + text.length * 22)
      out.push(this.alikMsg({ kind: 'text', from: 'alik', text, legend, who: from }))
      if (fix) {
        await this.typingFor(500)
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

  unlock(key: string): void {
    if (!ACH[key] || this.S.ach[key]) return
    this.S.ach[key] = this.S.day
    this.toast = `🏆 ${ACH[key][0]}`
    this.clock.clearTimeout(this.toastT)
    this.toastT = this.clock.setTimeout(() => { this.toast = null; this.emit() }, 2600)
    this.emit()
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
    if (this.S.stats.moo >= 10) this.unlock('moo10')
    const m: Moo = { id: this.seq++, text: 'М' + 'у'.repeat(4 + this.rnd(8)), left: 5 + this.rnd(45), top: 15 + this.rnd(60) }
    this.moos.push(m)
    this.clock.setTimeout(() => { this.moos = this.moos.filter((x) => x !== m); this.emit() }, 3100)
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
  /** Первое касание: разрешить звук и запустить фон. */
  gesture(): void {
    this.audio.unlock()
    if (this.ambientT || this.noTimers) return
    const loop = () => {
      if (!this.S.muted && !this.dead) this.audio.ambient(this.period())
      this.ambientT = this.clock.setTimeout(loop, 6000)
    }
    this.ambientT = this.clock.setTimeout(loop, 6000)
  }

  // ---------- уведомления, батарея ----------
  notify(icon: string, app: string, text: string): void {
    this.notif = { id: this.seq++, icon, app, text }
    this.clock.clearTimeout(this.notifT)
    this.notifT = this.clock.setTimeout(() => { this.notif = null; this.emit() }, 4200)
    this.audio.vibrate(30)
    this.emit()
  }
  dismissNotif(): void {
    this.notif = null
    this.emit()
  }
  randomNotif(): void {
    const [icon, app, t] = this.draw('NOTIF', L.NOTIF)
    let text: string
    if (typeof t === 'function') {
      const spend = 90 + this.rnd(40) * 10
      this.S.money = Math.max(0, this.S.money - spend)
      text = t({ spend, what: this.draw('SPEND', L.SPEND), money: this.S.money })
    } else text = t
    this.notify(icon, app, text)
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
    this.clock.clearTimeout(this.idleT)
    this.clock.clearTimeout(this.statusT)
    this.unlock('dead')
    this.save()
    this.emit()
  }
  async charge(): Promise<void> {
    if (!this.dead || this.charging !== null) return
    for (let p = 1; p <= 100; p += 9) { this.charging = p; this.emit(); await this.sleep(120) }
    this.charging = null
    this.S.battery = 100
    this.dead = false
    this.busy = false
    this.emit()
    this.awayBurst(2 + this.rnd(3), 1 + this.rnd(2), 'Пока телефон заряжался')
    this.armIdle()
    this.armStatus()
  }

  // ---------- факты для правил ----------
  availableArcs(): string[] {
    return Object.keys(ARCS).filter((id) => {
      const st = this.S.arcs[id]
      return st ? st.i < ARCS[id].eps.length && this.S.day - st.last >= 6 : this.S.day >= (ARCS[id].minDay ?? 0)
    })
  }
  unfinishedArc(): string | undefined {
    return Object.keys(this.S.arcs).find((id) => this.S.arcs[id].i < ARCS[id].eps.length)
  }
  lateCount(): number {
    return this.S.promises.filter((p) => p.due != null && p.due < this.S.day && !p.asked).length
  }

  facts = (extra: Facts = {}): Facts => {
    const S = this.S
    const c = S.ctx ?? {}
    return {
      ...S.mem,
      day: S.day, tier: S.tier, mood: S.mood, sent: S.stats.sent, moo: S.stats.moo, patience: S.patience,
      period: this.period(), night: this.isNight(), offline: S.offlineDays > 0, scene: S.scene?.id,
      sincePeriod: S.stats.sent - Number(S.mem.periodAt ?? -99),
      lateCount: this.lateCount(),
      arcAvailable: this.availableArcs().length > 0,
      callbackReady: !!this.callbackCandidate(),
      arcUnfinished: this.unfinishedArc(),
      'ctx.type': c.type, 'ctx.s': c.s, 'ctx.shortTimey': c.s ? TIMEY.test(c.s) : false,
      'ctx.when': c.when, 'ctx.whenNever': c.whenNever, 'ctx.rel': c.rel?.n, 'ctx.sad': c.sad, 'ctx.revived': c.revived,
      'ctx.constr': c.constr, 'ctx.legendary': c.legendary, 'ctx.arc': c.arc,
      'arc.done': c.arc ? this.S.arcs[c.arc]?.i >= ARCS[c.arc].eps.length : false,
      'ctx.group': c.group, 'ctx.wrong': c.wrong, 'ctx.deleted': c.deleted, 'ctx.offended': c.offended,
      ...extra,
    }
  }
  saysFacts(o: Choice): Facts {
    const f: Facts = { intent: o.act, arg: o.arg }
    if (o.act === 'arc' && typeof o.arg === 'string' && ARCS[o.arg]) f.argArcDone = (this.S.arcs[o.arg]?.i ?? 0) >= ARCS[o.arg].eps.length
    return f
  }
  fire(event: string, extra: Facts = {}): Promise<Rule<Game> | null> {
    return this.rules.fire(event, this, this.facts, extra)
  }

  // ---------- варианты игрока ----------
  buildChoices(): Choice[] {
    const S = this.S
    if (S.scene) {
      const n = this.scenes[S.scene.id].nodes[S.scene.node]
      // поймать на лжи можно и посреди сцены — это её прерывает
      const catchLie = this.rules.collect('BuildChoices', this.facts()).find((r) => r.name === 'Opt_CatchLie')
      const lieOpt = catchLie ? [catchLie.offer!({ game: this, facts: this.facts(), rule: catchLie }) as Choice] : []
      return [...lieOpt, ...(n.opts ?? []).map((o, i) => {
        const gen = (): string => (typeof o.t === 'function' ? o.t(S.scene!.vars) : Array.isArray(o.t) ? this.draw<string>(`${S.scene!.id}.${S.scene!.node}.o${i}`, o.t) : o.t)
        const t = gen().length > 8 ? this.playerLine(gen) : gen()
        return { text: t, tone: o.tone ?? 'polite', scene: S.scene!.id, go: o.go } as Choice
      })]
    }
    // контекстные варианты — правила события BuildChoices (самые специфичные первыми)
    const facts = this.facts()
    const out: Choice[] = []
    for (const r of this.rules.collect('BuildChoices', facts)) {
      if (out.length >= 2) break
      const c = r.offer?.({ game: this, facts, rule: r }) as Choice | null
      if (c) out.push(c)
    }
    const P2 = (a: string, b: string) => this.playerLine(() => `${this.draw(a, D[a])} ${this.draw(b, D[b])}`)
    out.push({ text: P2('P_POL_A', 'P_POL_B'), tone: 'polite' })
    if (out.length < 3) out.push({ text: P2('P_NEU_A', 'P_NEU_B'), tone: 'neutral' })
    out.push({ text: P2('P_RUDE_A', 'P_RUDE_B'), tone: 'rude' })
    return out.slice(0, 4)
  }
  get choices(): Choice[] {
    return (this.S.choices ??= this.buildChoices())
  }

  classify(text: string): Tone {
    if (/коров|му{2,}|мыч/i.test(text)) return 'cow'
    if (/[А-ЯЁA-Z]{4,}/.test(text) || /!!|верни|обман|врать|врёшь|суд|полиц|заявлен|приеду/i.test(text)) return THREAT_RE.test(text) ? 'threat' : 'rude'
    if (/пожалуйста|извин|прост|добр|здравств|спасибо|🙏/i.test(text)) return 'polite'
    return 'neutral'
  }

  // ---------- ход игрока ----------
  async send(opt: Choice | string): Promise<void> {
    const o: Choice = typeof opt === 'string' ? { text: opt, tone: this.classify(opt) } : opt
    if (this.busy || this.dead || !o.text.trim()) return
    const S = this.S
    this.busy = true
    this.clock.clearTimeout(this.idleT)
    this.idleCount = 0
    this.clearUnread()
    if (o.act !== 'catchLie') this.forgetLie() // не поймал сразу — момент упущен
    let tone = o.tone
    if (tone === 'rude' && !o.scene && THREAT_RE.test(o.text)) tone = 'threat'
    this.tick(1 + this.rnd(5))
    const mine = this.push({ kind: 'text', from: 'me', text: o.text, time: fmtTime(S.clock) })
    this.seen.mark(o.text)
    S.stats.sent++
    this.unlock('first')
    if (this.isNight()) this.unlock('nightowl')
    if (tone === 'polite') { if (++S.politeStreak >= 10) this.unlock('saint') } else S.politeStreak = 0
    if ((tone === 'rude' || tone === 'threat') && !o.scene) { this.unlock(tone); this.shakeId++; this.audio.vibrate([80, 40, 80]) }
    if (tone === 'cow') this.unlock('cow')
    S.choices = null
    this.drain(1)
    this.save()
    if (this.dead) return

    await this.sleep((500 + this.rnd(700)) * (this.isNight() ? 2 : 1))
    this.setStatus('прочитано')

    // реакция на сообщение игрока; иногда — вместо ответа
    let reactOnly = false
    if (!o.scene && this.chance(0.18) && mine.kind === 'text') {
      await this.sleep(600)
      mine.react = this.draw('R_' + tone, L.REACT[tone] ?? L.REACT.neutral)
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
      await this.alikTurn(tone)
    } else {
      await this.alikTurn(tone)
    }

    S.patience = Math.max(0, S.patience - 1)
    if (S.patience === 0) {
      await this.sleep(600)
      this.sys(this.draw('FLOOR', FLOOR))
      S.patience = MAX_PATIENCE
      this.unlock('floor')
    }
    if (!S.ram && S.stats.sent >= 25) {
      S.ram = true
      this.sys('Алик Воздухонесян сменил фото профиля')
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

  recordPromise(p?: { text: string; d: number | null } | null): void {
    if (!p) return
    this.S.promises.push({ t: p.text, made: this.S.day, due: p.d == null ? null : this.S.day + p.d })
    if (this.S.promises.length >= 20) this.unlock('promises20')
  }
  /** «Клянусь мамой, завтра — всё отдам» + запись в журнал. */
  async promiseLine(prefix?: string): Promise<void> {
    const p = this.uniq(() => {
      const q = this.X.promise()
      return { text: prefix ? `${prefix} ${low(q.text)}.` : `${this.X.g('OATH')}, ${q.text}.`, q }
    })
    this.recordPromise(p.q)
    await this.say([p.text])
    this.S.ctx = { ...(this.S.ctx ?? {}), when: p.q.t, whenNever: p.q.d == null }
  }
  ctxFromPromise(p?: Promise3): Ctx {
    return p ? { when: p.t, whenNever: p.d == null } : {}
  }

  // ---------- ход Алика ----------
  async alikTurn(tone: Tone): Promise<void> {
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
    await this.fire('PlayerMessage', { tone })
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
    this.sys(`Прочитано в ${this.draw('READ_ONLY_TIMES', D.READ_ONLY_TIMES)}`)
    this.unlock('night')
    this.S.ctx = { type: 'readonly' }
  }

  async excuseTurn(): Promise<void> {
    const ex = this.uniq(() => this.X.excuse({ preferLong: this.S.politeStreak >= 3 }))
    if (ex.legendary) this.unlock('legend')
    this.recordPromise(ex.p)
    const msgs = await this.say(ex.texts, ex.legendary)
    this.S.ctx = {
      ...this.ctxFromPromise(ex.p), rel: ex.r, constr: ex.constr, legendary: ex.legendary,
      sad: SAD.test(ex.ev ?? ''), revived: REVIVED.test(ex.ev ?? ''),
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
    if (m.kind === 'text') m.deleted = true
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
    if (p && at >= 0) {
      const orig = m.text.slice(at, at + p.t.length)
      const repl = orig[0] !== orig[0].toLowerCase() ? cap(w) : w
      m.text = m.text.slice(0, at) + repl + m.text.slice(at + p.t.length)
      const rec = this.S.promises[this.S.promises.length - 1]
      if (rec && rec.t.includes(p.t)) { rec.t = rec.t.replace(p.t, w); rec.due = null }
      this.S.ctx = { ...this.S.ctx, when: w, whenNever: true }
    } else {
      m.text = m.text.replace(/[.!]?$/, this.draw('EDIT_SUFFIX', L.EDIT_SUFFIX) + '.')
    }
    m.edited = true
    this.unlock('edited')
    this.emit()
  }

  async groupChat(): Promise<void> {
    await this.sleep(600)
    this.sys('Алик добавил вас в группу «Стройка под ключ 🏗️ Семья»')
    const members = shuffle(this.rng, Object.keys(GROUP)).slice(0, 4 + this.rnd(3))
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
    this.S.mem.periodAt = this.S.stats.sent
    await this.say([this.addrLine('PER_' + p, L.PERIOD[p])])
    if (p === 'friday' && this.chance(0.5)) this.audio.feast((a) => this.draw('FEAST', a))
  }

  // ---------- бухгалтерия лжи ----------
  /** Запомнить, что Алик «заявил»; если это противоречит сказанному раньше — дать игроку поймать его. */
  noteClaims(text: string): void {
    const mem = this.S.mem
    const found = CLAIMS.filter((c) => c.re.test(text))
    for (const c of found) {
      const old = CLAIMS.find((o) => mem['said.' + o.key] !== undefined && conflicts(o.key, c.key) && !mem['caught.' + pairKey(o.key, c.key)])
      if (old) {
        mem['lie.old'] = old.key
        mem['lie.new'] = c.key
        mem['lie.kind'] = old.group === 'money' ? 'money' : ({ grandpa_dead: 'grandpa', grandpa_alive: 'grandpa', customer_owes: 'customer', customer_paid: 'customer', sent: 'sent', no_money: 'sent' } as Record<string, string>)[c.key] ?? 'other'
      }
    }
    for (const c of found) if (mem['said.' + c.key] === undefined) mem['said.' + c.key] = this.S.day
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
    if (!c) return this.excuseTurn()
    this.S.mem['cb.' + c.key] = this.S.day
    const upd = this.draw('CB_' + c.key, c.updates!)
    await this.say([this.uniq(() => `${this.X.g('ADDR')}, ${this.draw('CB_OPEN', CALLBACK_OPEN)} ${c.say}? ${upd}`)])
    this.unlock('memory')
    await this.promiseLine()
  }

  // ---------- сериалы ----------
  nextArc(): string | null {
    const ids = this.availableArcs()
    return ids.length ? ids[this.rnd(ids.length)] : null
  }
  async playArc(id: string): Promise<void> {
    const st = (this.S.arcs[id] ??= { i: 0, last: -99 })
    const ep = ARCS[id].eps[st.i]
    st.i++
    st.last = this.S.day
    this.S.ctx = { arc: id }
    for (const m of ep.m) this.seen.mark(typeof m === 'string' ? m : m.t)
    await this.say(ep.m)
    if (ep.fx?.debt) this.S.debt += ep.fx.debt
    if (ep.sys) { await this.sleep(500); this.sys(ep.sys) }
    if (ep.fx?.ach) this.unlock(ep.fx.ach)
    if (ep.then === 'promise') await this.promiseLine()
  }

  // ---------- сцены ----------
  async startScene(): Promise<void> {
    const sid = this.draw('SCENES', Object.keys(this.scenes))
    await this.enterNode(sid, this.scenes[sid].start)
  }
  async enterNode(sid: string, nid: string | null): Promise<void> {
    const S = this.S
    if (nid === null) { S.scene = null; S.ctx = null; await this.say([this.uniq(this.X.short)]); return }
    if (nid.includes(':')) [sid, nid] = nid.split(':')
    const sc = this.scenes[sid]
    if (!S.scene || S.scene.id !== sid) S.scene = { id: sid, node: nid, vars: sc.init ? sc.init(this.rng) : {} }
    S.scene.node = nid
    const n = sc.nodes[nid]
    const v = S.scene.vars
    const res = (x: Line) => (typeof x === 'function' ? x(v) : x)
    const gen = (key: string, arr: Line | Line[]) => () => res(Array.isArray(arr) ? this.draw(`${sid}.${nid}.${key}`, arr) : arr)
    const variant = (key: string, arr: Line[]) => this.uniq(gen(key, arr))

    const fx = n.fx ?? {}
    if (fx.days) this.nextDay(fx.days)
    if (fx.debt) S.debt += fx.debt
    if (fx.mood) this.mood(fx.mood)
    if (fx.barter) { S.debt -= v.v; S.items.push(v.n) }
    if (fx.invoice) S.debt -= v.total
    if (fx.ach) this.unlock(fx.ach)
    if (n.sys) { await this.sleep(700); this.sys(gen('sys', n.sys)()) }
    if (n.a) await this.say([variant('a', n.a)], false, n.who)
    if (n.doc) {
      await this.typingFor(2000, 'отправляет документ…')
      this.alikMsg({ kind: 'doc', from: 'alik', title: `АКТ ВЗАИМОЗАЧЁТА № ${100 + this.rnd(900)}`, rows: v.rows, total: v.total })
      await this.sleep(600)
      this.sys(`Алик вычел из долга ${v.total.toLocaleString('ru-RU')} ₽ по акту.`)
    }
    if (n.a2) await this.say([variant('a2', n.a2)], false, n.who2)
    if (n.sys2) { await this.sleep(700); this.sys(gen('sys2', n.sys2)()) }
    if (n.then === 'moo') { await this.sleep(400); this.moo() }
    if (n.then === 'transfer') await this.transfer()
    if (n.then === 'promise') await this.promiseLine()
    if (!n.opts) { S.scene = null; if (n.then !== 'promise') S.ctx = null }
    this.emit()
  }

  // ---------- допработа ----------
  async answerJob(id: number, yes: boolean): Promise<void> {
    const m = this.S.msgs.find((x) => x.id === id)
    if (!m || m.kind !== 'job' || m.answered || this.busy || this.dead) return
    m.answered = true
    this.busy = true
    this.clock.clearTimeout(this.idleT)
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
  }

  // ---------- Алик живёт сам ----------
  armIdle(): void {
    this.clock.clearTimeout(this.idleT)
    if (this.noTimers || this.dead || this.idleCount >= 3) return
    this.idleT = this.clock.setTimeout(() => void this.onIdle(), (20000 + this.rnd(40000)) * (this.idleCount + 1))
  }
  sheetOpen = false
  async onIdle(): Promise<void> {
    if (this.busy || this.dead || this.sheetOpen || (typeof document !== 'undefined' && document.hidden)) return this.armIdle()
    this.idleCount++
    this.busy = true
    this.drain(1)
    if (!this.dead) {
      await this.fire('AlikIdle')
      this.S.choices = this.buildChoices()
      this.save()
    }
    this.busy = false
    this.emit()
    if (!this.dead) { this.restStatus(); this.armIdle() }
  }
  armStatus(): void {
    this.clock.clearTimeout(this.statusT)
    if (this.noTimers || this.dead) return
    this.statusT = this.clock.setTimeout(async () => {
      if (!this.busy && !this.dead && this.S.offlineDays === 0) {
        if (this.chance(0.2)) {
          // «печатает…» — и ничего не приходит
          this.typing = 'печатает…'
          this.setStatus('печатает…', 'typing')
          await this.sleep(1500 + this.rnd(2500))
          this.typing = null
          if (!this.busy) this.setStatus('в сети', 'online')
        } else if (this.isNight()) this.setStatus(`был(а) в ${this.realHHMM()}`)
        else this.setStatus(this.draw('WANDER', STATUS_WANDER), 'online')
      }
      this.armStatus()
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
  private seed(): void {
    this.push({ kind: 'sep', text: fmtDate(0) })
    this.push({ kind: 'text', from: 'alik', time: '18:02', text: SEED_INTRO })
    this.push({ kind: 'text', from: 'me', time: '18:05', text: SEED_REPLY })
    this.sys(`…прошло ${this.S.day} дня…`)
    this.push({ kind: 'sep', text: fmtDate(this.S.day) })
  }

  // для отображения
  get gameDate(): string {
    return dateOf(this.S.day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }
  get clockText(): string { return fmtTime(this.S.clock) }
  castOf(who?: string) { return who ? CAST[who] : undefined }
}
