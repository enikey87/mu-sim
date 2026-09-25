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
    // ключ и патч через имя: в месте записи поля не видно, значение имени разбор достаёт (#253)
    expect(found("const k = 'money'\ng.S[k] = 0")).toHaveLength(1)
    expect(found("let k = 'money'\ng.S[k] = 0")).toHaveLength(1)
    expect(found("g.S['mo' + 'ney'] = 0")).toHaveLength(1)
    expect(found("Reflect.set(g.S, 'mo' + 'ney', 10)")).toHaveLength(1)
    expect(found("const k = 'money'\nsetCount(g.S, k, 10)")).toHaveLength(1)
    expect(found('const patch = { money: 0 }\nObject.assign(g.S, patch)')).toHaveLength(1)
    // …а чужой ключ и чужой патч записью не считаются: иначе страж ловил бы любое обращение по имени
    expect(found("const k = 'other'\ng.S[k] = 0")).toEqual([])
    expect(found('const p = { other: 1 }\nObject.assign(g.S, p)')).toEqual([])
    expect(found('g.S.moneyLevel()')).toEqual([])
  })

  it('обходы readonly бросают и денег не меняют: те же формы, что у долга (#253)', () => {
    const { game } = makeGame()
    const money = game.S.money
    const S = game.S as unknown as Record<string, unknown>
    const patch = { money: 0 }
    const asg = Object.assign
    const tries: Array<[string, () => void]> = [
      ['Object.assign с патчем-переменной', () => { Object.assign(S, patch) }],
      ['Object.assign с вычисляемым ключом', () => { Object.assign(S, { ['money']: 0 }) }],
      ['запись по ключу-переменной', () => { const k = 'money'; (S as Record<string, number>)[k] = 0 }],
      ['переименованный Object.assign', () => { asg(S, { money: 0 }) }],
      ['Object.entries/forEach по состоянию', () => { Object.entries(S).forEach(([k, v]) => { S[k] = v }) }],
    ]
    for (const [name, run] of tries) expect(run, name).toThrow(TypeError)
    // Reflect.set не бросает — возвращает false и не пишет
    expect(Reflect.set(S, 'money', 0)).toBe(false)
    expect(Reflect.set(S, 'mo' + 'ney', 0)).toBe(false)
    expect(game.S.money).toBe(money)
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
