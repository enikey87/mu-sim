// Плейтест для поиска несостыковок: бот со своим seeded-генератором играет партию, каждое действие записывается.
// Та же версия кода + тот же seed = та же партия; запись действий проигрывается заново (replay) и сверяется.
import { Game } from '../engine/game'
import { manualClock } from '../engine/clock'
import { seededRng, type Rng } from '../engine/rng'
import { CAST } from '../content/arcs'
import { ENDINGS } from '../content/finales'
import type { Choice, Msg } from '../engine/state'

export type Style = 'curious' | 'polite' | 'hothead'
export const STYLES: Style[] = ['curious', 'polite', 'hothead']
const HOURS = [14, 20, 9, 2, 17, 12]

/** Что бот сделал за ход: выбрал вариант i из offered, ответил на допработу, зарядил телефон, промолчал. */
export type Act =
  | { kind: 'send'; i: number; offered: string[]; at: number }
  | { kind: 'job'; yes: boolean; at?: number }
  | { kind: 'charge' }
  | { kind: 'idle' }

/** Что игрок видит и слышит вне чата («Мууу» на фоне, уведомления телефона): at — индекс сообщения, перед которым. */
export interface Aside { at: number; text: string }
export interface Played { seed: number; style: Style; hour: number; acts: Act[]; asides: Aside[]; game: Game }

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

/** Сыграть партию ботом (или повторить записанные действия replay); watch — посмотреть на игру до первого хода. */
export async function playtest(seed: number, turns: number, replay?: Act[], watch?: (game: Game) => void): Promise<Played> {
  const style = STYLES[seed % STYLES.length]
  const hour = HOURS[seed % HOURS.length]
  const clock = manualClock(Date.parse('2026-09-14T12:00:00Z') + (seed % 7) * 864e5)
  const game = new Game({ storage: null, clock, rng: seededRng(seed), noTimers: true, hour })
  watch?.(game)
  const bot = seededRng(seed * 7919 + 17)
  const acts: Act[] = []
  let ending: string | null = null
  const asides: Aside[] = []
  const notify = game.notify.bind(game)
  game.notify = (icon, app, text) => { asides.push({ at: game.S.msgs.length, text: `(уведомление телефона: ${icon} ${app} — ${text})` }); notify(icon, app, text) }
  const next = (): Act => {
    if (game.dead) return { kind: 'charge' }
    const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)
    if (job) return { kind: 'job', yes: bot.random() < 0.5, at: game.S.msgs.length }
    if (game.S.stats.sent >= 5 && bot.random() < PROFILE[style].idle) return { kind: 'idle' }
    const offered = game.choices.map((c) => c.text)
    return { kind: 'send', i: pick(bot, style, game.choices), offered, at: game.S.msgs.length }
  }
  for (let k = 0; k < (replay?.length ?? turns); k++) {
    const a = replay ? replay[k] : next()
    if (a.kind === 'send' && replay) {
      const now = game.choices.map((c) => c.text)
      if (now.join('\n') !== a.offered.join('\n')) throw new Error(`replay разошёлся на ходу ${k}: ${JSON.stringify(now)}`)
    }
    acts.push(a)
    if (a.kind === 'charge') await game.charge()
    else if (a.kind === 'job') { const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)!; await game.answerJob(job.id, a.yes) }
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
      game.closeEnding() // как игрок: закрыть экран итогов — после Дня выплаты это включает эндгейм
    }
    const moo = game.S.stats.moo
    clock.runTimers() // «Мууу» и прочее отложенное
    if (game.S.stats.moo > moo) asides.push({ at: game.S.msgs.length, text: '(на фоне кто-то протяжно: «Мууууу»)' })
  }
  return { seed, style, hour, acts, asides, game }
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
  }
}

/** Переписка партии как текст: сообщения по порядку, перед репликой игрока — варианты, из которых он выбирал. */
export function transcript(p: Played): string {
  const offers = new Map<number, string>()
  for (const a of p.acts) if (a.kind === 'send') offers.set(a.at, a.offered.map((o, i) => `${i === a.i ? '▶' : ' '} ${o}`).join('\n    '))
  const jobs = new Set(p.acts.flatMap((a) => (a.kind === 'job' && a.at !== undefined ? [a.at] : [])))
  const ending = p.game.S.ending ? ENDINGS.find((e) => e.id === p.game.S.ending) : null
  const out = [`Партия ${p.seed}: сообщений игрока — ${p.game.S.stats.sent}, в конце — ${p.game.S.day}-й день ожидания денег${ending ? `, концовка «${ending.title}»` : ''}`]
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
