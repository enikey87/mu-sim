// Изоляция engine/rules: AST-страж импортов (тот же механизм, что ui/view.test.ts после #77).
// Разрешено только `./*` внутри модуля и `../rng`. Покрытие test:rules тут ни при чём.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = 'src/engine/rules'
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
const prodFiles = walk(ROOT).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))

/** Все места, откуда файл берёт модуль — как в view.test.ts. */
function specifiers(file: string, source?: string): string[] {
  const text = source ?? readFileSync(file, 'utf8')
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const arg = (n: ts.Node | undefined) => {
    if (n && ts.isStringLiteralLike(n)) out.push(n.text)
    else if (n && ts.isArrayLiteralExpression(n)) n.elements.forEach(arg)
    else out.push(`<не строка: ${n?.getText(src) ?? 'пусто'}>`)
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

const resolveTarget = (file: string, spec: string): string =>
  spec.startsWith('.') ? relative('.', resolve(dirname(file), spec)).replace(/\\/g, '/') : spec

/** Разрешены только модули внутри rules/ и engine/rng (с опциональным .ts). */
function allowed(file: string, spec: string): boolean {
  if (spec.startsWith('<не строка')) return false
  if (!spec.startsWith('.')) return false // голый пакет / абсолютный путь
  const t = resolveTarget(file, spec).replace(/\.tsx?$/, '')
  return t === 'src/engine/rng' || t === ROOT || t.startsWith(ROOT + '/')
}

describe('изоляция engine/rules', () => {
  it('страж видит прод-файлы и их относительные импорты', () => {
    expect(prodFiles).toContain(join(ROOT, 'lint.ts'))
    expect(specifiers(join(ROOT, 'ruleset.ts'))).toContain('../rng')
    expect(specifiers(join(ROOT, 'index.ts')).some((s) => s.startsWith('./'))).toBe(true)
  })

  for (const f of prodFiles) {
    it(`${f}: только ./* и ../rng`, () => {
      for (const spec of specifiers(f)) {
        expect(allowed(f, spec), `${f}: ${spec}`).toBe(true)
      }
    })
  }

  it('негативные контроли: type-only, dynamic, голый, подпапка → нельзя', () => {
    const file = join(ROOT, 'lint.ts')
    const sub = join(ROOT, 'nested', 'x.ts')
    expect(allowed(file, '../../content/memkeys')).toBe(false)
    expect(allowed(file, '../game')).toBe(false)
    expect(allowed(file, 'fs')).toBe(false)
    expect(allowed(file, './types')).toBe(true)
    expect(allowed(file, '../rng')).toBe(true)
    // type-only / dynamic / require — те же строки в AST
    expect(specifiers(file, `import type { X } from '../../content/memkeys'\n`).every((s) => !allowed(file, s))).toBe(true)
    expect(specifiers(file, `void import('../game')\n`).every((s) => !allowed(file, s))).toBe(true)
    expect(specifiers(file, `require('../../content/memkeys')\n`).every((s) => !allowed(file, s))).toBe(true)
    expect(allowed(sub, '../../../content/memkeys')).toBe(false)
    expect(allowed(sub, '../../rng')).toBe(true)
    expect(allowed(sub, '../types')).toBe(true)
  })
})
