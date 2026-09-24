import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import { START_MONEY } from './state'
import { fieldWrites, fieldWritesIn, inMethod, sources } from '../test/field'

// Деньги пишет только Game.adjustMoney: прямую запись `S.money = …` не пропускает тип (readonly в GameState),
// а разбор `test/field.ts` ловит то, что тип пропускает (переменную, Object.assign, defineProperty, Reflect.set).
const game = join('src', 'engine', 'game.ts')
const moneyWrites = (file: string, allowAdjust = true) => fieldWrites(file, 'money', allowAdjust ? inMethod(game, 'adjustMoney') : undefined)
const parse = (code: string) => ts.createSourceFile('case.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const found = (code: string) => fieldWritesIn(parse(code), 'money')

describe('деньги: одна точка записи', () => {
  it('страж видит исходники и единственную законную запись', () => {
    expect(sources).toContain(game)
    // без исключения страж находит ровно одну запись — ту, что в adjustMoney
    expect(moneyWrites(game, false)).toHaveLength(1)
  })

  it('никто, кроме Game.adjustMoney, не пишет в money', () => {
    expect(sources.flatMap((f) => moneyWrites(f))).toEqual([])
  })

  it('обходы readonly: приращение, инкремент, скобочная запись, приведение', () => {
    expect(found('const g = 1; g.S.money += 100')).toHaveLength(1)
    expect(found('this.S.money++')).toHaveLength(1)
    expect(found("this.S['money'] += 50")).toHaveLength(1)
    expect(found('(this.S as any).money = 0')).toHaveLength(1)
    expect(found('((g.S as unknown) as { money: number }).money = 0')).toHaveLength(1)
    expect(found("Object.assign(g.S, { money: 10 })")).toHaveLength(1)
    expect(found("Reflect.set(g.S, 'money', 10)")).toHaveLength(1)
    // законная точка записи счёта мимо adjustMoney — тоже запись: геттер её не пустит, страж обязан назвать
    expect(found("setCount(g.S, 'money', 10)")).toHaveLength(1)
    // переменная без readonly не спасает: исключение — только сам adjustMoney
    expect(found('const w: { money: number } = g.S; w.money = 0')).toHaveLength(1)
    expect(found('g.S.moneyLevel()')).toEqual([])
  })

  it('тип и геттер: прямая запись денег не компилируется и не проходит', () => {
    const { game: g } = makeGame()
    // @ts-expect-error money readonly: пишет только adjustMoney
    expect(() => { g.S.money = 100 }).toThrow(TypeError)
    // @ts-expect-error money readonly, в том числе приращением
    expect(() => { g.S.money += 100 }).toThrow(TypeError)
    expect(g.adjustMoney(0, 'проверка')).toBe(true) // законный путь жив
    expect(g.S.money).toBe(START_MONEY)
  })
})
