// Праздники по календарю переписки: окно шире одного дня — сообщение двигает календарь на 1–3 дня.
import { dateOf } from '../engine/time'
import { type Line, eq, gte, lte, missing } from './fact'
import { endgame } from './memkeys'

export type Holiday = 'newYear' | 'march8'

/** Окна: Новый год 30.12–03.01, 8 Марта 06.03–09.03 (docs/design/holidays.md). */
export function holidayOf(day: number): Holiday | undefined {
  const d = dateOf(day)
  const month = d.getMonth() + 1
  const dom = d.getDate()
  if ((month === 12 && dom >= 30) || (month === 1 && dom <= 3)) return 'newYear'
  if (month === 3 && dom >= 6 && dom <= 9) return 'march8'
}

/** Праздники и сезоны, на которые Алик ссылается сроком: по календарю считается горизонт. */
export type HolidayRef = 'navasard' | 'vardavar' | 'easter' | 'winter' | 'apricots' | 'snowmelt' | 'heating'
const FIXED: Record<Exclude<HolidayRef, 'easter' | 'vardavar'>, [month: number, dom: number]> = {
  navasard: [8, 11], winter: [12, 1], apricots: [7, 1], snowmelt: [4, 1], heating: [10, 15],
}
// Пасха — григорианский компут (армянская церковь перешла на него в 1924-м); Вардавар — через 98 дней после неё
function easterOf(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const n = h + l - 7 * m + 114
  return new Date(year, Math.floor(n / 31) - 1, (n % 31) + 1)
}
/** Сколько дней от `day` до ближайшего наступления праздника или сезона (0 — сегодня). */
export function holidayDays(ref: HolidayRef, day: number): number {
  const from = dateOf(day)
  const between = (to: Date) => Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 864e5)
  const at = (year: number): Date => {
    if (ref === 'easter' || ref === 'vardavar') {
      const d = easterOf(year)
      if (ref === 'vardavar') d.setDate(d.getDate() + 98)
      return d
    }
    return new Date(year, FIXED[ref][0] - 1, FIXED[ref][1])
  }
  const thisYear = between(at(from.getFullYear()))
  return thisYear >= 0 ? thisYear : between(at(from.getFullYear() + 1))
}

/** Ключ «поздравили»: год начала окна, не текущей даты — NY через 31.12→1.01 один раз (#255). */
export function holidayGreetKey(day: number): string | undefined {
  const h = holidayOf(day)
  if (!h) return undefined
  const d = dateOf(day)
  if (h === 'newYear') {
    const startYear = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
    return `newYear@${startYear}`
  }
  return `march8@${d.getFullYear()}`
}

const ny = [eq('holiday', 'newYear'), missing(endgame.active)] as const
const m8 = [eq('holiday', 'march8'), missing(endgame.active)] as const

/**
 * Отмазки Алика — пул Lines (не колода ABSURD): закрытый гейт не сдвигает RNG колод.
 * До праздника и в праздник — разные реплики: «он же только начался» 30 декабря неправда, а срок в тексте —
 * обещание без записи в журнал. Праздник по календарю, а не по словам строки.
 */
export const HOLIDAY_EXCUSES: Line[] = [
  // Новый год: 30–31.12 — про наступающий, 01–03.01 — про начавшийся
  { t: 'Новый год на носу, брат. Сейф тоже нарядили — мигает.', when: [...ny, eq('month', 12)] },
  { t: 'Ёлка стоит, гирлянда мигает, перевод подождёт. Праздник же.', when: [...ny, eq('month', 12)] },
  { t: 'С наступающим, брат! Шампанское открыли, а сейф — нет.', when: [...ny, eq('month', 12)] },
  { t: 'С Новым годом, брат! Год только начался, куда спешить.', when: [...ny, eq('month', 1)] },
  { t: 'В новом году всё по-новому: гирлянда мигает, сейф — по-старому.', when: [...ny, eq('month', 1)] },
  { t: 'Первый день года, брат. Начинать с переводов — плохая примета.', when: [...ny, eq('month', 1), eq('dom', 1)] },
  // 8 Марта: 06–07.03 — подготовка, 08–09.03 — поздравление; «Сегодня» — только 8-го (#255)
  { t: 'Восьмое марта на носу, брат. Уже выбираю тюльпаны. Себе.', when: [...m8, lte('dom', 7)] },
  { t: 'Готовлюсь к женскому дню: цветы, открытки, уважение. По списку.', when: [...m8, lte('dom', 7)] },
  { t: 'С 8 Марта, брат! Женщинам — цветы, тебе — моё уважение.', when: [...m8, gte('dom', 8)] },
  { t: 'Международный женский день, джан. Сегодня не про переводы — сегодня про тюльпаны.', when: [...m8, eq('dom', 8)] },
  { t: 'С праздником весны! Я уже всем поздравил. Тебя поздравляю терпением.', when: [...m8, gte('dom', 8)] },
]
