// Логический разбор партии: журнал фактов игрока и сверка с ним КАЖДОЙ реплики и КАЖДОГО
// варианта ответа — включая невыбранные (acts[].offered хранит весь блок). Кодирует метод
// слепого рецензента (REVIEW_PROMPT.md, «факт-журнал», 2026-10-16 по находке оператора):
// то, что оператор смотрит в своих плейтестах руками, здесь гоняет машина на каждом PR.
// Категории 10/11/13/14 остаются за живым рецензентом: «вопрос об известном», «момент без
// отклика» и «эмоциональный мисмэтч» не выводятся из фактов однозначно, а cat 14 («кредитор
// наоборот») — решение оператора по #1102: чек-лист задач, не линтер.
import { D } from '../content/excuses'
import { P_VIA_BORIS, P_VIA_KARINE, P_VIA_MAMA, P_MOO } from '../content/rules/player-choice-pools'
import type { Msg } from '../engine/state'
import type { Act, Aside, Played } from './playtest'

/** Категории рецензента, которые здесь механически доказуемы. */
export type LogicCheck = 'dup-block' | 'repeat-window' | 'phantom-person' | 'phantom-sum' | 'stranger-speaker' | 'again-phantom'
export interface LogicFinding {
  id: LogicCheck
  /** Категория несостыковки из REVIEW_PROMPT.md (1/3/6/12). */
  cat: 1 | 3 | 6 | 12
  /** Номер хода партии (индекс в acts). */
  turn: number
  at: number
  text: string
  why: string
}

/** Одно видимое игроку событие переписки: реплика/система/карточка/асайд, либо его собственное сообщение. */
export interface Ev { at: number; side: 'game' | 'me'; text: string; who?: string; sys?: boolean }
/** Блок вариантов одного хода: тексты и (если сняты с партии нового харнесса) метки сцен. */
export interface OfferRec { turn: number; at: number; texts: string[]; scene?: (string | null)[] }

/** Говорить без представления может только Алик: обращение игрока всегда к нему. */
const ALWAYS_KNOWN = new Set(['alik'])
/** Кого вариант вправе назвать с первого хода, не дожидаясь, пока игра его представит. Мама — премисса,
 *  а не знакомство: «мама спрашивает, почему я до сих пор ем у неё» — своя мама игрока, «твоя мама» —
 *  родовое родство, как «тётя» у goar. Кто говорит сам — отдельный вопрос (CLAUDE.md, SPEAKS). */
const ALWAYS_REFERENCED = new Set(['alik', 'mama'])
/** Долг с завязки — 240 000 (README, #1370). */
const ALWAYS_SUMS = new Set(['240000'])

/** Окно дословного повтора варианта — конвенция пулов (#824/#1432): движок давит < 20 ходов игрока. */
const REPEAT_WINDOW = 20

// --- детекторы персонажей: по чему текст игры/варианта ссылается на персонажа.
// Ролевые слова («дядя», «тётя», «прораб») — НЕ детекторы: «Я сам женюсь на твоей тёте» —
// гипербола из кричалок (REVIEW_PROMPT, «не нарушение»), а не Тётя Гоар. Сущностные референты
// игры (мама, домофон, баран, заказчик-Грант в обвинении из MENTION_RE) единственные своего
// рода — им регистр и контекст безразличны. Один детектор и для журнала, и для варианта.
const CAST_RE: Record<string, RegExp> = {
  alik: /алик/i,
  boris: /борис|баран/i,
  grant: /грант|(?:заказчик)[^.!?]*(?:не плат|ждёт|должен|виноват|долг)|(?:не плат|ждёт|должен|виноват|долг)[^.!?]*заказчик/i,
  nune: /нуне/i,
  samvel: /самвел/i,
  // «заложены» — не Карине: хвост «жен…» ловится только целым словом, а «жена/жене/жену/жены» — ссылка
  karine: /карин|(?<![а-яё])жен[аыеу](?![а-яё])/i,
  garik: /гарик/i,
  arsen: /арсен/i,
  mkrtich: /мкртич/i,
  niva: /нива/i,
  mama: /мам/i,
  intercom: /домофон/i,
  judge: /ашот|судья/i,
  goar: /гоар/i,
  razmik: /размик/i,
  rubik: /рубик/i,
  collectors: /коллектор|деньги-ара/i,
  taron: /тарон/i,
}
const EXTRA_ALIAS: Record<string, RegExp> = { baran: /баран/i, grachik: /грачик/, gagik: /гагик/, tamada: /тамад/i }
export const PERSON_RE: Record<string, RegExp> = { ...CAST_RE, ...EXTRA_ALIAS }

/** Шаблон лейбла перевода: «{amount}» → цифры, остальное дословно. Части экранируются до подстановки:
 *  иначе `\d+` попадает под экранирование и шаблон ищет литерал (whitelist P_TRANSFER, #1593/r196+). */
const transferLabel = (t: string): string =>
  t.split('{amount}').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\d+')
const TRANSFER_LABEL_RE = new RegExp('^(?:' + D.P_TRANSFER.map(transferLabel).join('|') + ')$')

/** Легальные классы повтора коротких ярлыков: кнопки сцен («Нет», «Беру!», «Пойду», «Какой курс?») — класс r174+. */
const shortLabel = (t: string): boolean => t.length <= 12 || t.trim().split(/\s+/).length <= 2

/** Сцена, где игрок выбирает реплику Алика, а не свою: её варианты — его мир (#1604, seed-17:169). */
const GAME_VOICE_SCENE = 'choice'

const VIA_TEXTS = new Set<string>([...P_VIA_BORIS, ...P_VIA_KARINE, ...P_VIA_MAMA, ...P_MOO])

/** Числа, которые игрок мог узнать: из видимого текста игры, без дат и сроков. */
const YEAR_RE = /^(19|20)\d{2}$/
const TIME_AFTER = /\d[\d\s]*(₽|руб|\$)?[\sА-ЯЁа-яё]{0,12}(дн|ден|лет|год|недел|час|месяц|раз)/
/** Числительные словами: «пятьдесят четыре тысячи» — та же сумма, что 54 000 в варианте (#1604). */
const WORD_NUM: Record<string, number> = {
  два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9,
  десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14,
  пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
  сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
  полтора: 1.5, полторы: 1.5,
}
const WORD_SCALE: Record<string, number> = {
  тысяча: 1e3, тысячи: 1e3, тысяч: 1e3,
  миллион: 1e6, миллиона: 1e6, миллионов: 1e6,
}
/** Суммы словами от тысячи: всё, что ниже, — счёт предметов и сроки, а не деньги. */
function wordSums(text: string): Set<string> {
  const out = new Set<string>()
  let total = 0
  let group = 0
  let seen = false
  const flush = (): void => {
    if (seen && total + group >= 1000) out.add(String(total + group))
    total = 0
    group = 0
    seen = false
  }
  for (const w of text.toLowerCase().split(/[^а-яё]+/)) {
    if (WORD_NUM[w] !== undefined) { group += WORD_NUM[w]; seen = true; continue }
    if (WORD_SCALE[w] !== undefined) { total += (group || 1) * WORD_SCALE[w]; group = 0; seen = true; continue }
    flush()
  }
  flush()
  return out
}
/** Суммы, которые текст называет долгом: долг партии показан игроку в шапке в любой момент, поэтому
 *  вариант «он мне должен 237 500» ссылается на видимый счётчик, а не на сообщение (суд-сцена, #1604). */
const DEBT_CLAIM = /(?:должен|должна|должны|долг[ауеи]?)[^\d]{0,16}(\d[\d\s]*)/gi
function debtSums(text: string): Set<string> {
  return new Set([...text.matchAll(DEBT_CLAIM)].map((m) => m[1].replace(/\s/g, '')))
}
export function sumsIn(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.match(/\d[\d\s]*/g) ?? []) {
    const n = raw.replace(/\s/g, '')
    if (n.length < 4 || YEAR_RE.test(n)) continue
    if (n.length === 4 && !/(₽|руб|тысяч)/i.test(text.slice(text.indexOf(raw), text.indexOf(raw) + raw.length + 20))) continue
    if (TIME_AFTER.test(text.slice(Math.max(0, text.indexOf(raw) - 0), text.indexOf(raw) + raw.length + 14))) continue
    out.add(n)
  }
  return out
}

/** Журнал игрока: число, названное словами, — тот же факт, что цифрами («Пятьдесят четыре тысячи» → 54000).
 *  Варианты сверяются с журналом по цифрам: слова в варианте часто сокращают названную игру сумму
 *  («с мясом — три» → «три тысячи»), и разбор слов дал бы на них фантом (#1604). */
function journalSums(text: string): Set<string> {
  const out = sumsIn(text)
  for (const n of wordSums(text)) out.add(n)
  return out
}

/** Текст сообщения, как его читает игрок (карточки и документы несут суммы — они тоже журнал). */
function msgText(m: Msg): { side: 'game' | 'me'; text: string; who?: string; sys?: boolean } | null {
  switch (m.kind) {
    case 'sep': return null
    case 'text': return m.from === 'me' ? { side: 'me', text: m.text } : { side: 'game', text: m.text, who: m.who ?? 'alik' }
    case 'sys': return { side: 'game', text: m.text, sys: true }
    case 'card': return { side: 'game', text: [m.text, ...(m.lines ?? []), m.offer ? [m.offer.take, m.offer.sell].filter(Boolean).join(' ') : '', m.result ?? ''].join(' ') }
    case 'doc': return { side: 'game', text: `${m.rows.map(([r, n]) => `${r} ${n}`).join('; ')} ${m.total}` }
    case 'transfer': return { side: 'game', text: `${m.amount ?? 50} ${m.text}` }
    case 'fwd': return { side: 'game', text: `${m.f} ${m.text}` }
    // фото «платёжки»: игрок видит снимок — на нём баран (визуал захардкожен в ui/review.ts, #1017);
    // пул реакции P_PHOTO гейтится на needs('baran') — журнал обязан видеть то же, что игрок
    case 'photo': return { side: 'game', text: `${m.text} (на снимке — баран на фоне Арарата)` }
    case 'job': case 'lend50': case 'muen': return { side: 'game', text: m.text }
    default: return { side: 'game', text: '' }
  }
}

/** Видимый игроку поток: сообщения и асайды по порядку; асайд на позиции i виден раньше сообщения i. */
export function playerStream(p: { game: { S: { msgs: Msg[] } }; asides: Aside[] }): Ev[] {
  const out: Ev[] = []
  const asides = new Map<number, string[]>()
  for (const a of p.asides) asides.set(a.at, [...(asides.get(a.at) ?? []), a.text])
  p.game.S.msgs.forEach((m, i) => {
    for (const a of asides.get(i) ?? []) out.push({ at: i, side: 'game', text: a })
    const e = msgText(m)
    if (e) out.push({ at: i, ...e })
  })
  for (const a of asides.get(p.game.S.msgs.length) ?? []) out.push({ at: p.game.S.msgs.length, side: 'game', text: a })
  return out
}

/** Блоки вариантов партии: у send-ходов, сцену снимаем с acts (новый харнесс), свободный крик — тоже блок. */
export function offersOf(p: { acts: Act[] }): OfferRec[] {
  return p.acts.flatMap((a, turn) => (a.kind === 'send' ? [{ turn, at: a.at, texts: a.offered, scene: a.scene }] : []))
}

/** Экран концовки: после него эпилог крутит одни и те же кнопки по кругу — задумано (REVIEW_PROMPT). */
export const endingAt = (p: { asides: Aside[] }): number | undefined => p.asides.find((a) => a.text.startsWith('(экран концовки:'))?.at

/** Разбор: журнал фактов игрока + каждый вариант каждого блока + каждая реплика. Порядок событий по `at`. */
export function logicReview(stream: Ev[], offers: OfferRec[], endAt?: number): LogicFinding[] {
  const findings: LogicFinding[] = []
  const known = new Set(ALWAYS_KNOWN)
  const sums = new Set(ALWAYS_SUMS)
  const lastShown = new Map<string, number>()
  // открыта ли сцена: системная строка (группа, событие) после последней реплики игрока —
  // первая реплика родни внутри открытой сцены легальна (семейный суд пишет intro самим фактом реплики)
  let sceneOpened = false
  let evIdx = 0

  const flushEventsTo = (at: number, inclusiveGame: boolean): void => {
    while (evIdx < stream.length && stream[evIdx].at <= at) {
      const e = stream[evIdx]
      const isOfferSlot = e.side === 'me' && e.at === at
      if (isOfferSlot && !inclusiveGame) break
      evIdx++
      if (e.side === 'me') { sceneOpened = false; continue }
      if (e.text === '') continue
      if (e.sys) sceneOpened = true
      // пишет тот, кого игрок не знает, — категория 3. Легальны: знакомство до реплики (SPEAKS,
      // CLAUDE.md), самопредставление («Это домофон», дебют «Мы из МФО…») и открытая сцена
      // (sys-строка группы/события). Без всего этого — реплика в ниоткуда, класс SPEAKS-аудита
      if (e.who && e.who !== 'alik' && !known.has(e.who) && !PERSON_RE[e.who]?.test(e.text) && !sceneOpened) {
        findings.push({ id: 'stranger-speaker', cat: 3, turn: -1, at: e.at, text: e.text, why: `${e.who} пишет из ниоткуда: игрок о нём ничего не слышал, реплика себя не называет, сцены нет` })
      }
      // «опять/снова» о том, кого игрок не знает, — категории 12/1
      if (/(опять|снова)/i.test(e.text)) {
        for (const [id, re] of Object.entries(PERSON_RE)) {
          if (id === 'alik' || known.has(id) || ALWAYS_REFERENCED.has(id) || !re.test(e.text)) continue
          const sentence = e.text.split(/[.!?]/).find((s) => re.test(s) && /(опять|снова)/i.test(s))
          if (sentence) findings.push({ id: 'again-phantom', cat: 12, at: e.at, turn: -1, text: e.text, why: `«опять/снова» про ${id}, которого игрок ещё не знает` })
        }
      }
      if (e.who) known.add(e.who)
      for (const [id, re] of Object.entries(PERSON_RE)) if (id !== 'alik' && re.test(e.text)) known.add(id)
      for (const n of journalSums(e.text)) sums.add(n)
    }
  }

  let move = 0
  for (const o of offers) {
    flushEventsTo(o.at, false)
    move++
    const inBlock = new Set<string>()
    o.texts.forEach((t, i) => {
      const dupInBlock = inBlock.has(t)
      if (dupInBlock) findings.push({ id: 'dup-block', cat: 6, turn: o.turn, at: o.at, text: t, why: 'два одинаковых варианта в одном блоке' })
      inBlock.add(t)
      const prev = lastShown.get(t)
      const sceneBtn = o.scene?.[i] != null || shortLabel(t) || VIA_TEXTS.has(t) || TRANSFER_LABEL_RE.test(t)
      if (prev !== undefined && move - prev < REPEAT_WINDOW && !dupInBlock && !sceneBtn && (endAt === undefined || o.at < endAt)) {
        findings.push({ id: 'repeat-window', cat: 6, turn: o.turn, at: o.at, text: t, why: `дословный повтор через ${move - prev} ходов игрока (< ${REPEAT_WINDOW}, конвенция #824)` })
      }
      if (prev === undefined || move - prev >= REPEAT_WINDOW) lastShown.set(t, move)
      // сцена choice: игрок выбирает, какую отмазку скажет сам Алик («выбирай сам, какая сегодня причина»),
      // поэтому вариант выражает мир Алика, а не знание игрока — фантомы имён и сумм здесь не про игрока
      if (o.scene?.[i] === GAME_VOICE_SCENE) return
      for (const [id, re] of Object.entries(PERSON_RE)) {
        if (id === 'alik' || known.has(id) || ALWAYS_REFERENCED.has(id) || !re.test(t)) continue
        findings.push({ id: 'phantom-person', cat: 6, turn: o.turn, at: o.at, text: t, why: `вариант ссылается на ${id}, о котором игрок ещё ничего не слышал` })
      }
      const debts = debtSums(t)
      for (const n of sumsIn(t)) if (!sums.has(n) && !debts.has(n)) findings.push({ id: 'phantom-sum', cat: 6, turn: o.turn, at: o.at, text: t, why: `вариант называет сумму ${n}, которая игроку не называлась` })
    })
    flushEventsTo(o.at, true)
  }
  flushEventsTo(Infinity, true)
  return findings
}

/** Разбор сыгранной партии: то, что смотрит оператор в живых плейтестах, — машиной. */
export function logicFindings(p: Played): LogicFinding[] {
  return logicReview(playerStream(p), offersOf(p), endingAt(p))
}
