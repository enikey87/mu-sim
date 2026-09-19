// Мир последователен: персонаж или предмет, который появляется по ходу истории, упоминается только под требованием
// (needs / when / структура: серия сериала, финал, реплика персонажа). Регулярки — здесь, в проверке контента: игра текст не разбирает.
import { describe, it, expect } from 'vitest'
import { Gated, describeCriterion, valueOf, type Criterion, type Entry } from '../engine/rules'
import { WORLD, SPEAKS, type WorldKey } from './world'
import { ARCS, CAST } from './arcs'
import { FINALES } from './finales'
import { LEGENDS } from './legends'
import { TOPICS } from './topics'
import { QUESTS } from './quests'
import { make } from './excuses'
import { makeScenes } from './scenes'
import { sceneRules, QUEST_WHEN } from './rules/world'
import { paydayRules } from './rules/payday'
import { seededRng } from '../engine/rng'
import { playtest } from '../tools/playtest'
import type { Game } from '../engine/game'
import type { Msg } from '../engine/state'

const W = '(?<![а-яё])'
/** Появляется по ходу истории: упоминание требует присутствия. */
export const MENTION: Array<[WorldKey, RegExp]> = [
  ['boris', /Борис/],
  ['baran', new RegExp(W + 'баран', 'i')],
  ['razmik', /Размик/],
  // «кран», но не «экран» и не «крановщик»
  ['crane', new RegExp(W + 'кран(?:а|у|ом|е)?(?![а-яё])', 'i')],
  ['rubik', /Рубик/],
  ['twin', /близнец/i],
  ['arsen', /Арсен/],
  ['grachik', /Грачик/],
  ['dekret', /декрет|ребёнок спит|с ребёнком на руках/i],
  // «тамада» — роль, а не персонаж: у любого застолья свой тамада; «Алик — тамада» размечено needs('tamada') вручную
]
/** У персонажа меняется положение: упоминание должно явно учесть его (любой факт из списка). */
export const STATE: Array<[string, RegExp, string[]]> = [
  ['Гарик (фундамент)', /Гарик/, ['garikFree', 'garik.concrete', 'arc.garik', 'finale.garik']],
  ['Карине (ушла к Рубику)', /Карине|[Жж]ена сказала/, ['karineHome', 'finale.rubik', 'arc.rubik']],
  ['Размик (на кране)', /Размик[^.!?]*кран|кран[^.!?]*Размик|с крана/i, ['razmikUp', 'finale.razmik', 'arc.razmik']],
  ['«Нива» (в бегах)', /Нив[аеуыо]/, ['nivaHome', 'niva.away', 'arc.niva', 'finale.niva', 'has.niva']],
]

const atoms = (cs: readonly Criterion[]): Criterion[] => cs.flatMap((c) => (c.op === 'all' ? [c, ...atoms(c.all ?? [])] : [c]))
const num = (c: Criterion) => (typeof c.value === 'number' ? c.value : NaN)
/** Серии arc до n-й что-то ставят в память (remember): факты «есть с этой серии». */
const setBy = (arc: string, n: number): string[] =>
  (ARCS[arc]?.eps ?? []).slice(0, n).flatMap((e) => (e.remember ?? []).filter((o) => o.op === '=' && o.value === true).map((o) => o.key))
/** Условие c следует из известного known: то же самое или сильнее (серия дальше, финал — после всех серий, факт поставила серия). */
function implied(c: Criterion, known: Criterion[]): boolean {
  const arc = c.key.startsWith('arc.') ? c.key.slice(4) : null
  return known.some((k) => describeCriterion(k) === describeCriterion(c)
    || (arc !== null && (c.op === 'exist' || c.op === '>=') && (
      k.key === 'finale.' + arc && (k.op === 'exist' || k.op === '==')
      || k.key === c.key && k.op === '>=' && num(k) >= (c.op === 'exist' ? 1 : num(c))))
    || (c.op === '==' && c.value === true && k.key.startsWith('arc.') && k.op === '>=' && setBy(k.key.slice(4), num(k)).includes(c.key))
    || (c.op === '!=' && k.key === c.key && k.op === '!exist'))
}
const holds = (key: WorldKey, known: Criterion[]) => atoms([WORLD[key]]).filter((a) => a.op !== 'all').every((a) => implied(a, known))

/** Упоминание верно при любом положении персонажа: совет, отмазка, шутка, воспоминание. */
const ANY_STATE = new Set<string>([
  // Гарик советует из любого положения — из фундамента у него трубочка и интернет
  'Скажи, что бетон обиделся, — всегда работает 😂', 'Я своему уже третий год говорю «завтра».', 'Отправь ему 50 рублей, они это любят.',
  'Скажи, что «Нива» уехала. Проверено.', 'Можно я ему напишу, что я налоговая?',
  'Брат, не верь ему про меня. Верь про других.', 'Алик, опять ты про меня? Я даже не знаю, о чём речь.', 'Алик, ты меня упомянул уже раз пять. Я требую долю.', 'Всё, я выхожу из этой истории. Разбирайтесь без меня.',
  'Гарик, скажите честно: где деньги?', 'Честно? Честно я не знаю. Нечестно — тоже не знаю. Я вообще мало знаю, мне так спокойнее.',
  'Гарик, вы же тоже ждёте денег от Алика?', 'Я жду три года. Сначала злился, теперь просто жду. Как в очереди к врачу, только врач не придёт.',
  'Проверили. Дёрнули. Не открыт. Или открыт, но упрямый. Гарик говорит, это одно и то же.',
  // про Гарика — не про то, где он сейчас
  'Гарика я уже отругал.', 'Гарик', 'не то что Гарик', 'Гарик, что ему соврать?', 'Гарик ← Самвел ← Неизвестно',
  'Рубик теперь проверяет Гарика. Говорит, слишком честные глаза — подозрительно.',
  'С кем? Таких, кто так долго ждёт, больше нет. Ты у меня один. Ну, ещё Гарик. Но Гарик — это другое.',
  'В этот банк не перевожу, там работает бывшая жена Гарика.',
  // «Нива» — где бы она ни была
  'Интерпол ищет мою «Ниву», все счета проверяют', 'Всё. Про сейф, про «Ниву», про тебя. Они даже тебя проверить хотели. Я сказал: этот честный, он ждёт.',
  'Гоар по гуще нашла мою первую жену, вторую и «Ниву». «Ниву» дважды. Какие ещё вопросы?',
  '«Нива» — это отмазка или машина?', 'Я сам найду эту «Ниву» и сдам в металлолом!!!', 'Хватит «Нивы»!!! Где деньги?!',
])
/** Реплики этих персонажей сами должны учесть их положение: имени в тексте нет, а «я на свадьбе» из фундамента — несостыковка. */
const STATEFUL: Record<string, number> = { garik: 0 }

/** who — автор реплики ([кто, текст], { w, t }, { who, t }); stateOf — реплика персонажа с меняющимся положением (номер в STATE). */
interface Found { path: string; text: string; known: Criterion[]; who?: string; stateOf?: number }
/** Все строки значения с тем, что при них известно: требования gate и `when` реплик. */
function strings(v: unknown, path: string, known: Criterion[], out: Found[]): Found[] {
  if (typeof v === 'string') out.push({ path, text: v, known })
  else if (v instanceof Gated) strings(v.v, path, [...known, ...expand(atoms(v.when))], out)
  else if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && v[0] in CAST && typeof v[1] === 'string') out.push({ path, text: v[1], known, who: v[0] })
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, known, out))
  else if (v && typeof v === 'object' && !(v instanceof RegExp)) {
    const o = v as Record<string, unknown>
    const own = Array.isArray(o.when) ? [...known, ...expand(atoms(o.when as Criterion[]))] : known
    const who = typeof o.w === 'string' ? o.w : typeof o.who === 'string' ? o.who : undefined
    if (who && typeof o.t === 'string') { out.push({ path, text: o.t, known: own, who }); return out }
    for (const [k, x] of Object.entries(o)) if (!['when', 'orWhen', 'remember'].includes(k)) strings(x, `${path}.${k}`, own, out)
  }
  return out
}

const setFacts = (id: string, n: number): Criterion[] => setBy(id, n).map((key) => ({ key, op: '==', value: true }))
/** Серия k идёт, финала ещё нет (факт финала ставится после его реплик). */
const arcAt = (id: string, k: number): Criterion[] => [{ key: 'arc.' + id, op: '>=', value: k + 1 }, { key: 'finale.' + id, op: '!exist' }, ...setFacts(id, k + 1)]
const finale = (id: string): Criterion[] => [{ key: 'finale.' + id, op: 'exist' }, { key: 'arc.' + id, op: '>=', value: ARCS[id].eps.length }, ...setFacts(id, ARCS[id].eps.length)]
// легенду могут ставить разные серии — известно только общее для всех
const legendSets: Record<string, Criterion[][]> = {}
for (const [id, a] of Object.entries(ARCS)) a.eps.forEach((e, k) => { if (typeof e.legend === 'string') (legendSets[e.legend] ??= []).push(arcAt(id, k)) })
for (const [id, fs] of Object.entries(FINALES)) for (const f of fs) if (typeof f.legend === 'string') (legendSets[f.legend] ??= []).push(finale(id))
const legendAt = (id: string): Criterion[] => {
  const [first = [], ...rest] = legendSets[id] ?? []
  return first.filter((c) => rest.every((o) => implied(c, o)))
}
/** Условие «легенда такая-то» — значит, её уже поставила серия. */
function expand(cs: Criterion[]): Criterion[] {
  return cs.flatMap((c) => (c.key === 'legend' && c.op === '==' && typeof c.value === 'string' ? [c, ...legendAt(c.value)] : [c]))
}
const speaker = (who: string): Criterion[] => (SPEAKS[who] ? atoms([SPEAKS[who]]) : [])

const mods = import.meta.glob(['./*.ts', '!./*.test.ts'], { eager: true }) as Record<string, Record<string, unknown>>
function corpus(): Found[] {
  const out: Found[] = []
  const X = make(<T>(_k: string, a: readonly Entry<T>[]) => valueOf(a[0]), () => 0, seededRng(1))
  for (const [f, m] of Object.entries(mods)) {
    const file = f.slice(2, -3)
    for (const [name, v] of Object.entries(m)) {
      const at = `${file}.${name}`
      // подписи и экраны после события: ачивки, карточки персонажей, концовки
      if ([
        'achievements.ACH', 'arcs.CAST', 'finales.ENDINGS', 'finales.DEFAULT_FINALE', 'topics.TOPIC_NAME', 'world.WORLD', 'world.SPEAKS', 'world.MENTION_RE',
        // правят или сверяют уже сказанное: автозамена, противоречия Дня выплаты (звено звучит, только если было событие)
        'life.AUTO', 'payday.MORNING_CONTRA', 'payday.CONTRADICTIONS',
      ].includes(at)) continue
      // утверждение ловится в уже сказанной (размеченной) реплике — say лишь его пересказ
      if (at === 'lies.CLAIMS') { strings((v as Array<Record<string, unknown>>).map(({ updates }) => updates), at, [], out); continue }
      if (at === 'arcs.ARCS') for (const [id, a] of Object.entries(ARCS)) {
        a.eps.forEach((e, k) => strings(e, `${at}.${id}.eps[${k}]`, arcAt(id, k), out))
        strings(a.follow, `${at}.${id}.follow`, arcAt(id, 0), out)
      }
      else if (at === 'arcs.ARC_DONE') for (const [id, x] of Object.entries(v as object)) strings(x, `${at}.${id}`, finale(id), out)
      // реплики финала звучат до факта «финал был», остальное (ответы «Как там…?») — после
      else if (at === 'finales.FINALES') for (const [id, fs] of Object.entries(FINALES)) fs.forEach((f, i) => {
        const { m, sys, ...rest } = f
        strings({ m, sys }, `${at}.${id}[${i}]`, arcAt(id, ARCS[id].eps.length - 1), out)
        strings(rest, `${at}.${id}[${i}]`, finale(id), out)
      })
      else if (at === 'legends.LEGENDS') for (const [id, x] of Object.entries(LEGENDS)) strings(x, `${at}.${id}`, legendAt(id), out)
      // ответ темы звучит на свой вопрос — и с его требованиями
      else if (at === 'topics.TOPICS') for (const [id, t] of Object.entries(TOPICS)) {
        const p = strings(t.p, `${at}.${id}.p`, [], out)
        t.a.forEach((a, i) => strings(a, `${at}.${id}.a[${i}]`, p.find((x) => x.path.startsWith(`${at}.${id}.p[${i}]`))?.known ?? [], out))
        strings(t.r, `${at}.${id}.r`, [], out)
      }
      else if (['arcs.GROUP', 'world.CHORUS', 'world.CHORUS_FED_UP', 'talk.CHORUS_TALK', 'rude.RUDE_FAMILY', 'legends.CHORUS_LEGEND'].includes(at))
        for (const [who, x] of Object.entries(v as object)) {
          const said = strings(x, `${at}.${who}`, speaker(who), [])
          if (who in STATEFUL) for (const f of said) f.stateOf = STATEFUL[who]
          out.push(...said)
        }
      else if (at === 'quests.QUESTS') for (const [id, x] of Object.entries(v as object)) strings(x, `${at}.${id}`, expand(atoms(QUEST_WHEN[id] ?? [])), out)
      // суд: ступень 1 вводит юриста Арсена (правило Court_Lawyer — remember до реплик)
      else if (['quests.COURT', 'quests.COURT_LAWYER_AGAIN', 'quests.COURT_SCENE', 'quests.COURT_AFTER'].includes(at)) strings(v, at, atoms([WORLD.arsen]), out)
      // исход Дня выплаты звучит по своему правилу — его условия известны
      else if (at === 'payday.OUTCOME') for (const [id, x] of Object.entries(v as object)) strings(x, `${at}.${id}`, expand(atoms(paydayRules.find((r) => r.name === 'Payday_' + id)?.when ?? [])), out)
      // по своим правилам: посредники разблокировки, телефон у Карине (она забирает его, пока жена Алика)
      else if (at === 'rude.VIA_BORIS') strings(v, at, atoms([SPEAKS.boris]), out)
      else if (['rude.VIA_KARINE', 'rude.KARINE_HINT', 'rude.PHONE_KARINE'].includes(at)) strings(v, at, atoms([WORLD.karineHome]), out)
      else if (typeof v !== 'function') strings(v, at, [], out)
    }
  }
  for (const [id, sc] of Object.entries(makeScenes(X))) {
    if (id in QUESTS || id === 'court' || id === 'payday') continue // уже выше — из данных
    const rule = sceneRules.find((r) => r.name === 'Scene_' + id)
    // сцена, которая сама вводит персонажа (fx.set intro.*), ставит факт до своих реплик
    const sets = Object.values(sc.nodes).flatMap((n) => Object.keys(n.fx?.set ?? {})).map((key): Criterion => ({ key, op: '==', value: true }))
    strings(sc, `scenes.${id}`, [...atoms(rule?.when ?? []), ...sets], out)
  }
  return out
}

function problems(found: Found[]): string[] {
  const out: string[] = []
  for (const { path, text, known, who, stateOf } of found) {
    for (const [key, re] of MENTION) if (re.test(text) && !holds(key, known)) out.push(`${path}: «${text.slice(0, 70)}» — нужно needs('${key}')`)
    if (who && SPEAKS[who] && !atoms([SPEAKS[who]]).filter((a) => a.op !== 'all').every((a) => implied(a, known))) out.push(`${path}: пишет ${who} — «${text.slice(0, 50)}» — нужно, чтобы он мог писать`)
    if (ANY_STATE.has(text)) continue
    const keys = new Set(known.map((c) => c.key))
    STATE.forEach(([what, re, ok], i) => {
      if ((re.test(text) || stateOf === i) && !ok.some((k) => keys.has(k))) out.push(`${path}: «${text.slice(0, 70)}» — не учтено: ${what}`)
    })
  }
  return out
}

describe('упоминания в контенте', () => {
  it('всё, что появляется по ходу истории, упомянуто только под требованием', () => {
    const found = corpus()
    expect(found.length).toBeGreaterThan(3000)
    expect(problems(found)).toEqual([])
  })
  it('проверка ловит упоминание без требования и принимает требование, серию и финал', () => {
    const bare = strings(['Кран уехал.', 'Гарик на рынке.', ['boris', 'Бее.'], { w: 'karine', t: 'Алик!' }], 'x', [], [])
    expect(problems(bare)).toHaveLength(4)
    expect(problems(strings([new Gated([SPEAKS.boris], ['boris', 'Бее.'])], 'x', [], []))).toEqual([])
    expect(problems(strings([new Gated([WORLD.crane], 'Кран уехал.')], 'x', [], []))).toEqual([])
    expect(problems(strings({ t: 'Гарик на рынке.', when: [WORLD.garikFree] }, 'x', [], []))).toEqual([])
    expect(problems(strings('Размик слез с крана.', 'x', finale('razmik'), []))).toEqual([])
    expect(problems(strings('Близнец.', 'x', arcAt('grant', 3), []))).toHaveLength(1)
    expect(problems(strings('Близнец.', 'x', arcAt('grant', 4), []))).toEqual([])
  })
})

/** Текст сообщения, который видит игрок (пересланное — с отправителем). */
const shown = (m: Msg): string => (m.kind === 'fwd' ? `${m.f}: ${m.text}` : 'text' in m ? m.text : '')

describe('упоминания в партиях ботом', () => {
  it('ни сообщение, ни вариант игрока не упоминают того, чего в мире ещё нет; пишут только те, кто может', async () => {
    const bad: string[] = []
    let checked = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const check = (game: Game, text: string, where: string) => {
        checked++
        for (const [key, re] of MENTION) if (re.test(text) && !game.holds(WORLD[key])) bad.push(`seed ${seed}, ${where}: «${text.slice(0, 80)}» — нет ${key}`)
      }
      await playtest(seed, 300, undefined, (game) => {
        const push = game.push.bind(game)
        game.push = (m) => {
          check(game, shown(m as Msg), m.kind)
          if (m.kind === 'text' && m.who && !game.canSpeak(m.who)) bad.push(`seed ${seed}: пишет ${m.who} — «${m.text.slice(0, 60)}»`)
          const out = push(m)
          if (!game.busy) for (const c of game.S.choices ?? []) check(game, c.text, 'вариант')
          return out
        }
      })
    }
    expect(checked).toBeGreaterThan(5000)
    expect(bad).toEqual([])
  }, 120_000)
})
