// Изоляция engine/rules: AST-страж импортов (тот же механизм, что ui/view.test.ts после #77).
// Разрешено только `./*` внутри модуля и `../rng`. Покрытие test:rules тут ни при чём.
// Тесты (*.test.*) из проверки исключены: на вынос пакета не едут, импорт контента им позволен.
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT = 'src/engine/rules'
/** Все JS/TS-модули, которые могут импортировать код (не только то, что парсит tsc как .ts). */
const PROD_EXT = /\.(?:[cm]?[tj]sx?|m?js|cjs)$/
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
const listProd = (): string[] => walk(ROOT).filter((f) => PROD_EXT.test(f) && !/\.test\./.test(f))

function scriptKind(file: string): ts.ScriptKind {
  if (/\.[cm]?tsx$/.test(file)) return ts.ScriptKind.TSX
  if (/\.jsx$/.test(file)) return ts.ScriptKind.JSX
  if (/\.mjs$|\.cjs$|\.js$/.test(file)) return ts.ScriptKind.JS
  // MTS/CTS есть с TS 4.7; без них парсер всё равно читает импорты как у .ts
  if (file.endsWith('.mts') && 'MTS' in ts.ScriptKind) return (ts.ScriptKind as unknown as Record<string, ts.ScriptKind>).MTS
  if (file.endsWith('.cts') && 'CTS' in ts.ScriptKind) return (ts.ScriptKind as unknown as Record<string, ts.ScriptKind>).CTS
  return ts.ScriptKind.TS
}

/** Все места, откуда файл берёт модуль — как в view.test.ts, плюс `/// <reference path|types>`. */
function specifiers(file: string, source?: string): string[] {
  const text = source ?? readFileSync(file, 'utf8')
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file))
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
  for (const r of src.referencedFiles) out.push(r.fileName)
  for (const r of src.typeReferenceDirectives) out.push(r.fileName)
  return out
}

const resolveTarget = (file: string, spec: string): string =>
  spec.startsWith('.') ? relative('.', resolve(dirname(file), spec)).replace(/\\/g, '/') : spec

/** Разрешены только модули внутри rules/ и engine/rng (с опциональным расширением). */
function allowed(file: string, spec: string): boolean {
  if (spec.startsWith('<не строка')) return false
  if (!spec.startsWith('.')) return false // голый пакет / абсолютный путь / types-имя
  const t = resolveTarget(file, spec).replace(/\.(?:[cm]?[tj]sx?|m?js|cjs)$/, '')
  return t === 'src/engine/rng' || t === ROOT || t.startsWith(ROOT + '/')
}

describe('изоляция engine/rules', () => {
  const leftovers: string[] = []
  afterEach(() => {
    for (const f of leftovers.splice(0)) {
      try { unlinkSync(f) } catch { /* уже нет */ }
    }
  })

  it('страж видит прод-файлы и их относительные импорты', () => {
    const prod = listProd()
    expect(prod).toContain(join(ROOT, 'lint.ts'))
    expect(specifiers(join(ROOT, 'ruleset.ts'))).toContain('../rng')
    expect(specifiers(join(ROOT, 'index.ts')).some((s) => s.startsWith('./'))).toBe(true)
  })

  for (const f of listProd()) {
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

  it('негативный контроль: .mjs с импортом контента — в списке и краснеет', () => {
    const mjs = join(ROOT, '_nc_leak.mjs')
    writeFileSync(mjs, `import { MEM_KEYS } from '../../content/memkeys.js'\nexport const k = MEM_KEYS\n`)
    leftovers.push(mjs)
    expect(PROD_EXT.test(mjs)).toBe(true)
    expect(listProd()).toContain(mjs)
    for (const spec of specifiers(mjs)) {
      expect(allowed(mjs, spec), `mjs: ${spec}`).toBe(false)
    }
  })

  it('негативный контроль: .mts с импортом контента — в списке и краснеет', () => {
    const mts = join(ROOT, '_nc_leak.mts')
    writeFileSync(mts, `import { MEM_KEYS } from '../../content/memkeys'\nexport const k = MEM_KEYS\n`)
    leftovers.push(mts)
    expect(PROD_EXT.test(mts)).toBe(true)
    expect(listProd()).toContain(mts)
    for (const spec of specifiers(mts)) {
      expect(allowed(mts, spec), `mts: ${spec}`).toBe(false)
    }
  })

  it('негативный контроль: .jsx с импортом контента — в списке и краснеет', () => {
    const jsx = join(ROOT, '_nc_leak.jsx')
    writeFileSync(jsx, `import { MEM_KEYS } from '../../content/memkeys.js'\nexport const k = MEM_KEYS\n`)
    leftovers.push(jsx)
    expect(PROD_EXT.test(jsx)).toBe(true)
    expect(listProd()).toContain(jsx)
    for (const spec of specifiers(jsx)) {
      expect(allowed(jsx, spec), `jsx: ${spec}`).toBe(false)
    }
  })

  it('негативный контроль: /// <reference path> на контент — краснеет', () => {
    const file = join(ROOT, 'lint.ts')
    const specs = specifiers(file, `/// <reference path="../../content/memkeys.ts" />\nexport {}\n`)
    expect(specs).toContain('../../content/memkeys.ts')
    expect(specs.every((s) => !allowed(file, s))).toBe(true)
  })
})
