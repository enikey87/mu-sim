// Праздники по календарю переписки: окно шире одного дня — сообщение двигает календарь на 1–3 дня.
import { dateOf } from '../engine/time'
import { type Line, eq, gate, gte, is, lte, matches, missing } from './fact'
import { endgame, taxFrozen } from './memkeys'

export type Holiday = 'newYear' | 'march8' | 'trndez' | 'builders'

/** Сейф в партии: любая из легенд сейфа (safe_nune / safe_baby / safe_wrongkey) — вводит серия Нуне.
 *  Строки праздников, называющие сейф, без живой легенды молчат (#1041). */
const safeLegend = matches('legend', /^safe/)

/** Второе воскресенье августа (1–7 — первое, плюс неделя): День строителя. */
function secondSundayOfAugust(year: number): number {
  const aug1 = new Date(year, 7, 1).getDay()
  return 1 + ((7 - aug1) % 7) + 7
}

/** Окна: Новый год 30.12–03.01, Трндез 12–14.02, 8 Марта 06–09.03, День строителя — второе воскресенье августа ±1 день. */
export function holidayOf(day: number): Holiday | undefined {
  const d = dateOf(day)
  const month = d.getMonth() + 1
  const dom = d.getDate()
  if ((month === 12 && dom >= 30) || (month === 1 && dom <= 3)) return 'newYear'
  if (month === 2 && dom >= 12 && dom <= 14) return 'trndez'
  if (month === 3 && dom >= 6 && dom <= 9) return 'march8'
  if (month === 8) {
    const sun = secondSundayOfAugust(d.getFullYear())
    if (dom >= sun - 1 && dom <= sun + 1) return 'builders'
  }
}

/** Предпраздничная часть окна: кнопка игрока только до дня праздника (#828).
 *  Само окно `holidayOf` (отмазки, поздравление, открытка) не сужается. */
export function holidayBefore(day: number): boolean {
  const h = holidayOf(day)
  if (!h) return false
  const d = dateOf(day)
  const dom = d.getDate()
  if (h === 'newYear') return d.getMonth() === 11
  if (h === 'trndez') return dom === 12
  if (h === 'march8') return dom < 8
  return dom < secondSundayOfAugust(d.getFullYear())
}

/** Праздники и сезоны, на которые Алик ссылается сроком: по календарю считается горизонт. */
export type HolidayRef = 'navasard' | 'vardavar' | 'easter' | 'winter' | 'apricots' | 'fullmoon' | 'spring'
const FIXED: Record<Exclude<HolidayRef, 'easter' | 'vardavar' | 'fullmoon'>, [month: number, dom: number]> = {
  navasard: [8, 11], winter: [12, 1], apricots: [7, 1], spring: [3, 1],
}
/**
 * Пасха — григорианский компут (#861): армянская церковь празднует её в один день с западной
 * (2026 — 5 апреля, 2027 — 28 марта; юлианские 12 апреля и 2 мая — православные, не армянские).
 * Вардавар — через 98 дней после неё: 2026 — 12 июля, 2027 — 4 июля.
 */
function easterOf(year: number): Date {
  // алгоритм Меёса (Jones/Butcher) для григорианской Пасхи
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  return new Date(year, month - 1, ((h + l - 7 * m + 114) % 31) + 1)
}

/** Юлианская дата полнолуния по Меёсу (Astronomical Algorithms, гл. 49): k — номер лунации от 2000-го, дробный. */
function fullMoonJde(k: number): number {
  const rad = Math.PI / 180
  const T = k / 1236.85
  const E = 1 - 0.002516 * T - 0.0000074 * T * T
  const M = (2.5534 + 29.1053567 * k - 0.0000014 * T * T) * rad
  const P = (201.5643 + 385.81693528 * k + 0.0107582 * T * T) * rad
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T) * rad
  const O = (124.7746 - 1.56375588 * k + 0.0020672 * T * T) * rad
  const sin = Math.sin
  const c = -0.40614 * sin(P) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * P) + 0.01043 * sin(2 * F)
    + 0.00734 * E * sin(P - M) - 0.00515 * E * sin(P + M) + 0.00209 * E * E * sin(2 * M)
    - 0.00111 * sin(P - 2 * F) - 0.00057 * sin(P + 2 * F) + 0.00056 * E * sin(2 * P + M)
    - 0.00042 * sin(3 * P) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
    - 0.00024 * E * sin(2 * P - M) - 0.00017 * sin(O)
  return 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T + c
}

/** Ближайшее полнолуние не раньше `from`; дата — по UTC, как в астрономических календарях (#861). */
function nextFullMoon(from: Date): Date {
  const want = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  let k = Math.floor((want / 864e5 + 2440587.5 - 2451550.1) / 29.530588861) - 1
  for (;;) {
    const at = new Date((fullMoonJde(k + 0.5) - 2440587.5) * 864e5)
    const y = at.getUTCFullYear(), m = at.getUTCMonth(), d = at.getUTCDate()
    if (Date.UTC(y, m, d) >= want) return new Date(y, m, d)
    k += 1
  }
}
/** Сколько дней от `day` до ближайшего наступления праздника или сезона (0 — сегодня). */
export function holidayDays(ref: HolidayRef, day: number): number {
  const from = dateOf(day)
  const between = (to: Date) => Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 864e5)
  const at = (year: number): Date => {
    if (ref === 'fullmoon') return nextFullMoon(from)
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
/** Кнопка игрока в окне праздника (#585, «После MVP» документа): деньги под праздником. */
export const P_HOLIDAY: Record<Holiday, readonly Line[]> = {
  newYear: [
    'Новый год на носу. Где деньги, Алик?',
    'С Новым годом! Обещанные деньги — в подарок?',
    'Праздник же. Переведите хотя бы половину ёлки.',
  ],
  march8: [
    'С 8 Марта! А с зарплатой что?',
    'Женский день. Моей совести — подарок?',
    // «оттаяли» — про замороженные счета: вопрос свеж, пока счета заморожены и оттайку не объявляли (#1029)
    gate(is(taxFrozen))('Праздник весны. Деньги оттаяли?'),
  ],
  trndez: [
    'Трндез. Костёр. Где деньги, Алик?',
    'Праздник огня. Перевод тоже греется?',
    'Влюблённые прыгают. А зарплата?',
  ],
  builders: [
    'День строителя. Где расчёт за стройку?',
    'Ты строитель, я строитель. Кто кому должен?',
    'Праздник профессии. Профессия включает перевод?',
  ],
}

/** Ответ Алика на упрёк про деньги в окне праздника (#585): ход не превращается в обычную отмазку мимо праздника.
 *  Окно шире одного дня — и пул это знает: до праздника формулировки «наступающего», в сам праздник и после —
 *  «начавшегося» (#802, как HOLIDAY_EXCUSES). «С наступающим» 1 января или «С 8 Марта» 6 марта — неверный день. */
export const HOLIDAY_MONEY: Record<Holiday, Line[]> = {
  newYear: [
    // 30–31.12 — про наступающий, 01–03.01 — про начавшийся
    { t: 'Праздник — это когда гирлянда мигает, а перевод ждёт. С наступающим, брат!', when: [eq('month', 12)] },
    { t: 'Новый год — время чудес. Ты ждёшь перевод, а я — что ты про него забудешь. Верим, брат.', when: [eq('month', 12)] },
    { t: 'Шампанское пьём, гирлянда мигает, перевод молчит. Праздник, брат. Всё как ты любишь.', when: [eq('month', 12)] },
    { t: 'С Новым годом, брат! Год только начался, а перевод — ещё в пути.', when: [eq('month', 1)] },
    { t: 'В новом году я обещал себе не врать. Начну с честного: обещание было необдуманное.', when: [eq('month', 1)] },
    { t: 'Первый день года, брат. Начинать с переводов — плохая примета.', when: [eq('month', 1), eq('dom', 1)] },
  ],
  march8: [
    // 06–07.03 — подготовка, 08–09.03 — поздравление; «Сегодня» — только 8-го (#255, как в отмазках)
    { t: 'Восьмое марта на носу, брат. Цветы — женщинам, уважение — всем, деньги — мне. Я шучу, деньги — никому.', when: [lte('dom', 7)] },
    { t: 'Женский день на носу, брат. Кому-то цветы, кому-то обед, а тебе — уважение. Бюджет праздника.', when: [lte('dom', 7)] },
    { t: 'Праздник весны на носу, джан. Всё расцветает: тюльпаны, вишня, мои отмазки.', when: [lte('dom', 7)] },
    { t: 'С 8 Марта! Цветы — женщинам, уважение — всем, деньги — мне. Я шучу, деньги — никому.', when: [gte('dom', 8)] },
    { t: 'Женский день, брат. Кому-то цветы, кому-то обед, а тебе — уважение. Бюджет праздника.', when: [gte('dom', 8)] },
    { t: 'Праздник весны, джан. Всё расцветает: тюльпаны, вишня, мои отмазки.', when: [gte('dom', 8)] },
    { t: 'Сегодня не про переводы — сегодня про тюльпаны. Завтра тоже про тюльпаны.', when: [eq('dom', 8)] },
  ],
  // 12.02 — костёр ещё не разожгли, 13.02 — прыгают, 14.02 — прыгнули
  trndez: [
    { t: 'Трндез на носу, брат. Костёр ещё не сложили. Деньги в обряде не значатся — я проверял.', when: [eq('dom', 12)] },
    { t: 'Сегодня праздник огня. Прыгают парами. Перевод один и прыгать отказывается.', when: [eq('dom', 13)] },
    { t: 'Через костёр прыгнули — деньги сгорели. Мой долг не сгорел: он огнеупорный.', when: [eq('dom', 14)] },
  ],
  // суббота — на носу, воскресенье — сам день, понедельник — акт закрыт
  builders: [
    { t: 'День строителя на носу. Каска на мне, долг на объекте, графа «оплата» — в следующем проекте.', when: [eq('dow', 6)] },
    { t: 'С Днём строителя! Ты строитель, я строитель — строители строителям не платят, это профессиональное.', when: [eq('dow', 0)] },
    { t: 'Строители друг друга поздравили. Акт праздника закрыт. Перевод в смету не внесли.', when: [eq('dow', 1)] },
  ],
}

export function holidayGreetKey(day: number): string | undefined {
  const h = holidayOf(day)
  if (!h) return undefined
  const d = dateOf(day)
  if (h === 'newYear') {
    const startYear = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
    return `newYear@${startYear}`
  }
  return `${h}@${d.getFullYear()}`
}

const ny = [eq('holiday', 'newYear'), missing(endgame.active)] as const
const m8 = [eq('holiday', 'march8'), missing(endgame.active)] as const
const tr = [eq('holiday', 'trndez'), missing(endgame.active)] as const
const bd = [eq('holiday', 'builders'), missing(endgame.active)] as const

/**
 * Отмазки Алика — пул Lines (не колода ABSURD): закрытый гейт не сдвигает RNG колод.
 * До праздника и в праздник — разные реплики: «он же только начался» 30 декабря неправда, а срок в тексте —
 * обещание без записи в журнал. Праздник по календарю, а не по словам строки.
 */
export const HOLIDAY_EXCUSES: Line[] = [
  // Новый год: 30–31.12 — про наступающий, 01–03.01 — про начавшийся
  // «сейф тоже нарядили» — только при живой легенде сейфа (#1041): иначе сейф в партии не вводили
  { t: 'Новый год на носу, брат. Сейф тоже нарядили — мигает.', when: [...ny, eq('month', 12), safeLegend] },
  { t: 'Ёлка стоит, гирлянда мигает, перевод подождёт. Праздник же.', when: [...ny, eq('month', 12)] },
  { t: 'С наступающим, брат! Шампанское открыли, а сейф — нет.', when: [...ny, eq('month', 12), safeLegend] },
  { t: 'С Новым годом, брат! Год только начался, куда спешить.', when: [...ny, eq('month', 1)] },
  { t: 'В новом году всё по-новому. Кроме сейфа: как не открывался, так и не открывается.', when: [...ny, eq('month', 1), safeLegend] },
  { t: 'Первый день года, брат. Начинать с переводов — плохая примета.', when: [...ny, eq('month', 1), eq('dom', 1)] },
  // 8 Марта: 06–07.03 — подготовка, 08–09.03 — поздравление; «Сегодня» — только 8-го (#255)
  { t: 'Восьмое марта на носу, брат. Уже выбираю тюльпаны. Себе.', when: [...m8, lte('dom', 7)] },
  { t: 'Готовлюсь к женскому дню: цветы, открытки, уважение. По списку.', when: [...m8, lte('dom', 7)] },
  { t: 'С 8 Марта, брат! Женщинам — цветы, тебе — моё уважение.', when: [...m8, gte('dom', 8)] },
  { t: 'Международный женский день, джан. Сегодня не про переводы — сегодня про тюльпаны.', when: [...m8, eq('dom', 8)] },
  { t: 'С праздником весны! Всех уже поздравил. Тебе желаю терпения. Ещё немного пригодится.', when: [...m8, gte('dom', 8)] },
  // Трндез: 12.02 — костёр ещё не разожгли, 13.02 — прыгают, 14.02 — прыгнули
  { t: 'Трндез на носу, брат. Костёр ещё не сложили. Перевод в акте числится статьёй «сгорело».', when: [...tr, eq('dom', 12)] },
  { t: 'Сегодня через костёр прыгают влюблённые. Перевод в паре не состоит: боится огня.', when: [...tr, eq('dom', 13)] },
  { t: 'Через костёр прыгнули — деньги сгорели. Любовь, говорят, остаётся. Перевод в обряде не значится.', when: [...tr, eq('dom', 14)] },
  // День строителя: суббота — на носу, воскресенье — сам день, понедельник — акт закрыт
  { t: 'День строителя на носу. Каска наглажена, смета подписана, графа «перевод» пустая.', when: [...bd, eq('dow', 6)] },
  { t: 'С Днём строителя! Ты строитель, я строитель — строители строителям не платят, это профессиональное.', when: [...bd, eq('dow', 0)] },
  { t: 'Строители друг друга поздравили. Акт праздника закрыт. Акт оплаты — отдельный документ.', when: [...bd, eq('dow', 1)] },
]
