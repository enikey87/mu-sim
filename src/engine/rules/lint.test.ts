import { describe, it, expect } from 'vitest'
import { lintRules } from './lint'
import { eq, named } from './criteria'
import type { Rule } from './types'

type R = Rule<unknown>
const r = (name: string, extra: Partial<R> = {}): R => ({ name, event: 'E', when: [], respond: () => {}, ...extra })

describe('линтер правил', () => {
  it('правило без ответа, отрицательный вес, шанс вне 0..1', () => {
    const issues = lintRules([
      { name: 'Empty', event: 'E', when: [eq('z', 1)] },
      r('NegW', { weight: -1, when: [eq('q', 1)] }),
      r('BadOdds', { odds: 1.5, when: [eq('w', 1)] }),
      r('BadOdds2', { odds: -0.1, when: [eq('v', 1)] }),
      r('FnWeight', { weight: () => -1, when: [eq('u', 1)] }), // функцию статически не проверить
    ])
    expect(issues.map((i) => [i.rule, i.kind])).toEqual([['Empty', 'no-effect'], ['NegW', 'bad-weight'], ['BadOdds', 'bad-odds'], ['BadOdds2', 'bad-odds']])
  })
  it('перекрытое правило: более специфичное всегда доступное с подмножеством условий', () => {
    const issues = lintRules([r('Wide', { bonus: 2 }), r('Narrow', { when: [eq('x', 1)] })])
    expect(issues).toEqual([{ rule: 'Narrow', kind: 'shadowed', message: 'всегда проигрывает Wide' }])
  })
  it('sender/target учитываются как условия', () => {
    expect(lintRules([r('ToGarik', { target: 'garik', bonus: 2 }), r('ToGarikX', { target: 'garik', when: [eq('x', 1)] })])).toHaveLength(1)
    expect(lintRules([r('ToGarik', { target: 'garik', bonus: 2 }), r('ToKarine', { target: 'karine', when: [eq('x', 1)] })])).toEqual([])
    expect(lintRules([r('FromBoris', { sender: 'boris', bonus: 2 }), r('FromBorisX', { sender: 'boris', when: [eq('x', 1)] })])).toHaveLength(1)
  })
  it('не перекрывает, если «перекрывающее» бывает недоступно: шанс, once, перерыв, приоритет ниже', () => {
    for (const extra of [{ odds: 0.5 }, { once: true }, { cooldown: { turns: 3 } }, { priority: 'chatter' as const }]) {
      expect(lintRules([r('Wide', { bonus: 2, ...extra }), r('Narrow', { when: [eq('x', 1)] })])).toEqual([])
    }
  })
  it('другое событие, не подмножество условий, сборщики — не перекрытие', () => {
    expect(lintRules([r('Wide', { bonus: 2 }), r('Other', { event: 'F', when: [eq('x', 1)] })])).toEqual([])
    expect(lintRules([r('Cond', { bonus: 2, when: [eq('y', 1)] }), r('Narrow', { when: [eq('x', 1)] })])).toEqual([])
    expect(lintRules([r('Wide', { bonus: 2 }), r('Offer', { when: [eq('x', 1)] })], ['E'])).toEqual([])
  })
  it('неизвестный ключ факта: опечатка = молча мёртвое условие', () => {
    const known = (key: string) => key.startsWith('ok.')
    const issues = lintRules([
      r('Good', { when: [eq('ok.a', 1)] }),
      r('Typo', { when: [eq('okz.a', 1)] }),
      r('TypoInRemember', { remember: [{ key: 'okz.b', op: '=', value: true }] }),
      r('Named', { when: [named('Метка', eq('okz.c', 1))] }), // метка не ключ — проверяются дети
      r('NamedOk', { when: [named('Метка', eq('ok.b', 1))] }),
      r('BareAll', { when: [{ key: 'okz.d', op: 'all' }] }), // контейнер без детей — нечего проверять
      r('EventScope', { when: [{ key: 'okz.e', op: '==', value: 1, scope: 'event' }] }), // факты события — не ключи
    ], [], { keyCheck: known })
    expect(issues.map((i) => [i.rule, i.kind])).toEqual([['Typo', 'unknown-key'], ['TypoInRemember', 'unknown-key'], ['Named', 'unknown-key']])
    // без keyCheck гейт молчит — проверка opt-in
    expect(lintRules([r('Any', { when: [eq('whatever', 1)] })])).toEqual([])
  })
})
