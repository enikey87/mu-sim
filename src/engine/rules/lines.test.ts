import { describe, it, expect } from 'vitest'
import { Lines, lineId, lintLines, spec, type Line, type SaidState } from './lines'
import { gte, is } from './criteria'
import { seededRng } from '../rng'

const mk = (said: SaidState = {}) => {
  const clock = { turn: 0, day: 0 }
  return { lines: new Lines(said, seededRng(1), () => ({ ...clock })), clock, said }
}

describe('выбор реплики (Hades)', () => {
  it('строка — реплика без условий; id стабильный и зависит от пула', () => {
    expect(spec('А')).toEqual({ t: 'А' })
    expect(lineId('P', 'текст')).toBe(lineId('P', 'текст'))
    expect(lineId('P', 'текст')).not.toBe(lineId('Q', 'текст'))
    expect(lineId('P', 'а')).not.toBe(lineId('P', 'б'))
  })
  it('условия: реплика с невыполненным условием не существует', () => {
    const { lines } = mk()
    const pool: Line[] = [{ t: 'про суд', when: [gte('court', 4)] }, 'обычная']
    expect(lines.pick('P', pool, { court: 1 })!.text).toBe('обычная')
    expect(lines.eligible('P', pool, { court: 5 }).map((p) => p.text)).toEqual(['про суд', 'обычная'])
  })
  it('условия работают и через поиск по доскам (Resolver)', () => {
    const { lines } = mk()
    expect(lines.pick('P', [{ t: 'x', when: [is('sick')] }], (k) => (k === 'sick' ? true : undefined))!.text).toBe('x')
  })
  it('приоритет: пока есть важная реплика, обычные молчат', () => {
    const { lines } = mk()
    const pool: Line[] = ['обычная 1', { t: 'важная', prio: 2 }, 'обычная 2', { t: 'средняя', prio: 1 }]
    const p = lines.pick('P', pool, {})!
    expect(p.text).toBe('важная')
    lines.mark(p.id)
    expect(lines.pick('P', pool, {})!.text).toBe('средняя')
  })
  it('«уже сказано»: реплика звучит один раз, пул исчерпан — null', () => {
    const { lines, said } = mk()
    const pool = ['а', 'б']
    const got = new Set<string>()
    for (let i = 0; i < 2; i++) { const p = lines.pick('P', pool, {})!; got.add(p.text); lines.mark(p.id) }
    expect(got).toEqual(new Set(['а', 'б']))
    expect(lines.pick('P', pool, {})).toBeNull()
    expect(Object.keys(said)).toHaveLength(2)
    expect(lines.has(lineId('P', 'а'))).toBe(true)
  })
  it('повторяемые — после перерыва по ходам или дням; свежие раньше повторов', () => {
    const { lines, clock } = mk()
    const pool: Line[] = [{ t: 'ход', repeat: true, cooldown: { turns: 3 } }, { t: 'день', id: 'D', repeat: true, cooldown: { days: 2 } }]
    for (const p of [lines.pick('P', pool, {})!, lines.pick('P', pool, {})!]) lines.mark(p.id)
    expect(lines.pick('P', pool, {})).toBeNull()
    clock.turn = 3
    expect(lines.pick('P', pool, {})!.text).toBe('ход')
    clock.day = 2
    const fresh = lines.pick('P', [...pool, 'новая'], {})!
    expect(fresh.text).toBe('новая') // свежая раньше повтора
    expect(lines.eligible('P', pool, {}).map((p) => p.id)).toContain('D')
  })
  it('повторяемость и перерыв на весь пул; без перерыва — повтор сразу', () => {
    const { lines } = mk()
    const p = lines.pick('P', ['а'], {}, { repeat: true, cooldown: { turns: 1 } })!
    lines.mark(p.id)
    expect(lines.pick('P', ['а'], {}, { repeat: true, cooldown: { turns: 1 } })).toBeNull()
    expect(lines.pick('P', ['а'], {}, { repeat: true })!.text).toBe('а')
  })
  it('фильтр пула (например, «персонаж ещё не появился»)', () => {
    const { lines } = mk()
    expect(lines.pick('P', ['Борис', 'баран'], {}, { filter: (s) => !s.t.includes('Борис') })!.text).toBe('баран')
    expect(lines.pick('P', [], {})).toBeNull()
  })
})

describe('линтер пулов', () => {
  it('пустые реплики и повторы id', () => {
    expect(lintLines('P', ['а', 'б'])).toEqual([])
    const issues = lintLines('P', ['а', ' ', 'а', { t: 'в', id: 'X' }, { t: 'г', id: 'X' }])
    expect(issues).toHaveLength(3)
  })
})
