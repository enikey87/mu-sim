// Лист чтения арки «Коллекторы «Деньги-Ара»»: цитаты листа — дословно из источника, реплики источника — целиком в листе (#651).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ARCS, type ArcMsg } from './arcs'
import { DEFAULT_FINALE, FINALES } from './finales'
import { valueOf } from './fact'

const ARC = 'collectors'
const DOC = 'docs/design/arcs/collectors.md'

/** Видимый текст арки: сообщения серий и финалов, sys, трофей, «как там потом» и кнопки. */
function arcTexts(): string[] {
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
  for (const fin of finales) {
    texts.push(fin.title)
    for (const entry of fin.done) texts.push(valueOf(entry))
  }
  texts.push(DEFAULT_FINALE[ARC])
  return texts.filter((t) => t.length > 0)
}

/** Цитаты «…» с учётом вложенных ёлочек в самой реплике («Деньги-Ара»). */
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

describe('лист чтения: Коллекторы «Деньги-Ара» (#651)', () => {
  const doc = readFileSync(DOC, 'utf8')
  const texts = arcTexts()
  // заголовки — структура листа, а не реплики: «как там» в названии раздела источником не является
  const content = doc.split('\n').filter((line) => !line.startsWith('#')).join('\n')

  it('каждая цитата листа — дословная подстрока реплик арки', () => {
    const spans = quotedSpans(content)
    expect(spans.length).toBeGreaterThan(0)
    for (const span of spans) {
      expect(texts.some((t) => t.includes(span)), `цитаты нет в источнике: «${span}»`).toBe(true)
    }
  })

  it('каждая реплика арки есть в листе дословно', () => {
    for (const text of texts) {
      expect(doc.includes(`«${text}»`), `реплики нет в листе: «${text}»`).toBe(true)
    }
  })
})
