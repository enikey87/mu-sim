import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import { uiOf, viewOf } from './view'

/** Кому граница не писана: view.ts — сама граница, App.tsx — корень (получает Game и отдаёт дереву фасад),
 *  DebugPanel — инструмент автора. */
const ALLOWED = new Set(['view.ts', 'App.tsx', 'DebugPanel.tsx'])
/** Куда компонентам нельзя: контент (в т.ч. memkeys) и сам Game — с его типом фасад снимается кастом. */
const FORBIDDEN = [/^src\/content\//, /^src\/engine\/game(\.ts)?$/]

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
const uiFiles = walk('src/ui').filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && !ALLOWED.has(relative('src/ui', f)))

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

describe('граница UI: фасад и снимок из view.ts, а не внутренности движка', () => {
  // пустой список проходит любой тест — проверяем, что страж реально смотрит файлы и видит импорты
  it('страж видит файлы и их импорты', () => {
    expect(uiFiles).toContain(join('src', 'ui', 'Chat.tsx'))
    expect(specifiers(join('src', 'ui', 'Chat.tsx'))).toContain('./useGame')
  })

  for (const f of uiFiles) {
    it(`${f}: ни контента, ни Game — никаким видом импорта`, () => {
      for (const spec of specifiers(f)) {
        expect(spec, `${f}: вычисленный путь импорта`).not.toMatch(/^<не строка/)
        for (const re of FORBIDDEN) expect(target(f, spec), `${f}: ${spec}`).not.toMatch(re)
      }
    })
  }

  it('из фасада не достать ни S, ни живые объекты движка', () => {
    const { game } = makeGame()
    const forbidden = new Set<unknown>([game, game.S, game.S.mem, game.S.msgs, game.ui, game.battery, game.rules])
    const seen = new Set<unknown>()
    const queue: unknown[] = [uiOf(game)]
    while (queue.length) {
      const o = queue.shift()
      if (o === null || (typeof o !== 'object' && typeof o !== 'function') || seen.has(o)) continue
      seen.add(o)
      expect(forbidden.has(o), 'фасад отдаёт живой объект движка').toBe(false)
      for (const k of Reflect.ownKeys(o)) {
        const d = Object.getOwnPropertyDescriptor(o, k)!
        queue.push(d.get ? d.get.call(o) : d.value)
      }
      const proto = Object.getPrototypeOf(o)
      if (proto !== Object.prototype && proto !== Function.prototype) queue.push(proto)
    }
    expect(seen.size).toBeGreaterThan(20) // обход действительно прошёл по фасаду
    expect('S' in uiOf(game)).toBe(false)
  })

  it('до выплаты — столько дней, сколько осталось до payday.at, а не всегда 1', () => {
    const { game } = makeGame()
    game.S.scene = { id: 'payday', node: 'announce', vars: {} }
    game.S.mem['payday.at'] = game.S.day + 3
    expect(viewOf(uiOf(game)).payday.daysLeft).toBe(3)
    game.S.mem['payday.at'] = game.S.day
    expect(viewOf(uiOf(game)).payday.daysLeft).toBeNull()
  })
})
