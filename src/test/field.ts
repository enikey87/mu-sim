// Страж «одна точка записи» для поля состояния (долг, деньги): тип (`readonly` в GameState) ловит прямую
// запись, а этот разбор — то, что тип пропускает: переменную без readonly, Object.assign, defineProperty, Reflect.set.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))

/** Прод-исходники: тесты и src/test — не то, что стережём. */
export const sources = walk('src').filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && !f.startsWith(join('src', 'test')))

const sourceOf = (file: string) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

/** Скобки и приведения не меняют, куда идёт запись: ((S as X).debt)++ — та же запись. */
const bare = (n: ts.Node): ts.Node => (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isTypeAssertionExpression(n) ? bare(n.expression) : n)
const isKey = (n: ts.Node | undefined, field: string) => !!n && ts.isStringLiteralLike(bare(n)) && (bare(n) as ts.StringLiteralLike).text === field
const isField = (x: ts.Node, field: string): boolean => {
  const n = bare(x)
  return (ts.isPropertyAccessExpression(n) && n.name.text === field) || (ts.isElementAccessExpression(n) && isKey(n.argumentExpression, field))
}
const hasKey = (n: ts.Node | undefined, field: string): boolean =>
  !!n && ((ts.isStringLiteralLike(n) && n.text === field) ||
    (ts.isObjectLiteralExpression(n) && n.properties.some((p) => (p.name && ts.isIdentifier(p.name) && p.name.text === field) || (p.name && ts.isStringLiteralLike(p.name) && p.name.text === field) || ts.isSpreadAssignment(p))))
const WRITERS = new Set(['Object.assign', 'Object.defineProperty', 'Object.defineProperties', 'Reflect.set', 'Reflect.defineProperty'])

/** Места записи поля в исходнике: «строка:столбец». allow — законная точка записи (например, adjustDebt в game.ts). */
export function fieldWrites(file: string, field: string, allow?: (n: ts.Node, src: ts.SourceFile) => boolean): string[] {
  return fieldWritesIn(sourceOf(file), field, allow, file)
}

/** То же по тексту исходника — для синтетических случаев в тестах: имя файла нужно только для адреса. */
export function fieldWritesIn(src: ts.SourceFile, field: string, allow?: (n: ts.Node, src: ts.SourceFile) => boolean, file = src.fileName): string[] {
  const out: string[] = []
  const at = (n: ts.Node) => { const p = src.getLineAndCharacterOfPosition(n.getStart()); out.push(`${file}:${p.line + 1}:${p.character + 1}`) }
  const targets = (n: ts.Node): boolean => isField(n, field) || ((ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n) || ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) || ts.isSpreadElement(n) || ts.isSpreadAssignment(n)) && (ts.forEachChild(n, (c) => targets(c) || undefined) ?? false))
  const visit = (n: ts.Node, inside: boolean): void => {
    const here = inside || !!allow?.(n, src)
    if (!here) {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && targets(n.left)) at(n)
      if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator) && isField(n.operand, field)) at(n)
      if (ts.isDeleteExpression(n) && isField(n.expression, field)) at(n)
      if (ts.isCallExpression(n) && WRITERS.has(n.expression.getText(src)) && n.arguments.slice(1).some((a) => hasKey(a, field))) at(n)
    }
    ts.forEachChild(n, (c) => visit(c, here))
  }
  visit(src, false)
  return out
}

/** Разбор исходника как текста: законная запись — метод `method` в `file`. */
export const inMethod = (file: string, method: string) => (n: ts.Node, src: ts.SourceFile): boolean =>
  ts.isMethodDeclaration(n) && n.name.getText(src) === method && src.fileName === file
