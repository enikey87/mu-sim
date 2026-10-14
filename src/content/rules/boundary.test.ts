// Страж границы контента: прод-файлы правил не видят состояние игры напрямую.
// Тип ContentApi (engine/game.ts) — главный контроль: S в нём нет, запись и чтение не компилируются
// (см. @ts-expect-error ниже). Этот страж ловит обходы вокруг типа: импорт широкого Game любым видом,
// game.S / g.S / game['S'], деструктуризацию и переименование — по AST, не по регулярке (прецедент — view.test.ts).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import type { ContentApi } from '../../engine/game'

const dir = 'src/content/rules'
/** Рекурсивно: файл в подпапке rules — тоже правило и подлежит стражу (урок #69 про обходы). */
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
const ruleFiles = walk(dir).filter((f) => /\.ts$/.test(f) && !/\.test\./.test(f))
const parse = (file: string, text: string): ts.SourceFile =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const isGameModule = (file: string, spec: ts.Node | undefined): spec is ts.StringLiteralLike =>
  !!spec && ts.isStringLiteralLike(spec) && resolve(dirname(file), spec.text) === resolve('src/engine/game')

/** Имена, которые файл втягивает из engine/game: named-импорты (включая переименование), default, type-only, dynamic. */
function gameImportsOf(file: string, text: string): { names: string[]; dynamic: boolean } {
  const names: string[] = []
  let dynamic = false
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && isGameModule(file, n.moduleSpecifier)) {
      const clause = ts.isImportDeclaration(n) ? n.importClause : undefined
      if (clause?.name) names.push('default')
      const named = clause?.namedBindings
      const elements = (named && ts.isNamedImports(named) ? named.elements : undefined)
        ?? (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause) ? n.exportClause.elements : [])
      for (const el of elements) names.push((el.propertyName ?? el.name).text)
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && isGameModule(file, n.moduleReference.expression)) {
      dynamic = true
    } else if (ts.isImportTypeNode(n) && isGameModule(file, ts.isLiteralTypeNode(n.argument) ? n.argument.literal : undefined)) {
      dynamic = true
    } else if (ts.isCallExpression(n)) {
      const e = n.expression
      if ((e.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(e) && e.text === 'require')) && isGameModule(file, n.arguments[0])) dynamic = true
    }
    ts.forEachChild(n, visit)
  }
  visit(parse(file, text))
  return { names, dynamic }
}

/** Обращения к состоянию: идентификатор с именем ровно «S» (game.S, const { S } = game, переименования)
 *  и вычисляемый доступ game['S']. */
function sIdentifiers(file: string, text: string): string[] {
  const src = parse(file, text)
  const out: string[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === 'S') out.push(n.getText(src))
    else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === 'S') out.push(n.getText(src))
    ts.forEachChild(n, visit)
  }
  visit(src)
  return out
}

describe('граница контента: правила видят игру через ContentApi, а не весь Game', () => {
  // пустой список проходит любой тест — проверяем, что страж реально смотрит файлы
  it('страж видит файлы правил', () => {
    expect(ruleFiles.length).toBeGreaterThanOrEqual(12)
    const text = readFileSync(ruleFiles[0]!, 'utf-8')
    expect(gameImportsOf(ruleFiles[0]!, text).names).toContain('ContentApi')
  })

  it('нарушения в примерах ловятся: импорт Game — любым видом, обращение к S — любое', () => {
    const f = join(dir, 'fixture.ts')
    const imports: Array<[string, string[] | '__dynamic__']> = [
      [`import type { Game } from '../../engine/game'`, ['Game']],
      [`import { Game } from '../../engine/game'`, ['Game']],
      [`import { Game as G } from '../../engine/game'`, ['Game']], // переименование при импорте — тоже Game
      [`import Game from '../../engine/game'`, ['default']],
      [`export type { Game } from '../../engine/game'`, ['Game']],
      [`export { Game } from '../../engine/game'`, ['Game']],
      [`const G = await import('../../engine/game')`, '__dynamic__'],
      [`type X = import('../../engine/game').Game`, '__dynamic__'],
    ]
    for (const [text, want] of imports) {
      const got = gameImportsOf(f, text)
      expect(want === '__dynamic__' ? got.dynamic : got.names, text).toEqual(want === '__dynamic__' ? true : want)
    }
    for (const text of [
      'const t = game.S.debt',
      'const t = g.S.debt',
      'const t = game["S"].debt',
      'const t = game[\'S\'].debt',
      'const { S } = game',
      'const t = S.mem',
      'const S = game as any',
    ]) {
      expect(sIdentifiers(f, text).length, text).toBeGreaterThan(0)
    }
    // чистый файл страж не трогает: ContentApi — разрешённый путь
    const clean = `import type { ContentApi } from '../../engine/game'\nconst t = game.day + game.debt`
    expect(sIdentifiers(f, clean)).toEqual([])
    expect(gameImportsOf(f, clean)).toEqual({ names: ['ContentApi'], dynamic: false })
  })

  it('в прод-правилах нет ни импорта Game, ни идентификатора S', () => {
    for (const f of ruleFiles) {
      const text = readFileSync(f, 'utf-8')
      const g = gameImportsOf(f, text)
      expect(g.names.filter((n) => n !== 'ContentApi'), `${f}: импорт Game`).toEqual([])
      expect(g.dynamic, `${f}: доступ к движку мимо статического импорта`).toBe(false)
      expect(sIdentifiers(f, text), `${f}: обращение к S`).toEqual([])
    }
  })
})

// тип-контроль: S нет в ContentApi — обе строки не компилируются; верни S в интерфейс — tsc краснеет
// на неиспользованный @ts-expect-error (прецедент — сторож strictTurns в clock.test.ts)
function _compileTimeOnly(api: ContentApi): void {
  // @ts-expect-error запись в состояние игры из контента не компилируется
  api.S.mem['x'] = 1
  // @ts-expect-error чтение состояния напрямую тоже: только производные читатели
  void api.S.day
}
void _compileTimeOnly
