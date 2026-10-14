// Разбор плейтеста (#737): инструмент scripts/playtest-review.mjs — повторы, маркеры-утверждения, сводка.
// Фикстуры — расшифровки, как их пишет `transcript()`: даты разделителями, реплики со временем, системные строки.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { playtest, transcript } from './playtest'

const SCRIPT = 'scripts/playtest-review.mjs'

/** Прогон инструмента по каталогу/файлу; падение ноды — ошибка теста, а не «нет находок». */
function run(path: string): { code: number | null; out: string; err: string } {
  const r = spawnSync('node', [SCRIPT, path], { encoding: 'utf8' })
  expect(r.error, 'node недоступен — инструмент нельзя проверить').toBeUndefined()
  return { code: r.status, out: r.stdout, err: r.stderr }
}

/** Каталог, как его пишет npm run playtest: seed-*.txt рядом. */
function dumpDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'review-'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

const part = (seed: number, lines: string[]): string =>
  [`Партия ${seed}: сообщений игрока — 1, в конце — 700-й день ожидания денег`, ...lines].join('\n')

const section = (out: string, from: string, to?: string): string => {
  const s = out.split(from)[1]
  expect(s, `секция «${from}» есть`).toBeDefined()
  return to ? s.split(to)[0] : s
}

describe('разбор плейтеста (#737)', () => {
  it('повтор одного говорящего виден по датам; тот же текст у разных говорящих — не повтор', () => {
    const dir = dumpDir({
      'seed-1.txt': part(1, [
        '—— 2 марта 2027 г. ——',
        '[10:00] Алик: Брат, я всё решу.',
        '[10:01] Борис 🐏: Бее.',
        '[10:02] Алик: Бее.',
        '—— 4 марта 2027 г. ——',
        '[10:00] Алик: Брат, я всё решу.',
      ]),
    })
    for (const path of [dir, join(dir, 'seed-1.txt')]) {
      const { code, out } = run(path)
      expect(code).toBe(0)
      const reps = section(out, '== Повторы реплик', '== Повторы служебных')
      expect(reps).toContain('2× Алик: «Брат, я всё решу.» — 2 марта 2027 г. … 4 марта 2027 г.')
      expect(reps, 'тот же текст у разных говорящих — не повтор').not.toContain('Бее')
    }
  })
  it('маркеры-кандидаты: строка-утверждение видна, строка без маркеров — нет; система тоже', () => {
    const dir = dumpDir({
      'seed-2.txt': part(2, [
        '—— 2 марта 2027 г. ——',
        '[10:00] Алик: Налоговая опять звонила.',
        '[10:01] Алик: Сегодня хорошая погода.',
        '[система] Задание выполнено',
      ]),
    })
    const { out } = run(dir)
    const markers = section(out, '== Кандидаты', '== Итог')
    expect(markers).toContain('[2 марта 2027 г.] Алик: «Налоговая опять звонила.»')
    expect(markers).toContain('[2 марта 2027 г.] [система] «Задание выполнено»')
    expect(markers).not.toContain('хорошая погода')
    expect(markers, 'сводка — не кандидат: у неё нет маркера').not.toContain('Прочитано')
  })
  it('служебные повторы (система, карточки) — отдельным разделом, не среди реплик', () => {
    const dir = dumpDir({
      'seed-3.txt': part(3, [
        '—— 2 марта 2027 г. ——',
        '[10:00] Алик: Привет.',
        '[система] Прочитано в 09:03',
        '(карточка в ленте: 🏦 Банк — Сводка за неделю: баланс 100 ₽)',
        '—— 3 марта 2027 г. ——',
        '[система] Прочитано в 09:03',
        '(карточка в ленте: 🏦 Банк — Сводка за неделю: баланс 100 ₽)',
      ]),
    })
    const { out } = run(dir)
    const reps = section(out, '== Повторы реплик', '== Повторы служебных')
    const service = section(out, '== Повторы служебных', '== Кандидаты')
    expect(reps).not.toContain('Прочитано')
    expect(reps).not.toContain('Сводка')
    expect(service).toContain('2× система: «Прочитано в 09:03» — 2 марта 2027 г. … 3 марта 2027 г.')
    expect(service).toContain('2× «(карточка в ленте: 🏦 Банк — Сводка за неделю: баланс 100 ₽)» — 2 марта 2027 г. … 3 марта 2027 г.')
  })
  it('живой дамп: сводка сходится со списками, каждое повторение подтверждается расшифровкой', async () => {
    const p = await playtest(1, 30)
    const text = transcript(p)
    const { code, out } = run(dumpDir({ 'seed-1.txt': text }))
    expect(code).toBe(0)
    expect(out).toMatch(/Плейтест-разбор: партий — 1/)
    const reps = section(out, '== Повторы реплик', '== Повторы служебных')
    const service = section(out, '== Повторы служебных', '== Кандидаты')
    const lines = text.split('\n')
    const entries = (s: string) => s.split('\n').filter((l) => /^ {2}\d+× /.test(l))
    const summary = out.match(/повторов: (\d+) · служебных повторов: (\d+)/)
    expect(summary, 'сводка на месте').not.toBeNull()
    expect(Number(summary![1])).toBe(entries(reps).length)
    expect(Number(summary![2])).toBe(entries(service).length)
    for (const line of [...entries(reps), ...entries(service)]) {
      const count = Number(/^ {2}(\d+)× /.exec(line)![1])
      const quoted = line.slice(line.indexOf('«') + 1, line.lastIndexOf('»'))
      const hits = lines.filter((l) => l.endsWith(quoted)).length
      expect(hits, `${count}× «${quoted.slice(0, 40)}…» есть в расшифровке не меньше раз`).toBeGreaterThanOrEqual(count)
    }
  })
  it('каталог без seed-*.txt — ошибка, а не пустой отчёт', () => {
    const dir = mkdtempSync(join(tmpdir(), 'review-'))
    const { code, out, err } = run(dir)
    expect(code).not.toBe(0)
    expect(err).toMatch(/нет расшифровок/)
    expect(out.trim()).toBe('')
  })
})
