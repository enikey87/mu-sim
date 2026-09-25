// Аудиты в docs/ описывают код: имя символа живёт до переименования, номер строки сдвигает каждый PR (#111, PR #138).
// Две границы: ссылок на строки нет, и каждый идентификатор в бэктиках существует в репозитории.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Документы под стражей: аудиты и журнал дефектов — там ссылки на код, а не рассказ (#139). */
export const DOCS = [...readdirSync('docs').filter((f) => /AUDIT.*\.md$/.test(f)).map((f) => join('docs', f)), join('docs', 'TECH_DEFECTS.md')]

/** Где символ считается существующим — как в ручной сверке PR #138: код, тесты, e2e и конфиги. */
const CODE = ['src', 'tests', 'scripts', 'package.json', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', 'eslint.config.js', 'index.html']
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
/** Сам страж словарём не считается: иначе любое имя, которое он написал бы в комментарии или строке, стало бы существующим. */
const SELF = relative('.', fileURLToPath(import.meta.url))

/** Слова кода и конфигов: идентификатор ищется целым словом (`grep -rw`), а не подстрокой. */
export function knownWords(): Set<string> {
  const words = new Set<string>()
  const files = CODE.flatMap((c) => {
    try { return statSync(c).isDirectory() ? walk(c) : [c] } catch { return [] }
  })
  for (const f of files) {
    if (f === SELF) continue
    let text: string
    try { text = readFileSync(f, 'utf8') } catch { continue }
    for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) words.add(m[0])
  }
  return words
}

/**
 * Ссылки на строки: `file.ts:12` и голая `:12`. Второй образец не берёт слово перед двоеточием —
 * `cooldown:12` в примере кода ссылкой не является.
 */
export const LINE_REFS = [/\.tsx?:\d+/, /(?<![\w:]):\d+(?![\d:])/]
/** Идентификатор в бэктиках: путь, команда и проза под шаблон не попадают. */
const BACKTICK = /`([A-Za-z_][A-Za-z0-9_]*)`/g

/**
 * Не код — сверено руками в PR #138 и здесь. Файл (`LICENSE`), слово прозы (`grep`), браузерный API
 * (`requestSubmit`), свойство React (`dangerouslySetInnerHTML`), неслучившиеся предложения
 * (`ContentPack`, `manualChunks`) и то, что названо, чтобы сказать, что его больше нет
 * (`ifResponded`, `RARE`, `PROVEN`, `COMMON_GAMES` — гейт #278/#303 их снял, документ говорит об этом).
 */
export const NOT_CODE = new Set(['LICENSE', 'grep', 'requestSubmit', 'dangerouslySetInnerHTML', 'ContentPack', 'manualChunks', 'ifResponded', 'RARE', 'PROVEN', 'COMMON_GAMES'])

/** Что не так с текстом документа: ссылка на строку или имя, которого нет в репозитории. */
export function violations(text: string, known: Set<string>, notCode: Set<string> = NOT_CODE): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) for (const re of LINE_REFS) if (re.test(line)) out.push(`ссылка на строку: «${line.trim().slice(0, 80)}»`)
  for (const m of text.matchAll(BACKTICK)) {
    const w = m[1]
    if (w.length > 3 && !known.has(w) && !notCode.has(w)) out.push(`нет в репозитории: ${w}`)
  }
  return out
}

const known = knownWords()

describe('ссылки в аудитах: символ живёт, номер строки — нет', () => {
  // пустой набор прошёл бы любую проверку: страж обязан видеть файлы, слова и документы
  it('страж видит документы и слова кода', () => {
    expect(DOCS.length).toBeGreaterThan(3)
    expect(known.size).toBeGreaterThan(1000)
    expect(known.has('sendTurn')).toBe(true)
  })

  it('ни один документ не ссылается на номер строки', () => {
    expect(DOCS.flatMap((f) => violations(readFileSync(f, 'utf8'), known).filter((v) => v.startsWith('ссылка')))).toEqual([])
  })

  it('каждый идентификатор в бэктиках есть в репозитории или назван не-кодом', () => {
    expect(DOCS.flatMap((f) => violations(readFileSync(f, 'utf8'), known).filter((v) => v.startsWith('нет')))).toEqual([])
  })

  it('негативный контроль: номер строки и переименование краснеют, исключение — нет', () => {
    expect(violations('Смотри `game.ts:12`.', known)).toHaveLength(1)
    expect(violations('Голая ссылка :12 в тексте', known)).toHaveLength(1)
    expect(violations('В примере кода `cooldown:12` — это перерыв', known)).toEqual([]) // слово перед двоеточием — не ссылка
    expect(violations('`sendTurn` отвечает за ход', known)).toEqual([])
    // имя собирается на лету: этот файл сам лежит в src/, и его слова — тоже словарь, иначе контроль пуст
    const renamed = `sendTurn${'Renamed'}`
    expect(violations(`\`${renamed}\` отвечает за ход`, known)).toHaveLength(1)
    expect(known.has(renamed)).toBe(false)
    // исключение держится списком: без него то же имя краснеет
    expect(violations('Сверено `grep`.', known)).toEqual([])
    expect(violations('Сверено `grep`.', known, new Set())).toHaveLength(1)
  })
})
