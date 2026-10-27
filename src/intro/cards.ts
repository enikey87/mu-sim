// Карточки интро: тексты и тайминги в одном месте. Читают двое — React-интро новой партии
// (src/ui/Intro.tsx) и титры шелла холодной загрузки (src/intro/shell.ts, #1444).
// Модуль без React и без корпуса: шелл берёт его целиком, ему нужны четыре строки и числа.
import type { Start } from '../content/starts'
import { START_DAY, fmtDate } from '../engine/time'

/** Карточки 0–3 — строки ~1,8 с; 4 — титул ~2,5 с. */
export const LINE_MS = 1800
export const FADE_MS = 280
export const TITLE_MS = 2500

/** Карточка 1 — постоянный текст: плитку положил игрок, а не Алик. */
export const INTRO_FIRST_LINE = 'Вы положили плитку на объекте Алика.'

/** fmtDate уже с «г.» — не клеим вторую точку. */
export const introDateLine = (date: string): string =>
  `Объект сдан ${date.replace(/\.$/, '')}.`

/** Обещание на карточке — как реплика, с заглавной (в STARTS.vow может быть обрывок со строчной). */
export const introVowLine = (vow: string): string =>
  `Алик: «${vow.charAt(0).toUpperCase()}${vow.slice(1)}»`

/** Строка завязки: шаблон завязки с числом дней новой партии — та же строка, что системная в чате. */
export const introGapLine = (start: Start, day = START_DAY): string => start.gap.replace('{d}', String(day))

/** Три факта партии, которые называют карточки: обещание, строка завязки, дата сдачи. */
export interface IntroText {
  vow: string
  gap: string
  date: string
}

/** Четыре строки-титра по порядку карточек — из тех же фактов, что пролог в чате. */
export const introLinesOf = (v: IntroText): readonly [string, string, string, string] =>
  [INTRO_FIRST_LINE, introDateLine(v.date), introVowLine(v.vow), v.gap]

/** Те же факты из завязки: шелл называет их до загрузки партии, поэтому день 0 — из календаря. */
export const introTextOf = (start: Start, day = START_DAY): IntroText =>
  ({ vow: start.vow, gap: introGapLine(start, day), date: fmtDate(0) })
