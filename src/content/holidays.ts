// Праздники по календарю переписки: окно шире одного дня — сообщение двигает календарь на 1–3 дня.
import { dateOf } from '../engine/time'
import { type Line, eq, missing } from '../engine/rules'
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

const ny = [eq('holiday', 'newYear'), missing(endgame.active)] as const
const m8 = [eq('holiday', 'march8'), missing(endgame.active)] as const

/** Отмазки Алика — пул Lines (не колода ABSURD): закрытый гейт не сдвигает RNG колод. Без срока в тексте. */
export const HOLIDAY_EXCUSES: Line[] = [
  { t: 'С Новым годом, брат! Деньги — в новом году. Он же только начался, куда спешить.', when: [...ny] },
  { t: 'Брат, шампанское открыли, а сейф — нет. В новом году всё по-новому — и долги тоже.', when: [...ny] },
  { t: 'Ёлка стоит, гирлянда мигает, перевод подождёт. Праздник же.', when: [...ny] },
  { t: 'С 8 Марта, брат! Женщинам — цветы, тебе — моё уважение. Деньги придут отдельно.', when: [...m8] },
  { t: 'Международный женский день, джан. Сегодня не про переводы — сегодня про тюльпаны.', when: [...m8] },
  { t: 'С праздником весны! Я уже всем поздравил. Тебя поздравляю терпением.', when: [...m8] },
]
