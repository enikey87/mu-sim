// Линтер свипа «показал — ответить нельзя» (#1487). Класс рождался находкой за находкой
// (#1192/#1292/#1382/#1410): карточка или сцена обращалась к игроку, а варианта ответа не было.
// Реестр `reply-windows.ts` держит всё, что окна не имеет по замыслу; здесь — полнота реестра:
//   - карточка ленты: окно (штамп из EVENT_SOURCES) или запись в SILENT_CARDS;
//   - событие телефона: запись в PHONE_CARD_NOTES (окно, свои кнопки или фон);
//   - развязка сцены: запись в SCENE_ENDINGS, если у узла нет штампа окна;
//   - любой `stamp:` в контенте: запись в EVENT_SOURCES или SILENT_STAMPS.
// Новая карточка, сцена или окно без классификации — красный сюит, а не находка рецензента через раунд.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeScenes } from './scenes'
import { make } from './excuses'
import { Decks } from '../engine/deck'
import { seededRng } from '../engine/rng'
import { valueOf, type Entry } from '../engine/rules'
import { PHONE_EVENTS } from '../engine/state'
import { NOTIF } from './life'
import { DEBUT_SLOT, EVENT_SOURCES, FIRST_WINDOWS } from './first-windows'
import { PHONE_CARD_NOTES, SCENE_ENDINGS, SILENT_CARDS, SILENT_STAMPS, unclassifiedCards } from './reply-windows'
import * as MEMKEYS from './memkeys'

/** Развязки сцен из кода: узлы без `opts` и их штампы (штамп → окно, линтер сверяет с EVENT_SOURCES). */
/** Штампы, у которых есть окно: источники-события, дебюты (общий слот — не имя факта) и окна первого сообщения. */
const windowStamps = (): Set<string> => new Set([
  ...EVENT_SOURCES.map((e) => e.at),
  ...FIRST_WINDOWS.flatMap((w) => (w.at && w.at !== DEBUT_SLOT ? [w.at] : [])),
])

const sceneEndings = (): Array<{ node: string; stamps: string[] }> => {
  const decks = new Decks({}, seededRng(1))
  const X = make(<T,>(k: string, a: readonly Entry<T>[], nr?: boolean) => decks.draw(k, a.map(valueOf), nr), () => 0, seededRng(2))
  const scenes = makeScenes(X)
  const out: Array<{ node: string; stamps: string[] }> = []
  for (const [id, sc] of Object.entries(scenes)) {
    for (const [node, n] of Object.entries(sc.nodes)) {
      if (n.opts && n.opts.length) continue
      const stamps = [...(n.a ?? []), ...(n.a2 ?? [])]
        .map((e) => valueOf(e as Entry<unknown>))
        .flatMap((v) => (v && typeof v === 'object' && 'stamp' in v ? [String((v as { stamp: string }).stamp)] : []))
      out.push({ node: `${id}/${node}`, stamps })
    }
  }
  return out
}

/** Все штампы контента: `stamp:` — всегда простое имя константы memkeys (проверка ниже это требует). */
const contentStamps = (): Array<{ where: string; name: string; at: string }> => {
  const files = readdirSync('src/content', { recursive: true, encoding: 'utf-8' })
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
  const out: Array<{ where: string; name: string; at: string }> = []
  for (const f of files) {
    const body = readFileSync(join('src/content', f), 'utf-8')
    body.split('\n').forEach((line, i) => {
      const m = /\bstamp: ([A-Za-z0-9_]+)/.exec(line)
      if (!m) return
      const at = (MEMKEYS as Record<string, unknown>)[m[1]]
      out.push({ where: `${f}:${i + 1}`, name: m[1], at: typeof at === 'string' ? at : '' })
    })
  }
  return out
}

describe('реестр «показал — ответить нельзя» (#1487)', () => {
  it('каждая карточка ленты: окно (штамп зарегистрирован) или запись в SILENT_CARDS с причиной', () => {
    const unclassified = unclassifiedCards(NOTIF, windowStamps())
    expect(unclassified, 'карточки без окна и без классификации').toEqual([])
    expect(NOTIF.length, 'карточек ленты не нашлось — проверка пустеет').toBeGreaterThan(30)
    for (const c of SILENT_CARDS) expect(c.why.trim().length, `«${c.card}»: причина пуста`).toBeGreaterThan(8)
  })

  it('SILENT_CARDS не протух: каждая запись — настоящая карточка без штампа', () => {
    const byText = new Map(NOTIF.map((n) => [n.t, n]))
    const bad = SILENT_CARDS.filter((c) => {
      const n = byText.get(c.card)
      return !n || n.stamp !== undefined
    }).map((c) => c.card)
    expect(bad, 'записи без карточки или карточка уже получила окно').toEqual([])
    expect(new Set(SILENT_CARDS.map((c) => c.card)).size, 'дубли в SILENT_CARDS').toBe(SILENT_CARDS.length)
  })

  it('каждое событие телефона (PhoneEvent) записано: окно, свои кнопки или фон', () => {
    const noted = new Set(PHONE_CARD_NOTES.map((p) => p.event))
    const events = [...PHONE_EVENTS]
    expect(events.filter((e) => !noted.has(e)), 'события телефона без записи').toEqual([])
    expect(PHONE_CARD_NOTES.filter((p) => !events.includes(p.event)).map((p) => p.event), 'записи о несуществующем событии').toEqual([])
    for (const p of PHONE_CARD_NOTES) expect(p.why.trim().length, `${p.event}: причина пуста`).toBeGreaterThan(8)
  })

  it('каждая развязка сцены: штамп окна из EVENT_SOURCES или запись в SCENE_ENDINGS', () => {
    const stamps = windowStamps()
    const endings = new Set(SCENE_ENDINGS.map((s) => s.node))
    const leaves = sceneEndings()
    expect(leaves.length, 'развязок не нашлось — проверка пустеет').toBeGreaterThan(60)
    // окно у развязки откр��вает любой штамп события: рядом с ним бывает служебный штамп (money.at)
    const unclassified = leaves.filter((l) => (l.stamps.length ? !l.stamps.some((s) => stamps.has(s)) : !endings.has(l.node)))
      .map((l) => (l.stamps.length ? `${l.node}: штамп ${l.stamps.join(',')} без окна` : l.node))
    expect(unclassified, 'развязки без окна и без классификации').toEqual([])
    const nodes = new Set(leaves.map((l) => l.node))
    expect(SCENE_ENDINGS.filter((s) => !nodes.has(s.node)).map((s) => s.node), 'записи о несуществующей развязке').toEqual([])
    for (const s of SCENE_ENDINGS) expect(s.why.trim().length, `${s.node}: причина пуста`).toBeGreaterThan(8)
  })

  it('каждый `stamp:` контента: окно из EVENT_SOURCES или запись в SILENT_STAMPS', () => {
    const windowed = windowStamps()
    const silence = new Set(SILENT_STAMPS.map((s) => s.at))
    const stamps = contentStamps()
    expect(stamps.length, 'штампов не нашлось — проверка пустеет').toBeGreaterThan(20)
    const unresolved = stamps.filter((s) => !s.at).map((s) => `${s.where}: ${s.name}`)
    expect(unresolved, 'штамп не разрешается в константу memkeys — линтер слепнет, пишите именем').toEqual([])
    const unclassified = stamps.filter((s) => !windowed.has(s.at) && !silence.has(s.at))
      .map((s) => `${s.where}: ${s.name} (${s.at})`)
    expect(unclassified, 'штампы без окна и без классификации').toEqual([])
  })
})
