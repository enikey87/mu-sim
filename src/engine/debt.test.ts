import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'

// Долг пишет только Game.adjustDebt. Прямую запись `S.debt = …` не пропускает тип (readonly в GameState);
// этот страж ловит то, что тип пропускает: запись через переменную без readonly, Object.assign, defineProperty, Reflect.set.
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
const sources = walk('src').filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && !f.startsWith(join('src', 'test')))

/** Скобки и приведения не меняют, куда идёт запись: ((S as X).debt)++ — та же запись. */
const bare = (n: ts.Node): ts.Node => (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isTypeAssertionExpression(n) ? bare(n.expression) : n)
const isDebtKey = (n: ts.Node) => { const k = bare(n); return ts.isStringLiteralLike(k) && k.text === 'debt' }
const isDebt = (x: ts.Node): boolean => {
  const n = bare(x)
  return (ts.isPropertyAccessExpression(n) && n.name.text === 'debt') || (ts.isElementAccessExpression(n) && isDebtKey(n.argumentExpression))
}
const hasDebtKey = (n: ts.Node | undefined): boolean =>
  !!n && ((ts.isStringLiteralLike(n) && n.text === 'debt') ||
    (ts.isObjectLiteralExpression(n) && n.properties.some((p) => (p.name && ts.isIdentifier(p.name) && p.name.text === 'debt') || (p.name && ts.isStringLiteralLike(p.name) && p.name.text === 'debt') || ts.isSpreadAssignment(p))))
const WRITERS = new Set(['Object.assign', 'Object.defineProperty', 'Object.defineProperties', 'Reflect.set', 'Reflect.defineProperty'])

/** Места записи долга в файле: «файл:строка». */
function debtWrites(file: string, allowAdjust = true): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const at = (n: ts.Node) => out.push(`${file}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`)
  const targets = (n: ts.Node): boolean => isDebt(n) || ((ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n) || ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) || ts.isSpreadElement(n) || ts.isSpreadAssignment(n)) && (ts.forEachChild(n, (c) => targets(c) || undefined) ?? false))
  const visit = (n: ts.Node, inAdjust: boolean): void => {
    const here = inAdjust || (allowAdjust && ts.isMethodDeclaration(n) && n.name.getText(src) === 'adjustDebt' && file === join('src', 'engine', 'game.ts'))
    if (!here) {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && targets(n.left)) at(n)
      if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator) && isDebt(n.operand)) at(n)
      if (ts.isDeleteExpression(n) && isDebt(n.expression)) at(n)
      if (ts.isCallExpression(n) && WRITERS.has(n.expression.getText(src)) && n.arguments.slice(1).some(hasDebtKey)) at(n)
    }
    ts.forEachChild(n, (c) => visit(c, here))
  }
  visit(src, false)
  return out
}

describe('долг: одна точка записи', () => {
  it('страж видит исходники и единственную законную запись', () => {
    const game = join('src', 'engine', 'game.ts')
    expect(sources).toContain(game)
    // без исключения страж находит ровно одну запись — ту, что в adjustDebt
    expect(debtWrites(game, false)).toHaveLength(1)
  })

  it('никто, кроме Game.adjustDebt, не пишет в debt', () => {
    expect(sources.flatMap((f) => debtWrites(f))).toEqual([])
  })

  it('после Дня выплаты: сообщение о долге — только если он изменился, работа не двигает календарь, перевода нет', async () => {
    const { ARCS } = await import('../content/arcs')
    const { game } = makeGame()
    game.S.mem.payday = 'default' // выплата состоялась: долг запечатан
    const debt = game.S.debt
    const sys = () => game.S.msgs.filter((m) => m.kind === 'sys').map((m) => m.text)
    // серия с fx.debt и sys «Алик вычел из долга 10 000 ₽»
    const ep = ARCS.tile.eps.find((e) => e.fx?.debt === -10000)!
    await game.playEpisode(ep, 'tile')
    expect(sys().join(' ')).not.toMatch(/вычел из долга/)
    // узел сцены с fx.debt и sys «Долг Алика вырос на 1 800 ₽»
    await game.enterNode('meet', 'cafe3')
    expect(sys().join(' ')).not.toMatch(/Долг Алика вырос/)
    game.S.scene = null
    // допработа: «Да» не двигает ни долг, ни календарь
    game.alikMsg({ kind: 'job', from: 'alik', text: 'Сделаешь забор?' })
    const job = game.S.msgs.find((m) => m.kind === 'job')!
    const day = game.S.day
    await game.answerJob(job.id, true)
    expect(game.S.day).toBe(day)
    // перевод: пузыря без денег нет
    const n = game.S.msgs.length
    await game.transfer()
    game.awayMsg('transfer') // перевод в пачке «пока тебя не было»
    expect(game.S.msgs.slice(n).some((m) => m.kind === 'transfer')).toBe(false)
    expect(game.S.debt).toBe(debt)
  })

  it('до Дня выплаты те же пути двигают долг и объявляют это', async () => {
    const { ARCS } = await import('../content/arcs')
    const { game } = makeGame()
    const debt = game.S.debt
    await game.playEpisode(ARCS.tile.eps.find((e) => e.fx?.debt === -10000)!, 'tile')
    expect(game.S.debt).toBe(debt - 10000)
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /вычел из долга 10 000/.test(m.text))).toBe(true)
    await game.enterNode('meet', 'cafe3')
    expect(game.S.debt).toBe(debt - 10000 + 1800)
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /Долг Алика вырос на 1 800/.test(m.text))).toBe(true)
  })
})
