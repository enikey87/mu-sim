// Тон: армянское в игре — тепло и колорит, а ненадёжность, вранье и неплатёж — черты Алика лично
// (DESIGN.md, «Тон»). Сторож ловит строку, где национальность значит «поздно», «не платит» или «врёт».
import { describe, it, expect } from 'vitest'
import { Gated, valueOf, type Entry } from '../engine/rules'
import { seededRng } from '../engine/rng'
import { make } from './excuses'
import { makeScenes } from './scenes'

const mods = import.meta.glob(['./*.ts', './rules/*.ts', '!./*.test.ts', '!./rules/*.test.ts'], { eager: true }) as Record<string, Record<string, unknown>>

/** Все строки контента: значения экспортов, включая реплики персонажей и записи колод. */
export function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (v instanceof Gated) strings(v.v, out)
  else if (Array.isArray(v)) for (const x of v) strings(x, out)
  else if (v && typeof v === 'object' && !(v instanceof RegExp)) {
    for (const x of Object.values(v as Record<string, unknown>)) strings(x, out)
  }
  return out
}

function corpus(): { where: string; t: string }[] {
  const out: { where: string; t: string }[] = []
  for (const [file, m] of Object.entries(mods)) {
    for (const [name, v] of Object.entries(m)) {
      if (typeof v === 'function') continue
      for (const t of strings(v)) out.push({ where: `${file.slice(2, -3)}.${name}`, t })
    }
  }
  // реплики сцен живут не в значениях экспорта, а в его вызове — как в корпусе mentions.test.ts
  const X = make(<T>(_k: string, a: readonly Entry<T>[]) => valueOf(a[0]), () => 0, seededRng(1))
  for (const t of strings(makeScenes(X))) out.push({ where: 'scenes', t })
  return out
}

/** Национальность как причина: срок, время, календарь, пятница, подрядчик, обещание, перевод, «не читает/не понимает». */
const CAUSE = /врем|срок|календар|пятниц|подрядчик|обещани|перевёл|перевел|перевод|медленн|позж|завтра|чита|понима/i
/** Обобщение на народ: «твой армянин», «армяне не…». */
const GENERALIZE = /твой армянин|армяне\s+(не|вечно|всегда)/i
const bad = (t: string) => /армян/i.test(t) && (CAUSE.test(t) || GENERALIZE.test(t))

describe('тон: национальность — не оправдание', () => {
  it('корпус не пустой: пустой прошёл бы любую проверку', () => {
    const lines = corpus()
    expect(lines.length).toBeGreaterThan(1500)
    expect(lines.filter(({ t }) => /армян/i.test(t)).length).toBeGreaterThan(10) // тёплое армянское на месте
  })
  it('ни одна строка не делает «армянское» причиной невыплаты или вранья', () => {
    expect(corpus().filter(({ t }) => bad(t)).map(({ where, t }) => `${where}: «${t.slice(0, 90)}»`)).toEqual([])
  })
  it('негативный контроль: запретная связка ловится, тёплая — нет', () => {
    expect(bad('По армянскому времени деньги будут позже.')).toBe(true)
    expect(bad('Ну что, заплатил твой армянин?')).toBe(true)
    expect(bad('Приложение банка армянский не понимает')).toBe(true)
    expect(bad('Слово армянина крепче банковского.')).toBe(false)
    expect(bad('Кричать — не по-армянски.')).toBe(false)
    expect(bad('Сколько длится армянская свадьба?')).toBe(false)
  })
})
