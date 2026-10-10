// Сторож: число дней в кнопке — только там, где у срока в мире есть наблюдаемый конец (#571).
// Дата (`due`), праздник календаря, идущее состояние со сроком в расписании или оценка, названная в реплике.
// У срока, который по замыслу не наступает, кнопка идёт из пула «никогда» — без числа.
import { describe, it, expect } from 'vitest'
import { D, type When } from './excuses'
import { LEGENDS } from './legends'
import { sick, wedding } from './memkeys'
import { valueOf, type Entry } from './fact'

const POOLS = ['WHEN', 'WHEN1', 'WHEN2', 'WHEN3'] as const
const terms = (): Array<[string, When]> => [
  ...POOLS.flatMap((k) => (D[k] as Entry<When>[]).map((e): [string, When] => [`D.${k}`, valueOf(e)])),
  ...Object.entries(LEGENDS).map(([id, l]): [string, When] => [`LEGENDS.${id}`, l.until]),
]

/** Оценки, которым число в кнопке положено (#571, «числа остаются»): названы в реплике или документе легенды. */
const EST_KEPT = new Set([
  'после праздника', 'после полнолуния', 'после футбола',
  'как новую смету составим', 'как квитанции восстановим', 'как плитку в углу снимешь', 'как я с того света вернусь',
])

/** Идущие состояния с концом в мире (#571): болезнь Бориса и свадьбы, которые кончаются. */
const END_STATES = new Set([sick, wedding('boris'), wedding('razmik')])

describe('источник числа: у срока есть конец в мире', () => {
  it('у «никогда» и абсурда нет источника горизонта — оценка, состояние, праздник', () => {
    const all = terms()
    let none = 0
    for (const [where, w] of all) {
      if (w.kind !== 'never' && w.kind !== 'absurd') continue
      none++
      const at = `${where}: «${w.t}»`
      expect([w.est, w.state, w.holiday], `${at}: число кнопке не из чего взять`).toEqual([undefined, undefined, undefined])
      // журналу обещаний d/due/condition оставлены — они про срок записи, не про горизонт
      expect(w.due, at).toBeUndefined()
    }
    expect(none, 'сроков без даты в пулах меньше известных — проверка пустеет').toBeGreaterThanOrEqual(30)
  })

  it('у события число возможно только при идущем состоянии с концом или оценке из списка «числа остаются»', () => {
    let events = 0
    for (const [where, w] of terms()) {
      if (w.kind !== 'event') continue
      events++
      const at = `${where}: «${w.t}»`
      if (w.state !== undefined) {
        // «сразу после свадьбы» общим префиксом накрывало свадьбу Самвела (8 дней) — число в кнопке (#571)
        expect(w.state.prefix, `${at}: unprefixed`).toBeUndefined()
        const keys = w.state.keys ?? (w.state.key !== undefined ? [w.state.key] : [])
        expect(keys.length, at).toBeGreaterThan(0)
        for (const k of keys) expect(END_STATES.has(k), `${at}: у «${k}» в мире нет конца — остаток срока не считать`).toBe(true)
      } else {
        expect(EST_KEPT.has(w.t), `${at}: нет ни конца в мире, ни названной в реплике оценки (#571)`).toBe(true)
      }
    }
    expect(events, 'событий в пулах меньше известных — проверка пустеет').toBeGreaterThanOrEqual(10)
  })

  it('каждый срок легенды — либо «никогда», либо событие с концом в мире (#571)', () => {
    for (const [id, l] of Object.entries(LEGENDS)) {
      const at = `LEGENDS.${id}: «${l.until.t}»`
      if (l.until.kind === 'never' || l.until.kind === 'absurd') expect([l.until.est, l.until.state, l.until.holiday], at).toEqual([undefined, undefined, undefined])
      else expect(l.until.kind, at).toBe('event')
    }
  })
})
