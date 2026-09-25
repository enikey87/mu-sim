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
/**
 * Имена файла: `const k = 'money'`, `const patch = { money: 0 }`. Ключ и патч через имя — та же запись,
 * и в месте записи поля не видно. Значение берём только у литерала: у вычисляемого имени его нет.
 */
const NAMED = (src: ts.SourceFile): Map<string, ts.Node> => {
  const named = new Map<string, ts.Node>()
  const scan = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) named.set(n.name.text, n.initializer)
    ts.forEachChild(n, scan)
  }
  scan(src)
  return named
}
/** Текст ключа: литерал, имя литерала, склейка литералов. null — ключ не прочитать. */
const keyText = (n: ts.Node | undefined, named: Map<string, ts.Node>, depth = 0): string | null => {
  if (!n || depth > 4) return null
  const x = bare(n)
  if (ts.isStringLiteralLike(x)) return x.text
  if (ts.isIdentifier(x)) return keyText(named.get(x.text), named, depth + 1)
  if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = keyText(x.left, named, depth + 1)
    const r = keyText(x.right, named, depth + 1)
    return l !== null && r !== null ? l + r : null
  }
  return null
}
/** Патч: литерал объекта или имя, за которым он стоит. */
const patch = (n: ts.Node | undefined, named: Map<string, ts.Node>, depth = 0): ts.ObjectLiteralExpression | null => {
  if (!n || depth > 4) return null
  const x = bare(n)
  if (ts.isObjectLiteralExpression(x)) return x
  return ts.isIdentifier(x) ? patch(named.get(x.text), named, depth + 1) : null
}
const isKey = (n: ts.Node | undefined, field: string, named: Map<string, ts.Node>) => keyText(n, named) === field
const isField = (x: ts.Node, field: string, named: Map<string, ts.Node>): boolean => {
  const n = bare(x)
  return (ts.isPropertyAccessExpression(n) && n.name.text === field) || (ts.isElementAccessExpression(n) && isKey(n.argumentExpression, field, named))
}
const hasKey = (n: ts.Node | undefined, field: string, named: Map<string, ts.Node>): boolean => {
  if (keyText(n, named) === field) return true
  const o = patch(n, named)
  return !!o && o.properties.some((p) => (p.name && ts.isIdentifier(p.name) && p.name.text === field) || (p.name && ts.isStringLiteralLike(p.name) && p.name.text === field) || ts.isSpreadAssignment(p))
}
// `setCount` — законная точка записи счёта (state.ts): вне adjustDebt / adjustMoney она и есть обход.
const WRITERS = new Set(['Object.assign', 'Object.defineProperty', 'Object.defineProperties', 'Reflect.set', 'Reflect.defineProperty', 'setCount'])

/** Места записи поля в исходнике: «строка:столбец». allow — законная точка записи (например, adjustDebt в game.ts). */
export function fieldWrites(file: string, field: string, allow?: (n: ts.Node, src: ts.SourceFile) => boolean): string[] {
  return fieldWritesIn(sourceOf(file), field, allow, file)
}

/** То же по тексту исходника — для синтетических случаев в тестах: имя файла нужно только для адреса. */
export function fieldWritesIn(src: ts.SourceFile, field: string, allow?: (n: ts.Node, src: ts.SourceFile) => boolean, file = src.fileName): string[] {
  const out: string[] = []
  const named = NAMED(src)
  const at = (n: ts.Node) => { const p = src.getLineAndCharacterOfPosition(n.getStart()); out.push(`${file}:${p.line + 1}:${p.character + 1}`) }
  const targets = (n: ts.Node): boolean => isField(n, field, named) || ((ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n) || ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) || ts.isSpreadElement(n) || ts.isSpreadAssignment(n)) && (ts.forEachChild(n, (c) => targets(c) || undefined) ?? false))
  const visit = (n: ts.Node, inside: boolean): void => {
    const here = inside || !!allow?.(n, src)
    if (!here) {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && targets(n.left)) at(n)
      if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator) && isField(n.operand, field, named)) at(n)
      if (ts.isDeleteExpression(n) && isField(n.expression, field, named)) at(n)
      if (ts.isCallExpression(n) && WRITERS.has(n.expression.getText(src)) && n.arguments.slice(1).some((a) => hasKey(a, field, named))) at(n)
    }
    ts.forEachChild(n, (c) => visit(c, here))
  }
  visit(src, false)
  return out
}

/** Разбор исходника как текста: законная запись — метод `method` в `file`. */
export const inMethod = (file: string, method: string) => (n: ts.Node, src: ts.SourceFile): boolean =>
  ts.isMethodDeclaration(n) && n.name.getText(src) === method && src.fileName === file
