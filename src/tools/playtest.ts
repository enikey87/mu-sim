// Плейтест для поиска несостыковок: бот со своим seeded-генератором играет партию, каждое действие записывается.
// Та же версия кода + тот же seed = та же партия; запись действий проигрывается заново (replay) и сверяется.
import { Game } from '../engine/game'
import { manualClock } from '../engine/clock'
import { seededRng, type Rng } from '../engine/rng'
import { allRules } from '../content/rules'
import { CAST } from '../content/arcs'
import { ENDINGS } from '../content/finales'
import { NOTIF } from '../content/life'
import { alikDead } from '../content/memkeys'
import { type Criterion, type Rule } from '../engine/rules'
import type { Choice, Msg, NewMsg } from '../engine/state'

export type Style = 'curious' | 'polite' | 'hothead'
export const STYLES: Style[] = ['curious', 'polite', 'hothead']
const HOURS = [14, 20, 9, 2, 17, 12]

/** Что бот сделал за ход: выбрал вариант i из offered, ответил на допработу, зарядил телефон, промолчал. */
export type Act =
  | { kind: 'send'; i: number; offered: string[]; at: number }
  | { kind: 'job'; yes: boolean | 'mirror'; at?: number }
  | { kind: 'card'; pick: 'take' | 'sell' | 'later' }
  | { kind: 'charge' }
  | { kind: 'idle' }

/** Что игрок видит и слышит вне чата («Мууу» на фоне, уведомления телефона): at — индекс сообщения, перед которым. */
export interface Aside { at: number; text: string }
/** Снимок фактов после хода — для оракула; в расшифровку seed-*.txt не попадает. */
export interface WorldFrame {
  turn: number
  at: number
  day: number
  /** Факты на начало хода: иначе ход, объявивший событие, выглядит его нарушением. */
  before: Record<string, unknown>
  mem: Record<string, unknown>
  fired: { event: string; chosen: string[] }[]
  /** Кто говорил (w), чем (k) и какое правило это произнесло (r; null — вне правил) — оракул судит речь по правилу. */
  said: { w: string; k: string; r: string | null }[]
  sys: string[]
  asides: string[]
  /** Пачка непрочитанных: приходит мимо движка правил, потому и отдельным полем. */
  away: string[]
  notif: { text: string; fails: string[] }[]
}
export interface Played { seed: number; style: Style; hour: number; acts: Act[]; asides: Aside[]; world: WorldFrame[]; game: Game }

/** Ключи мира для оракула; сериалы — из `facts()`, они живут в `S.arcs`, а не в `S.mem`. */
const WORLD_KEYS = ['alik_dead', 'mourning', 'blood.given', 'said.friday', 'endgame.mutes'] as const
const WORLD_PREFIXES = ['arc.', 'finale.'] as const

const worldFacts = (game: Game): Record<string, unknown> => {
  const facts = game.facts()
  const mem: Record<string, unknown> = {}
  for (const k of Object.keys(facts)) if (WORLD_PREFIXES.some((p) => k.startsWith(p))) mem[k] = facts[k]
  for (const k of WORLD_KEYS) if (game.S.mem[k] !== undefined) mem[k] = game.S.mem[k]
  return mem
}

/** Условие требует факт (не «факта нет»): `missing(alik_dead)` — это правило живого Алика, а не гейт смерти. */
export const requiresKey = (c: Criterion, key: string): boolean =>
  c.op === 'all' ? (c.all ?? []).some((x) => requiresKey(x, key)) : c.key === key && (c.op === 'exist' || (c.op === '==' && c.value === true))

/** Правила с гейтом `alik_dead`: оракул судит о реплике по этому списку, а не по имени. Считается по правилам партии — тест может снять гейт. */
export const deathGated = (rules: readonly Rule<Game>[]): string[] => rules.filter((r) => (r.when ?? []).some((c) => requiresKey(c, alikDead))).map((r) => r.name).sort()
export const DEATH_GATED: readonly string[] = deathGated(allRules)

/** Ложные условия самой строки уведомления: `holds` — разбор выборщика, иначе именованные врут. */
export function notifFails(game: Game, app: string, text: string): string[] {
  const entry = NOTIF.find((n) => n.app === app && n.t === text)
  if (!entry) return []
  return (entry.when ?? []).filter((c) => !game.holds(c)).map((c) => c.key)
}

/** Характер бота: доля контекстных вариантов, доля грубости, шанс промолчать (Алик пишет сам). */
const PROFILE: Record<Style, { ctx: number; rude: number; idle: number; polite: number }> = {
  curious: { ctx: 0.75, rude: 0.03, idle: 0.06, polite: 0 },
  polite: { ctx: 0.4, rude: 0, idle: 0.04, polite: 0.7 },
  hothead: { ctx: 0.4, rude: 0.3, idle: 0.03, polite: 0 },
}

function pick(rng: Rng, style: Style, cs: Choice[]): number {
  const p = PROFILE[style]
  const idx = (f: (c: Choice) => boolean) => cs.map((c, i) => (f(c) ? i : -1)).filter((i) => i >= 0)
  const any = (ids: number[]) => ids[Math.floor(rng.random() * ids.length)]
  const ctx = idx((c) => !!(c.act || c.scene))
  if (ctx.length && rng.random() < p.ctx) return any(ctx)
  const rude = idx((c) => c.tone === 'rude' || c.tone === 'threat')
  if (rude.length && rng.random() < p.rude) return any(rude)
  const polite = idx((c) => c.tone === 'polite')
  if (polite.length && rng.random() < p.polite) return any(polite)
  const safe = idx((c) => c.tone !== 'rude' && c.tone !== 'threat')
  return safe.length ? any(safe) : 0
}

/** Открытое предложение банка в ленте (кнопки не нажаты). */
export const openOffer = (game: Game): Extract<Msg, { kind: 'card' }> | undefined =>
  game.S.msgs.find((m): m is Extract<Msg, { kind: 'card' }> => m.kind === 'card' && !!m.offer && !m.answered)

/** Сыграть партию ботом (или повторить записанные действия replay); watch — посмотреть на игру до первого хода. */
/** Атрибуция речи для оракула: сообщение → правило, чей respond сейчас идёт (#229/#268).
 *  Вложенный `fire` сохраняет и возвращает прежнюю атрибуцию — иначе `Turn_Quest` → `PickQuest`
 *  обнуляет имя и `excuseTurn()` пишется как ничья. */
export function attachSpeechAttribution(game: Game): {
  ruleOf: Map<number, string | null>
  clearRule: () => void
} {
  let lastRule: string | null = null
  game.rules.onRespond = (r, ok) => { lastRule = ok ? r.name : null }
  const fire = game.rules.fire.bind(game.rules)
  game.rules.fire = (async (...args: Parameters<typeof fire>) => {
    const prev = lastRule
    try { return await fire(...args) }
    finally { lastRule = prev }
  }) as typeof game.rules.fire
  const ruleOf = new Map<number, string | null>()
  const push = game.push.bind(game)
  game.push = ((m: NewMsg) => { const msg = push(m); ruleOf.set(msg.id, lastRule); return msg }) as typeof game.push
  return { ruleOf, clearRule: () => { lastRule = null } }
}

export async function playtest(seed: number, turns: number, replay?: Act[], watch?: (game: Game) => void | Promise<void>): Promise<Played> {
  const style = STYLES[seed % STYLES.length]
  const hour = HOURS[seed % HOURS.length]
  const clock = manualClock(Date.parse('2026-09-14T12:00:00Z') + (seed % 7) * 864e5)
  const game = new Game({ storage: null, clock, rng: seededRng(seed), noTimers: true, hour })
  const bot = seededRng(seed * 7919 + 17)
  const acts: Act[] = []
  let ending: string | null = null
  const asides: Aside[] = []
  const world: WorldFrame[] = []
  const firedBuf: WorldFrame['fired'] = []
  const { ruleOf, clearRule } = attachSpeechAttribution(game)
  game.rules.tracer = (t) => {
    if (t.chosen.length) firedBuf.push({ event: t.event, chosen: [...t.chosen] })
  }
  const notifBuf: WorldFrame['notif'] = []
  const notify = game.notify.bind(game)
  game.notify = (icon, app, text, card) => {
    // только показанное: дедуп банка иначе попадает в расшифровку (#265); карточка в ленте — сообщение, не асайд (#287)
    if (!notify(icon, app, text, card)) return false
    if (Game.isBanner(app)) asides.push({ at: game.S.msgs.length, text: `(уведомление телефона: ${icon} ${app} — ${text})` })
    notifBuf.push({ text: `${app} — ${text}`, fails: notifFails(game, app, text) })
    return true
  }
  const awayBuf: WorldFrame['away'] = []
  const awayIdx = new Set<number>()
  const burst = game.awayBurst.bind(game)
  game.awayBurst = async (n, days, why) => {
    const from = game.S.msgs.length
    await burst(n, days, why)
    for (let i = from; i < game.S.msgs.length; i++) awayIdx.add(i)
    // разделитель дня ставит сама пауза, а не Алик: в «пачке» его нет
    awayBuf.push(...game.S.msgs.slice(from).filter((m) => m.kind !== 'sep').map(line))
  }
  // завязка из конструктора — не ход: иначе первый кадр приписывает её речь «никакому правилу»
  let msgAt = game.S.msgs.length
  let asideAt = 0
  // watch — после приборов: сценарий теста до первой партии иначе не попадает в дамп
  await watch?.(game)
  let memAt: Record<string, unknown> = worldFacts(game)
  const snap = (turn: number) => {
    const mem = worldFacts(game)
    const range = game.S.msgs.slice(msgAt)
    const said = range.flatMap((m, i) => {
      if (m.kind === 'sep' || m.kind === 'sys' || m.kind === 'card' || awayIdx.has(msgAt + i)) return []
      return [{ w: m.from === 'me' ? 'me' : (('who' in m && m.who) || 'alik'), k: m.kind as string, r: ruleOf.get(m.id) ?? null }]
    })
    world.push({
      turn, at: game.S.msgs.length, day: game.S.day, before: memAt, mem,
      fired: firedBuf.splice(0), said, sys: range.filter((m) => m.kind === 'sys').map((m) => m.text),
      asides: asides.slice(asideAt).map((a) => a.text), away: awayBuf.splice(0), notif: notifBuf.splice(0),
    })
    msgAt = game.S.msgs.length
    asideAt = asides.length
    memAt = mem
  }
  const next = (): Act => {
    if (game.battery.dead) return { kind: 'charge' }
    const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)
    if (job) {
      // иногда зеркало — иначе оракул не видит его в партиях (#256)
      const yes: boolean | 'mirror' = game.canMirror() && bot.random() < 0.25 ? 'mirror' : bot.random() < 0.5
      return { kind: 'job', yes, at: game.S.msgs.length }
    }
    // карточка банка с кнопками: чаще выбирает, иногда откладывает или пишет дальше, не выбрав
    if (openOffer(game) && bot.random() < 0.7) { const r = bot.random(); return { kind: 'card', pick: r < 0.5 ? 'take' : r < 0.85 ? 'sell' : 'later' } }
    if (game.S.stats.sent >= 5 && bot.random() < PROFILE[style].idle) return { kind: 'idle' }
    const offered = game.choices.map((c) => c.text)
    return { kind: 'send', i: pick(bot, style, game.choices), offered, at: game.S.msgs.length }
  }
  for (let k = 0; k < (replay?.length ?? turns); k++) {
    const a = replay ? replay[k] : next()
    clearRule() // речь до первого выбора правила в этом ходе — ничья
    if (a.kind === 'send' && replay) {
      const now = game.choices.map((c) => c.text)
      if (now.join('\n') !== a.offered.join('\n')) throw new Error(`replay разошёлся на ходу ${k}: ${JSON.stringify(now)}`)
    }
    acts.push(a)
    if (a.kind === 'charge') await game.battery.charge()
    else if (a.kind === 'job') { const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)!; await game.answerJob(job.id, a.yes) }
    else if (a.kind === 'card') game.answerCard(openOffer(game)!.id, a.pick)
    else if (a.kind === 'idle') await game.onIdle()
    else {
      await game.send(game.choices[a.i])
      // перед репликой игрока может встать разделитель дня — варианты привязываем к самой реплике
      if (!replay) a.at = game.S.msgs.findIndex((m, i) => i >= a.at && m.kind === 'text' && m.from === 'me')
    }
    // концовка — экран с итогами: дальше игрок играет уже «после финала», и это видно в расшифровке
    if (game.S.ending && game.S.ending !== ending) {
      ending = game.S.ending
      const e = ENDINGS.find((x) => x.id === ending)
      asides.push({ at: game.S.msgs.length, text: `(экран концовки: «${e?.title ?? ending}». Игрок закрыл экран)` })
      await game.closeEnding() // как игрок: закрыть экран итогов — после Дня выплаты это включает эндгейм
    }
    const moo = game.S.stats.moo
    clock.runTimers() // «Мууу» и прочее отложенное
    if (game.S.stats.moo > moo) asides.push({ at: game.S.msgs.length, text: '(на фоне кто-то протяжно: «Мууууу»)' })
    snap(k)
  }
  return { seed, style, hour, acts, asides, world, game }
}

/** Машиночитаемый лог фактов для оракула (рядом с seed-*.txt, не вместо). */
export function worldDump(p: Played): object {
  const dead = p.world.filter((f) => f.mem.alik_dead).length
  const mutes = p.world.some((f) => Number(f.mem['endgame.mutes'] ?? 0) > 0)
  return {
    seed: p.seed,
    rules: { deathGated: deathGated(p.game.rules.all) },
    coverage: {
      dead_frames: dead,
      had_mute: mutes,
      had_blood: p.world.some((f) => f.mem['blood.given']),
      had_friday: p.world.some((f) => f.mem['said.friday']),
      // окно серии, а не её факт: на старой ветке факт гас по таймеру, а серия оставалась открытой
      frames_with_arc: p.world.filter((f) => f.mem['arc.alik_death'] !== undefined).length,
      had_razmik_finale: p.world.some((f) => f.mem['finale.razmik'] !== undefined),
      notifications: p.world.reduce((n, f) => n + f.notif.length, 0),
      away_messages: p.world.reduce((n, f) => n + f.away.length, 0),
      // пачка была, даже если мир велел молчать: событий AlikAway, а не сообщений
      away_events: p.world.reduce((n, f) => n + f.fired.filter((h) => h.event === 'AlikAway').length, 0),
    },
    frames: p.world,
  }
}

function line(m: Msg): string {
  const t = m.time ? `[${m.time}] ` : ''
  switch (m.kind) {
    case 'sep': return `\n—— ${m.text} ——`
    case 'sys': return `[система] ${m.text}`
    case 'text': {
      const who = m.from === 'me' ? 'Я' : m.who ? (CAST[m.who]?.name ?? m.who) : 'Алик'
      const marks = [m.deleted && 'удалено', m.edited && 'изменено', m.react && `реакция Алика ${m.react}`].filter(Boolean)
      return `${t}${who}: ${m.text}${marks.length ? `  (${marks.join(', ')})` : ''}`
    }
    case 'transfer': return `${t}Алик: 💸 перевод ${m.amount ?? 50} ₽ — «${m.text}»`
    case 'voice': return `${t}Алик: 🎤 голосовое 0:${String(m.len).padStart(2, '0')}${m.feast ? ' (шум застолья)' : ''}`
    case 'photo': return `${t}Алик: 📷 фото «платёжки» (на снимке — баран на фоне Арарата), подпись: ${m.text}`
    case 'sticker': return `${t}Алик: [стикер ${m.e} ${m.c}]`
    case 'fwd': return `${t}Алик: ↪ переслано от «${m.f}»: ${m.text}`
    case 'doc': return `${t}Алик: 📄 ${m.title}: ${m.rows.map(([r, n]) => `${r} — ${n} ₽`).join('; ')}. Итого ${m.total} ₽`
    case 'job': return `${t}Алик: 🛠 допработа: ${m.text}${m.answered ? '' : ' (без ответа)'}`
    case 'card': {
      const btns = m.offer ? ` [кнопки: ${[m.offer.take, m.offer.sell, 'Не сейчас'].filter(Boolean).join(' / ')}]` : ''
      return `(карточка в ленте: ${m.icon} ${m.app} — ${[m.text, ...(m.lines ?? [])].join(' · ')}${btns}${m.result ? ` → ${m.result}` : ''})`
    }
  }
}

/** Переписка партии как текст: сообщения по порядку, перед репликой игрока — варианты, из которых он выбирал. */
export function transcript(p: Played): string {
  const offers = new Map<number, string>()
  for (const a of p.acts) if (a.kind === 'send') offers.set(a.at, a.offered.map((o, i) => `${i === a.i ? '▶' : ' '} ${o}`).join('\n    '))
  const jobs = new Set(p.acts.flatMap((a) => (a.kind === 'job' && a.at !== undefined ? [a.at] : [])))
  const ending = p.game.S.ending ? ENDINGS.find((e) => e.id === p.game.S.ending) : null
  const sent = p.game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'me').length
  const out = [`Партия ${p.seed}: сообщений игрока — ${sent}, в конце — ${p.game.S.day}-й день ожидания денег${ending ? `, концовка «${ending.title}»` : ''}`]
  const aside = (i: number) => { for (const a of p.asides) if (a.at === i) out.push(a.text) }
  p.game.S.msgs.forEach((m, i) => {
    aside(i)
    const o = offers.get(i)
    if (o && m.kind === 'text' && m.from === 'me') out.push(`    варианты:\n    ${o}`)
    if (jobs.has(i)) out.push('    (ответ на допработу)')
    out.push(line(m))
  })
  aside(p.game.S.msgs.length)
  return out.join('\n')
}
