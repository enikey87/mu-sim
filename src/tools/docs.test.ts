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
/** Всё содержимое однострочных бэктиков; классификация идёт ниже. */
const BACKTICK = /`([^`\n]+)`/g
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
const COMPOUND = /^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+)(?:\([^)]*\))?$/
const PATH_EXT = /\.(?:[cm]?[jt]sx?|md|json|ya?ml|html)(?:\*|\u2013\d+)?$/
const PATH_ROOT = /^(?:src|tests|scripts|docs|engine|content|ui|tools|rules|packs|\.github)\//

/** Пути и каталоги репозитория; build-артефакты и зависимости не делают протухшую ссылку живой. */
export function knownPaths(): Set<string> {
  const paths = new Set<string>()
  const visit = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (dir === '.' && ['.git', 'node_modules', 'dist'].includes(e.name)) continue
      const p = dir === '.' ? e.name : join(dir, e.name)
      paths.add(p)
      if (e.isDirectory()) visit(p)
    }
  }
  visit('.')
  return paths
}

const isPathRef = (ref: string): boolean => PATH_EXT.test(ref) || PATH_ROOT.test(ref)
const expandBraces = (pattern: string): string[] => {
  const m = pattern.match(/\{([^{}]+)\}/)
  if (!m || m.index === undefined) return [pattern]
  return m[1].split(',').flatMap((part) => expandBraces(pattern.slice(0, m.index) + part + pattern.slice(m.index! + m[0].length)))
}
const globRe = (pattern: string): RegExp => {
  const token = '\u0000'
  const clean = pattern.replace(/^\.\//, '').replace(/\/+$/, '')
  const escaped = clean.replace(/\*\*/g, token).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replaceAll(token, '.*')
  return new RegExp(`(?:^|/)${escaped}$`)
}
/** Полный или сокращённый (`engine/game.ts`, `game.ts`) путь; glob/фигурные скобки — по хотя бы одному совпадению. */
export const pathExists = (ref: string, paths: Set<string>): boolean =>
  expandBraces(ref).some((part) => [...paths].some((p) => globRe(part).test(p)))

export interface DocRefs { compounds: string[]; paths: string[] }
export function references(text: string, notCode: Set<string> = NOT_CODE): DocRefs {
  const compounds: string[] = [], paths: string[] = []
  for (const m of text.matchAll(BACKTICK)) {
    const ref = m[1]
    if (notCode.has(ref)) continue
    if (isPathRef(ref)) paths.push(ref)
    else if (COMPOUND.test(ref.replace(/\.\*$/, ''))) compounds.push(ref)
  }
  return { compounds, paths }
}

/**
 * Не код — сверено руками в PR #138 и здесь. Файл (`LICENSE`), слово прозы (`grep`), браузерный API
 * (`requestSubmit`), свойство React (`dangerouslySetInnerHTML`), неслучившиеся предложения
 * (`ContentPack`, `manualChunks`) и то, что названо, чтобы сказать, что его больше нет
 * (`ifResponded`, `RARE`, `PROVEN`, `COMMON_GAMES` — гейт #278/#303 их снял, документ говорит об этом).
 */
export const NOT_CODE = new Set([
  'LICENSE', 'grep', 'requestSubmit', 'dangerouslySetInnerHTML', 'ContentPack', 'manualChunks', 'ifResponded', 'RARE', 'PROVEN', 'COMMON_GAMES',
  // Целевые, но не реализованные формы и намеренная опечатка из примера аудита.
  'S.packs', 'since.daed', 'engine/{turns,scenes,arcs,lies,endings}.ts', 'packs/boris/{arcs,legends,finales,rules,lies}.ts',
])

/** Что не так с текстом: строка, протухший символ/цепочка или путь. */
export function violations(text: string, known: Set<string>, notCode: Set<string> = NOT_CODE, paths: Set<string> = knownPaths(), requireReferences = false): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) for (const re of LINE_REFS) if (re.test(line)) out.push(`ссылка на строку: «${line.trim().slice(0, 80)}»`)
  for (const m of text.matchAll(BACKTICK)) {
    const ref = m[1]
    if (notCode.has(ref)) continue
    if (isPathRef(ref)) {
      if (!pathExists(ref, paths)) out.push(`нет пути в репозитории: ${ref}`)
      continue
    }
    const compound = ref.replace(/\.\*$/, '').match(COMPOUND)?.[1]
    if (compound) {
      const missing = compound.split('.').filter((part) => !known.has(part))
      if (missing.length) out.push(`нет части ссылки ${missing.join(', ')}: ${ref}`)
      continue
    }
    if (ref.length > 3 && IDENT.test(ref) && !known.has(ref)) out.push(`нет в репозитории: ${ref}`)
  }
  const refs = references(text, notCode)
  if (requireReferences && !refs.compounds.length && !refs.paths.length) out.push('не найдено ни составной ссылки, ни пути')
  return out
}

const known = knownWords()
const paths = knownPaths()

describe('ссылки в аудитах: символ живёт, номер строки — нет', () => {
  // пустой набор прошёл бы любую проверку: страж обязан видеть файлы, слова и документы
  it('страж видит документы и слова кода', () => {
    expect(DOCS.length).toBeGreaterThan(3)
    expect(known.size).toBeGreaterThan(1000)
    expect(paths.size).toBeGreaterThan(100)
    expect(known.has('sendTurn')).toBe(true)
  })

  it('ни один документ не ссылается на номер строки', () => {
    expect(DOCS.flatMap((f) => violations(readFileSync(f, 'utf8'), known).filter((v) => v.startsWith('ссылка')))).toEqual([])
  })

  it('каждый идентификатор, часть составной ссылки и путь живы или названы не-кодом', () => {
    const corpus = DOCS.map((f) => readFileSync(f, 'utf8')).join('\n')
    const refs = references(corpus)
    expect(refs.compounds.length, 'сторож перестал видеть составные ссылки').toBeGreaterThan(30)
    expect(refs.paths.length, 'сторож перестал видеть пути').toBeGreaterThan(50)
    expect(violations(corpus, known, NOT_CODE, paths, true).filter((v) => v.startsWith('нет'))).toEqual([])
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

  it('негативный контроль: составная ссылка и путь к файлу краснеют', () => {
    const renamed = `sendTurn${'Renamed'}`
    expect(violations('`Game.sendTurn` отвечает за ход', known, NOT_CODE, paths)).toEqual([])
    expect(violations(`\`Game.${renamed}\` отвечает за ход`, known, NOT_CODE, paths)).toHaveLength(1)
    expect(violations('`src/engine/game.ts` описывает движок', known, NOT_CODE, paths)).toEqual([])
    expect(violations('`src/ui/**` описывает UI', known, NOT_CODE, paths)).toEqual([])
    expect(violations('`src/engine/game-renamed.ts` описывает движок', known, NOT_CODE, paths)).toHaveLength(1)
    expect(violations('в тексте нет ссылок', known, NOT_CODE, paths, true)).toEqual(['не найдено ни составной ссылки, ни пути'])
  })
})
