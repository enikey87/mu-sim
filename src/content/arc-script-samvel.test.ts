// Лист чтения арки «Свадьба дяди Самвела»: цитаты листа — дословно из источника, реплики источника — целиком в листе (#641).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ARCS, type ArcMsg } from './arcs'
import { DEFAULT_FINALE, FINALES } from './finales'
import { valueOf } from './fact'

const ARC = 'samvel'
const DOC = 'docs/design/arcs/samvel.md'

/** Реплики арки (m, sys, item, done, follow) — их лист обязан привести дословно. */
function arcLines(): string[] {
  const arc = ARCS[ARC]
  const finales = FINALES[ARC] ?? []
  const texts: string[] = []
  for (const ep of [...arc.eps, ...finales]) {
    for (const entry of ep.m) {
      const msg: ArcMsg = valueOf(entry)
      texts.push(typeof msg === 'string' ? msg : msg.t)
    }
    if (ep.sys) texts.push(ep.sys)
    if (ep.item) texts.push(ep.item)
  }
  for (const entry of arc.follow) texts.push(valueOf(entry))
  for (const fin of finales) for (const entry of fin.done) texts.push(valueOf(entry))
  return texts.filter((t) => t.length > 0)
}

/** Названия финалов: лист называет их («обычный финал «Ты первый»», «Профсоюз»). */
function finaleTitles(): string[] {
  const finales = FINALES[ARC] ?? []
  return [...finales.map((f) => f.title), DEFAULT_FINALE[ARC]].filter((t) => t.length > 0)
}

/** Цитаты «…» с учётом вложенных ёлочек в самой реплике («врёт!», «Кредиторы Алика»). */
function quotedSpans(text: string): string[] {
  const spans: string[] = []
  let from = 0
  for (;;) {
    const open = text.indexOf('«', from)
    if (open === -1) return spans
    let depth = 0
    let close = -1
    for (let i = open; i < text.length; i++) {
      if (text[i] === '«') depth++
      else if (text[i] === '»' && --depth === 0) {
        close = i
        break
      }
    }
    if (close === -1) return spans
    spans.push(text.slice(open + 1, close))
    from = close + 1
  }
}

describe('лист чтения: Свадьба дяди Самвела (#641)', () => {
  const doc = readFileSync(DOC, 'utf8')
  // заголовки — структура листа, а не реплики: «как там» в названии раздела источником не является
  const content = doc.split('\n').filter((line) => !line.startsWith('#')).join('\n')

  it('каждая цитата листа — дословная подстрока реплик арки', () => {
    const allowed = [...arcLines(), ...finaleTitles()]
    const spans = quotedSpans(content)
    expect(spans.length).toBeGreaterThan(0)
    for (const span of spans) {
      expect(allowed.some((t) => t.includes(span)), `цитаты нет в источнике: «${span}»`).toBe(true)
    }
  })

  it('каждая реплика арки и название финала есть в листе дословно', () => {
    for (const text of arcLines()) {
      expect(doc.includes(`«${text}»`), `реплики нет в листе: «${text}»`).toBe(true)
    }
    for (const title of finaleTitles()) {
      expect(doc.includes(title), `финала нет в листе: «${title}»`).toBe(true)
    }
  })
})
