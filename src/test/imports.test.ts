// Прод-исходник не берёт тестовые хелперы: `sources` (field.ts) их и так исключает, а обратной границы
// не стерёг никто — сборка утащила бы `setMoney` в бандл (#253). Формы импорта — как в `ui/view.test.ts`.
import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { sources } from './field'

/** Все места, откуда файл берёт модуль: import/export from, «голый» import, import(), require, import('…').T, import.meta.glob. */
function specifiers(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const arg = (n: ts.Node | undefined) => {
    if (n && ts.isStringLiteralLike(n)) out.push(n.text)
    else if (n && ts.isArrayLiteralExpression(n)) n.elements.forEach(arg)
    else out.push(`<не строка: ${n?.getText(src) ?? 'пусто'}>`) // вычисленный путь не проверить — значит нельзя
  }
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) arg(n.moduleSpecifier)
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) arg(n.moduleReference.expression)
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) arg(n.argument.literal)
    else if (ts.isCallExpression(n)) {
      const e = n.expression
      const isGlob = ts.isPropertyAccessExpression(e) && /^glob/.test(e.name.text) && ts.isMetaProperty(e.expression)
      if (e.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(e) && e.text === 'require') || isGlob) arg(n.arguments[0])
    }
    ts.forEachChild(n, visit)
  }
  visit(src)
  return out
}

const target = (file: string, spec: string): string =>
  spec.startsWith('.') ? relative('.', resolve(dirname(file), spec)) : spec.startsWith('/') ? spec.slice(1) : spec

describe('прод-исходники не берут тестовые хелперы', () => {
  // пустой список прошёл бы любую проверку: страж обязан видеть файлы и их импорты
  it('страж видит прод-исходники и их импорты', () => {
    expect(sources).toContain(join('src', 'engine', 'game.ts'))
    expect(specifiers(join('src', 'engine', 'game.ts'))).toContain('../content/rules')
  })

  it('ни один прод-исходник не импортирует src/test', () => {
    const bad: string[] = []
    for (const f of sources) {
      for (const spec of specifiers(f)) {
        if (/^<не строка/.test(spec)) bad.push(`${f}: вычисленный путь импорта`)
        else if (/^src\/test(\/|$)/.test(target(f, spec))) bad.push(`${f}: ${spec}`)
      }
    }
    expect(bad).toEqual([])
  })
})
