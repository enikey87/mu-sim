// Сверка ENDINGS.md с кодом: в строке таблицы концовки/исхода обязаны быть названы все факты её условия
// и ни один чужой (двусторонний сторож: правка кода без шпаргалки и наоборот красит тест). Условие «вернуть
// в шпаргалку quests у real» — негативный контроль задачи #717.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENDINGS, PAYDAY_OUTCOMES } from '../content/finales'
import { paydayRules } from '../content/rules/payday'
import { rudeRules } from '../content/rules/rude'
import { criterionKeys } from '../engine/rules'

const rows = readFileSync('ENDINGS.md', 'utf8').split('\n').filter((l) => l.startsWith('|'))
const rowOf = (title: string): string | undefined => rows.find((l) => l.includes(title))

/** Факт условия → как шпаргалка обязана его называть (и не называть в чужих строках). */
const PAYDAY_LABELS: Record<string, RegExp> = {
  'ach.saint': /Святой/,
  'ach.court': /заседание суда/,
  'payday.caught': /Поймал великую отмазку/,
  'crypto.hodl': /Лаваш-коин/,
  quests: /мини-квест/,
  'finale.niva': /выбрала тебя/,
  'ach.strasbourg': /Страсбург/,
  'finale.razmik': /Размик/,
}
const STORY_LABELS: Record<string, RegExp> = {
  'finale.samvel': /Жених/,
  'finale.alik_death': /Завещание/,
  'finale.boris': /Борис уходит/,
  'finale.garik': /Вырубщик/,
  'finale.grant': /Союзник/,
  vendetta: /Rude_Vendetta/,
  'count.rude': /крик/,
  'count.sorry': /извинени/,
  'finale.niva': /выбрала тебя/,
  items: /трофе/,
  'ach.fence': /забор/,
  HEAT: /жар/,
}

const checkRow = (id: string, row: string | undefined, keys: string[], labels: Record<string, RegExp>): void => {
  expect(row, `${id}: строка в ENDINGS.md`).toBeDefined()
  for (const [key, label] of Object.entries(labels)) {
    const named = label.test(row!)
    if (keys.includes(key)) expect(named, `${id}: шпаргалка называет ${key}`).toBe(true)
    else expect(named, `${id}: шпаргалка не называет чужой ${key}`).toBe(false)
  }
}

describe('ENDINGS.md сходится с условиями в коде', () => {
  it('исходы Дня выплаты: каждый факт условия назван, чужие — нет', () => {
    for (const r of paydayRules) {
      const id = r.name.slice('Payday_'.length)
      if (!(PAYDAY_OUTCOMES as readonly string[]).includes(id)) continue // Payday_Button — не исход
      // экраны payday_* в ENDINGS несут префикс «День выплаты: », которого нет в строке шпаргалки
      const title = ENDINGS.find((e) => e.id === `payday_${id}`)?.title.replace(/^День выплаты: /, '')
      expect(title, `payday_${id}: экран в ENDINGS`).toBeDefined()
      checkRow(`payday_${id}`, rowOf(title!), criterionKeys(r.when), PAYDAY_LABELS)
    }
  })
  it('сюжетные концовки: каждый факт условия назван, чужие — нет', () => {
    const vendettaRule = rudeRules.find((r) => r.name === 'Rude_Vendetta')!
    for (const e of ENDINGS) {
      if (e.id.startsWith('payday_') || e.id === 'multiverse') continue
      // day-гейт ~300 и тон — общие ворота, не индивидуальные условия: из сверки исключены
      const keys = [...criterionKeys(e.when).filter((k) => k !== 'day'), ...(e.id === 'vendetta' ? criterionKeys(vendettaRule.when).filter((k) => k !== 'tone') : [])]
      checkRow(e.id, rowOf(e.title), keys, STORY_LABELS)
    }
  })
  it('«Параллельная вселенная»: свои 800 дней и 300 сообщений', () => {
    const row = rowOf('Параллельная вселенная')
    expect(row).toBeDefined()
    expect(row!).toMatch(/800/)
    expect(row!).toMatch(/300/)
  })
})
