// Линтер окон (#996): строка пула окна не утверждает того, чего событие окна не устанавливает.
// Класс #970/#974/#982: вариант-кнопка или ответ ссылается на трек, крик, ведомость или Страсбург
// до того, как их ввели. Карта «окно → метки» ниже — источник правды: метка объявлена окном (null)
// либо требует гейт на факт (FactKey); метка вне карты или без гейта — красный сюит.
// Опция allow — только с оправданием: строка, где ссылка осознанная и гейтом не чинится.
import { describe, it, expect } from 'vitest'
import { Gated, valueOf, is, gate, type Line, type FactKey } from './fact'
import type { Criterion } from '../engine/rules'
import * as PP from './rules/player-choice-pools'
import { ARCS } from './arcs'
import { D } from './excuses'
import { intro } from './memkeys'
import * as W from './world'
import {
  RAM_PHOTO, BORIS_SALE, VACANCY, AVITO_REVIEW, RUBIK_ASK, KETTLE,
  CREW_CALL_B, DEBUT_ARSEN_B, DEBUT_SAMVEL_B, GRANT_TILE_B, DEBUT_NIVA_B, DEBUT_BORIS_B, MOUSTACHE_PHOTO_B, MAMA_MARKET_B, SAMVEL_DIVORCE_B, GRANT_HOUSE_B, COURT_VERDICT_B, TILE_SLIP_B, NUNE_DEBUT_B,
  LAWYER_B, COLLECTORS_ASK_B, INTERN_B, HOLE_B, COUNTERSUIT_B,
} from './world'

/** Метки линтера: имена персонажей и объекты классов #970/#974/#982. Список узкий и осознанный —
 *  он ловит постороннюю ссылку, а не каждое слово: «рассчитали всех», «суд» и «плитка» в него не входят. */
const MARKS = [
  'Арсен', 'Самвел', 'Борис', 'Нуне', 'Карине', 'Грант', 'Тарон', 'Рубик', 'Мкртич', 'Размик', 'Гоар', 'Ашот', 'Гарик',
  'трек', 'бит', 'крик', 'Страсбург', 'конверт', 'ведомост', 'козл', 'звон', 'фундамент', 'чайник', 'стажировк', 'поручител', 'кум', 'тамад',
] as const

interface Window {
  /** Имя пула — как в коде: по нему же сверяется полнота карты. */
  pool: string
  lines: readonly Line[]
  /** Метка окна: null — событие утверждает её само; FactKey — строке нужен гейт на этот факт. */
  marks: Record<string, FactKey | null>
  /** Строки со ссылкой вне карты, которые гейтом не чинятся: [текст, почему допустимо]. */
  allow?: ReadonlyArray<readonly [string, string]>
}

/** Окна: пулы кнопок игрока и пулы ответов событий (#927/#958/#964/#973/#982/#983). */
const WINDOWS: Window[] = [
  // --- окна ответов на первые сообщения и события
  { pool: 'P_LAWYER', lines: PP.P_LAWYER, marks: { Арсен: null, Страсбург: 'court.saidStrasburg' } },
  { pool: 'LAWYER_B', lines: LAWYER_B, marks: { Арсен: null, Страсбург: 'court.saidStrasburg' } },
  { pool: 'P_DEBUT_ARSEN', lines: PP.P_DEBUT_ARSEN, marks: { Арсен: null, трек: 'arsen.track', крик: 'arsen.track', бит: 'arsen.track' } },
  { pool: 'DEBUT_ARSEN_B', lines: DEBUT_ARSEN_B, marks: { Арсен: null, трек: 'arsen.track', крик: 'arsen.track', бит: 'arsen.track' } },
  { pool: 'P_DEBUT_SAMVEL', lines: PP.P_DEBUT_SAMVEL, marks: { Самвел: null } },
  { pool: 'DEBUT_SAMVEL_B', lines: DEBUT_SAMVEL_B, marks: { Самвел: null } },
  { pool: 'P_DEBUT_BORIS', lines: PP.P_DEBUT_BORIS, marks: { Борис: null } },
  { pool: 'DEBUT_BORIS_B', lines: DEBUT_BORIS_B, marks: { Борис: null } },
  { pool: 'P_DEBUT_NIVA', lines: PP.P_DEBUT_NIVA, marks: {} },
  // дебют бухгалтера (#1071): имя Нуне вводит само её первое письмо — окно события
  { pool: 'P_NUNE_DEBUT', lines: PP.P_NUNE_DEBUT, marks: { Нуне: null } },
  { pool: 'NUNE_DEBUT_B', lines: NUNE_DEBUT_B, marks: { Нуне: null } },
  { pool: 'DEBUT_NIVA_B', lines: DEBUT_NIVA_B, marks: {} },
  { pool: 'P_GRANT_TILE', lines: PP.P_GRANT_TILE, marks: { Грант: null, фундамент: 'heard.money_foundation' } },
  { pool: 'GRANT_TILE_B', lines: GRANT_TILE_B, marks: { Грант: null } },
  // второй дебют Гранта (#1041): пул и ответ ссылаются только на его же строку про дом и клад
  { pool: 'P_GRANT_HOUSE', lines: PP.P_GRANT_HOUSE, marks: {} },
  { pool: 'GRANT_HOUSE_B', lines: GRANT_HOUSE_B, marks: {} },
  { pool: 'P_CREW_CALL', lines: PP.P_CREW_CALL, marks: { Тарон: null, звон: null } },
  { pool: 'CREW_CALL_B', lines: CREW_CALL_B, marks: { Тарон: null, звон: null } },
  { pool: 'P_COLLECTORS_DEBUT', lines: PP.P_COLLECTORS_DEBUT, marks: { поручител: null } },
  { pool: 'P_COLLECTORS_ASK', lines: PP.P_COLLECTORS_ASK, marks: { поручител: null } },
  { pool: 'COLLECTORS_ASK_B', lines: COLLECTORS_ASK_B, marks: { поручител: null } },
  { pool: 'P_INTERN', lines: PP.P_INTERN, marks: { стажировк: null, ведомост: null } },
  { pool: 'INTERN_B', lines: INTERN_B, marks: { стажировк: null, ведомост: null } },
  { pool: 'P_HOLE', lines: PP.P_HOLE, marks: {} },
  { pool: 'HOLE_B', lines: HOLE_B, marks: {} },
  // --- окна заметных системных событий (#927)
  { pool: 'P_RAM_PHOTO', lines: PP.P_RAM_PHOTO, marks: { Борис: null } },
  { pool: 'RAM_PHOTO', lines: RAM_PHOTO, marks: {} },
  { pool: 'P_BORIS_SALE', lines: PP.P_BORIS_SALE, marks: { Борис: null } },
  { pool: 'BORIS_SALE', lines: BORIS_SALE, marks: { Борис: null } },
  { pool: 'P_VACANCY', lines: PP.P_VACANCY, marks: {} },
  { pool: 'VACANCY', lines: VACANCY, marks: {} },
  { pool: 'P_AVITO_REVIEW', lines: PP.P_AVITO_REVIEW, marks: {} },
  { pool: 'AVITO_REVIEW', lines: AVITO_REVIEW, marks: {} },
  { pool: 'P_RUBIK_ASK', lines: PP.P_RUBIK_ASK, marks: { Рубик: null } },
  { pool: 'RUBIK_ASK', lines: RUBIK_ASK, marks: { Рубик: null } },
  { pool: 'P_KETTLE', lines: PP.P_KETTLE, marks: { чайник: null, кум: null } },
  { pool: 'KETTLE', lines: KETTLE, marks: { чайник: null, кум: null } },
  { pool: 'P_COUNTERSUIT', lines: PP.P_COUNTERSUIT, marks: { кум: null, тамад: null } },
  { pool: 'COUNTERSUIT_B', lines: COUNTERSUIT_B, marks: { кум: null, тамад: null } },
  // --- окна, у которых метки только именами участников
  { pool: 'P_MOUSTACHE', lines: PP.P_MOUSTACHE, marks: {} },
  // окно ставки «усы» (#1013): «Карине» приходит только со знакомством — строка несёт needs('karine')
  { pool: 'P_MOUSTACHE_PHOTO', lines: PP.P_MOUSTACHE_PHOTO, marks: { Карине: 'intro.karine' } },
  { pool: 'MOUSTACHE_PHOTO_B', lines: MOUSTACHE_PHOTO_B, marks: { Карине: 'intro.karine' } },
  // конец квеста «мама на рынке» (#1030): мама приходит квестом, своих меток пул не требует
  { pool: 'P_MAMA_MARKET', lines: PP.P_MAMA_MARKET, marks: {} },
  { pool: 'MAMA_MARKET_B', lines: MAMA_MARKET_B, marks: {} },
  // развод дяди Самвела (#1037): конверт введён легендой свадьбы (#1016) — строки с ним несут гейт
  { pool: 'P_SAMVEL_DIVORCE', lines: PP.P_SAMVEL_DIVORCE, marks: { конверт: 'heard.samvel_envelopes' } },
  { pool: 'SAMVEL_DIVORCE_B', lines: SAMVEL_DIVORCE_B, marks: { конверт: 'heard.samvel_envelopes' } },
  // вердикт суда (#1058): строки вердиктов под собственным фактом, меток персонажей в пулах нет
  { pool: 'P_COURT_VERDICT', lines: PP.P_COURT_VERDICT, marks: {} },
  { pool: 'COURT_VERDICT_B', lines: COURT_VERDICT_B, marks: {} },
  // первая серия плиточной арки (#1059): падение заказчика — своих меток пул не требует
  { pool: 'P_TILE_SLIP', lines: PP.P_TILE_SLIP, marks: {} },
  { pool: 'TILE_SLIP_B', lines: TILE_SLIP_B, marks: {} },
  // фото «платёжки» (#1017): отклик на событие Turn_Photo — баран и «Арарат» тема самого события, меток нет
  { pool: 'D.P_PHOTO', lines: D.P_PHOTO, marks: {} },
  { pool: 'D.PHOTO_A', lines: D.PHOTO_A, marks: {} },
  { pool: 'D.PHOTO_B', lines: D.PHOTO_B, marks: {} },
  { pool: 'P_VIA_BORIS', lines: PP.P_VIA_BORIS, marks: { Борис: null } },
  { pool: 'P_VIA_KARINE', lines: PP.P_VIA_KARINE, marks: { Карине: null } },
  { pool: 'P_VIA_MAMA', lines: PP.P_VIA_MAMA, marks: {} },
  { pool: 'P_MOO', lines: PP.P_MOO, marks: {} },
  // угроза «до Страсбурга» сама вводит план и ставит факт saidStrasburg (#982) — это источник, не ссылка
  { pool: 'P_COURT', lines: PP.P_COURT, marks: { Арсен: null, Страсбург: null } },
]

/** Метки follow-пулов арок (#1013): что сериал этой арки объявляет сам (null) и на какой факт обязана
 *  быть гейтнута чужая метка. Список узкий — как MARKS: посторонняя ссылка краснеет, своя — нет. */
const ARC_MARKS: Record<string, Record<string, FactKey | null>> = {
  boris: { Борис: null }, // баран введён первой серией арки
  // фундамент — мотив арки (деньги в опалубке); Арсен/Грант/Гоар приходят её же сериями — вопросы несут needs(WORLD.*)
  beton: { фундамент: null, Арсен: 'intro.arsen', Грант: 'intro.grant', Гоар: 'intro.goar' },
  // свадьба и конверт — свои; Мкртич приходит из другой линии, вопрос гейтнут needs(WORLD.mkrtich)
  samvel: { Самвел: null, конверт: null, тамад: null, Мкртич: 'intro.mkrtich' },
  // «Нива» звонит: её серия говорит «Она за мой счёт звонит» (eps[4]); фундамент — из арки бетона, по факту
  niva: { звон: null, фундамент: 'heard.money_foundation' },
  collectors: { Тарон: 'intro.taron' },
  nune: { Нуне: null },
  rubik: { Рубик: null },
  grant: { Грант: null },
  razmik: { Размик: null },
  // Гарик и его фундамент — свои; конверт в фундаменте — мотив арки бетона, отсюда гейт на arc.beton
  garik: { Гарик: null, фундамент: 'garik.concrete', конверт: 'arc.beton' },
  tile: { Ашот: 'intro.judge' },
  alik_death: { Самвел: 'intro.samvel' },
}

/** Follow-пулы арок (#1013): вопрос про сериал ссылается только на то, что арка ввела, или несёт гейт. */
const arcWindows = (): Window[] =>
  Object.entries(ARCS).map(([id, a]): Window => ({ pool: `ARCS.${id}.follow`, lines: a.follow, marks: ARC_MARKS[id] ?? {} }))

/** Листья условий: вложенные named/all разворачиваются — сверяем по ключам фактов. */
const leaves = (cs: readonly Criterion[]): string[] =>
  cs.flatMap((c) => (c.op === 'all' ? leaves(c.all ?? []) : [String(c.key)]))
/** Гейт строки (её условия) или пусто: строка без ворот фактов не называет. */
const gateKeys = (l: Line): string[] => (l instanceof Gated ? leaves(l.when) : [])

/** Текст строки: valueOf разворачивает Gated, объект может нести ещё и `w`. */
const lineText = (l: Line): string => {
  const v = valueOf(l)
  return typeof v === 'string' ? v : String((v as { t?: unknown }).t ?? '')
}

/** Метка в тексте: без регистра, с границей слова перед меткой — «кум» не ловится в «документы». */
const hasMark = (text: string, mark: string): boolean =>
  new RegExp(`(^|[^а-яё])${mark}`, 'i').test(text)

/** Находки одной карты окна: метка объявлена окном (null), гейтнута на свой факт — или красная. */
const markIssues = (w: Window): string[] => {
  const issues: string[] = []
  const texts = new Set(w.lines.map(lineText))
  for (const [t, why] of w.allow ?? []) {
    if (!texts.has(t)) issues.push(`${w.pool}: allow «${t.slice(0, 40)}…» — строки больше нет (${why})`)
  }
  for (const l of w.lines) {
    const text = lineText(l)
    if ((w.allow ?? []).some(([t]) => t === text)) continue
    const gates = gateKeys(l)
    for (const mark of MARKS) {
      if (!hasMark(text, mark)) continue
      const need = w.marks[mark]
      if (need === undefined) { issues.push(`${w.pool}: метка «${mark}» вне карты окна — «${text}»`); continue }
      if (need === null) continue
      if (!gates.includes(need)) issues.push(`${w.pool}: «${mark}» без гейта на ${need} — «${text}»`)
    }
  }
  return issues
}

describe('окна держат только утверждённое (#996)', () => {
  it('каждая строка окна ссылается лишь на объявленное, либо несёт гейт на факт, либо оправдана в allow', () => {
    // пулы кнопок и ответов + follow-пулы арок (#1013): вопрос про сериал — то же окно, что кнопка
    const issues = [...WINDOWS, ...arcWindows()].flatMap(markIssues)
    expect(issues, `\n${issues.join('\n')}`).toEqual([])
  })

  it('НК детектора: чужая метка в follow-пуле без гейта краснеет, та же строка с гейтом — нет (#1013)', () => {
    const pool = (lines: Line[], marks: Record<string, FactKey | null> = { Борис: 'intro.baran' }): Window =>
      ({ pool: 'ARCS.test.follow', lines, marks })
    expect(markIssues(pool(['Ко мне пришёл Борис.'])).join(' '), 'метка без гейта не покраснела').toContain('без гейта на intro.baran')
    expect(markIssues(pool(['Ко мне пришёл Борис.'], {})).join(' '), 'метка вне карты окна не покраснела').toContain('вне карты окна')
    expect(markIssues(pool([gate(is(intro('baran')))('Ко мне пришёл Борис.')]))).toEqual([])
  })

  it('у каждого пула окна есть карта: новый пул без записи — красный', () => {
    const known = new Set(WINDOWS.map((w) => w.pool))
    const eventPools = (k: string, v: unknown): boolean =>
      Array.isArray(v) && (k.endsWith('_B') || ['RAM_PHOTO', 'BORIS_SALE', 'VACANCY', 'AVITO_REVIEW', 'RUBIK_ASK', 'KETTLE'].includes(k))
    const missing = [
      ...Object.entries(PP).filter(([, v]) => Array.isArray(v)).map(([k]) => k),
      ...Object.entries(W).filter(([k, v]) => eventPools(k, v)).map(([k]) => k),
    ].filter((k) => !known.has(k))
    expect(missing, `пулы без карты: ${missing.join(', ')}`).toEqual([])
  })

  it('карта не ссылается на пустые пулы: пул без строк — красный', () => {
    for (const w of WINDOWS) expect(w.lines.length, `${w.pool}: пул пуст`).toBeGreaterThan(0)
  })
})
