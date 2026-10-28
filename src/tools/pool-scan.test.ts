// Сканер класса «исчерпание пула»: специализированная партия давит на одну
// стратегию (грубость, деньги, вежливость…), сканер считает повторы реплик Алика
// и системных строк и трассирует каждую повторённую строку до источника в src/.
// Классификация источника: HARDCODED (одна константа на рекуррентный момент —
// главный источник класса), POOL/др. (файл:строка), не найден (шаблон/склейка).
//
// Прогон: POOL_SCAN=1 POOL_PROFILES=rude,money POOL_SEED=2027 POOL_TURNS=160 \
//         npx vitest run src/tools/pool-scan.test.ts
// Без POOL_SCAN тест пропускается: обычный CI его не касается.
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { RUDE_SHOUTS } from './shouts'
import { NOTIF } from '../content/life'
import { DEBUT_SLOT, EVENT_SOURCES, FIRST_WINDOWS } from '../content/first-windows'
import { unclassifiedCards } from '../content/reply-windows'

type Profile = { name: string; tone: 'rude' | 'polite' | 'neutral'; texts: string[]; note: string }

const PROFILES: Profile[] = [
  {
    name: 'rude', tone: 'rude', note: 'хроническая грубость без извинений: блок-цикл, лестница S0–S5',
    texts: RUDE_SHOUTS,
  },
  {
    name: 'money', tone: 'neutral', note: 'денежное давление каждый ход: терпение, капитулизации, переводы',
    texts: [
      'Алик, где деньги?', 'По оплате что?', 'Когда рассчитаетесь?', 'Долг 240 000, когда?',
      'Алик, я жду перевод', 'Когда будут деньги?', 'Напомню про оплату', 'Плитка сдана, деньги где?',
      'Алик, оплатите работу', 'Мне нужны деньги, Алик', 'Ещё раз про деньги', 'И всё-таки — где деньги?',
    ],
  },
  {
    name: 'polite', tone: 'polite', note: 'вежливое давление: streak вежливости, POL_POLITE',
    texts: [
      'Алик, пожалуйста, верните деньги', 'Буду очень благодарен за оплату', 'Алик, когда удобно рассчитаться?',
      'Спасибо заранее, Алик', 'Не тороплю, но напомню про оплату', 'Алик, здравствуйте! По оплате что?',
      'Алик, желаю здоровья. Деньги когда?', 'Извините за настойчивость', 'Добрый вечер! Как оплата?',
      'Алик, мне бы до зарплаты. До вашей.', 'Понимаю всё, но деньги нужны', 'Алик-джан, по деньгам как?',
    ],
  },
  {
    name: 'cow', tone: 'neutral', note: 'давление темой мычания/коровы: окна отклика, mu-en, COW-пулы',
    texts: [
      'Алик, это у вас корова мычит?', 'Что за «Мууу» на фоне?', 'Кто у вас там мычит?',
      'Алик, у вас там корова?', 'Это корова или кто-то очень устал?', 'У вас ферма? «Мууу» слышал весь чат.',
      'Алик, это «Мууу» — это мне?', 'Опять мычание. Что это?', 'Алик, в ферме корова?',
      'Корову слышно даже тут', 'Мууу?', 'Алик, корова передаёт привет?',
    ],
  },
  {
    name: 'threat', tone: 'rude', note: 'угрозы судом и расправой: линия суда (6 ступеней), вендетта, коллекторы',
    texts: [
      'Я иду в суд!', 'Мой юрист уже пишет иск!', 'Подам в суд, Алик!', 'Встретимся в суде!',
      'Я знаю, где ты живёшь!', 'Приеду с перфоратором!!!', 'Выложу переписку в интернет!!!',
      'Ты не выйдешь из судов!', 'Иск готов, Алик', 'Позвоню твоей маме!!!', 'Сниму плитку обратно!!!',
      'Страсбург узнает про тебя!',
    ],
  },
]

const listTs = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .map((f) => join(dir, f))

const CONTENT: Array<[string, string]> = ['src/content', 'src/engine'].flatMap((d) =>
  listTs(d).map((f) => [f, readFileSync(f, 'utf-8')] as [string, string]),
)

/** Трассировка повторённой строки до источника: константа (HARDCODED) или место в пуле. */
const trace = (text: string): string => {
  // sys-строки приходят с префиксом отчёта — источник ищем по тексту без него
  const clean = text.replace(/^SYS: /, '').replace(/[«»]/g, '')
  // проба от полной строки к короткому префиксу: у разных пулов бывают одинаковые начала
  // строк («Ваш крик зарегистрирован…» есть и в POLITE_RUDE, и в COLD_WAR_REPLY), и
  // короткая проба атрибутирует показ чужому пулу (прогон 4029). Короткие пробы —
  // запас на случай многострочных литералов, где полной строки в файле нет.
  const probes = [...new Set([clean, clean.slice(0, 40), clean.slice(0, 24)])]
  for (const probe of probes) {
    if (probe.trim().length < 12) continue
    for (const [f, body] of CONTENT) {
      const idx = body.indexOf(probe)
      if (idx >= 0) {
        const lines = body.split('\n')
        const line = body.slice(0, idx).split('\n').length
        // строка может начинаться внутри многострочного литерала: ищем начало константы вверх
        for (let k = 0; k < 4; k++) {
          const cand = (lines[line - 1 - k] ?? '').trim()
          if (/export const [A-Z_0-9]+ = ['"`]/.test(cand)) return `HARDCODED ${f}:${line - k} — ${cand.slice(0, 56)}`
        }
        const cur = lines[line - 1] ?? ''
        // строка пула: литерал или needs-обёртка (пул с гейтами) — оба случая пул, не HARDCODED
        if (/^\s*('|needs\()/.test(cur)) return `POOL ${f}:${line}`
        return `ДРУГОЕ ${f}:${line}`
      }
    }
  }
  return 'источник не найден (шаблон/склейка)'
}

/** Штампы, у которых есть окно отклика: источники-события, дебюты и окна первого сообщения (#1487). */
const WINDOW_STAMPS: ReadonlySet<string> = new Set([
  ...EVENT_SOURCES.map((e) => e.at),
  ...FIRST_WINDOWS.flatMap((w) => (w.at && w.at !== DEBUT_SLOT ? [w.at] : [])),
])

/** Карточка ленты по тексту из партии: шаблоны с подстановкой ({spend}, {money}) сравниваем по префиксу. */
const notifOf = (text: string): (typeof NOTIF)[number] | undefined =>
  NOTIF.find((n) => n.t === text)
  ?? NOTIF.find((n) => n.t.includes('{') && text.startsWith(n.t.slice(0, n.t.indexOf('{'))))

/** Окна событий, которые сканер видел в партии: карточка → её оффер; null — окна нет. */
const windowOffer = (card: (typeof NOTIF)[number] | undefined): string | null => {
  if (!card?.stamp) return null
  return EVENT_SOURCES.find((e) => e.at === card.stamp)?.offer ?? null
}

/** Правило оффера живо в блоке: eligibility без сборки вариантов — сборка тратит строки окна (#826). */
const offerLive = (game: Game, offer: string): boolean =>
  game.rules.collect({ event: 'BuildChoices' }, game.facts()).some((r) => r.name === `Opt_${offer}`)

// Свип «показал — ответить нельзя» (#1487): класс рождался находкой за находкой (#1192/#1292/#1382/#1410).
// Статический реестр (reply-windows.ts) отвечает за полноту классификации, здесь — вторая половина
// сигнатуры: в живой партии нет карточек без окна и у каждого окна отклик реально доходит до блока.
describe('сигнатура класса «показал — ответить нельзя» (#1487)', () => {
  it('каждая карточка ленты: окно или запись в реестре; новая карточка без классификации — находка', () => {
    expect(unclassifiedCards(NOTIF, WINDOW_STAMPS), 'карточки без окна и без классификации').toEqual([])
    expect(unclassifiedCards(NOTIF, WINDOW_STAMPS).length, 'проверка пустеет на пустом реестре').toBe(0)
    // отрицательный контроль: синтетическая карточка без штампа и без записи обязана попасть в находки
    const mutant = [...NOTIF, { ...NOTIF[0], t: 'Синтетическая карточка без окна и без записи в реестре', stamp: undefined }]
    expect(unclassifiedCards(mutant, WINDOW_STAMPS), 'мутант не пойман — сигнатура слепа').toHaveLength(1)
    expect(unclassifiedCards([{ t: 'Синтетическая карточка со штампом без окна', stamp: 'synthetic.at' }], WINDOW_STAMPS), 'штамп без окна не пойман').toHaveLength(1)
  })
})

describe('сканер исчерпания пула (POOL_SCAN)', () => {
  it.skipIf(!process.env.POOL_SCAN)('профили: ' + (process.env.POOL_PROFILES ?? 'rude'), async () => {
    const names = (process.env.POOL_PROFILES ?? 'rude').split(',')
    const seed = Number(process.env.POOL_SEED ?? 2027)
    const turns = Number(process.env.POOL_TURNS ?? 160)
    expect(names.length, 'профиль не задан').toBeGreaterThan(0)
    for (const name of names) {
      const p = PROFILES.find((x) => x.name === name)
      if (!p) throw new Error('неизвестный профиль: ' + name + ' (доступны: ' + PROFILES.map((x) => x.name).join(', ') + ')')
      const { game } = makeGame({ seed })
      // события с номером хода: окно повторов (порог скилла — половина пула в окне 20) требует знать ход показа
      const events: Array<{ text: string; turn: number }> = []
      const collect = (turn: number) => {
        for (const m of game.S.msgs) {
          if (m.kind === 'sys') events.push({ text: `SYS: ${m.text}`, turn })
          else if (m.kind === 'text' && m.from !== 'me') events.push({ text: String((m as { text: string }).text), turn })
        }
      }
      collect(0)
      // сигнатура «показал — ответить нельзя» (#1487): карточка ленты в живой партии и её окно
      const cardsSeen: Array<{ turn: number; text: string; event?: string; offer: string | null; live: boolean }> = []
      for (let i = 0; i < turns; i++) {
        const seen = game.S.msgs.length
        await game.send({ text: p.texts[i % p.texts.length], tone: p.tone })
        for (const m of game.S.msgs.slice(seen)) {
          if (m.kind === 'sys') events.push({ text: `SYS: ${m.text}`, turn: i + 1 })
          else if (m.kind === 'text' && m.from !== 'me') events.push({ text: String((m as { text: string }).text), turn: i + 1 })
          else if (m.kind === 'card') cardsSeen.push({ turn: i + 1, text: m.text, event: m.event, offer: windowOffer(notifOf(m.text)), live: false })
        }
        // окно живёт ход карточки и три после: отклик обязан попасть в блок хотя бы раз
        for (const c of cardsSeen) if (c.offer && !c.live && i + 1 >= c.turn && i + 1 <= c.turn + 3) c.live = offerLive(game, c.offer)
      }
      const unclassified = cardsSeen.flatMap((c) => {
        // карточка движка (банк, МФО, мама...) классифицирована реестром событий телефона;
        // `life` — карточка ленты, её сверяем по тексту с NOTIF и SILENT_CARDS
        if (c.event && c.event !== 'life') return []
        const entry: { t: string; stamp?: string } = notifOf(c.text) ?? { t: c.text }
        return unclassifiedCards([entry], WINDOW_STAMPS).map((x) => `ход ${c.turn}: ${x}`)
      })
      const deadWindows = cardsSeen.filter((c) => c.offer && !c.live).map((c) => `ход ${c.turn}: ${c.offer} не дошёл до блока`)
      expect(unclassified, 'карточки без окна и без классификации в партии').toEqual([])
      expect(deadWindows, 'окно карточки не дало отклика в блоке').toEqual([])
      const msgs = events.map((e) => e.text)
      const counts = new Map<string, number>()
      for (const t of msgs) counts.set(t, (counts.get(t) ?? 0) + 1)
      /** Макс. показов одной строки в любом скользящем окне 20 ходов. */
      const maxInWindow = (t: string): number => {
        const ts = events.filter((e) => e.text === t).map((e) => e.turn)
        let m = 0
        for (let i = 0; i < ts.length; i++) {
          let c = 0
          for (let j = i; j < ts.length && ts[j] - ts[i] <= 20; j++) c++
          m = Math.max(m, c)
        }
        return m
      }
      // сначала кандидаты окна (макс в окне 20 desc), потом счётчику: порог скилла — окно, не сумма за партию
      const top = [...counts.entries()].filter(([t, n]) => n >= 3 && t.length > 8).sort((a, b) => maxInWindow(b[0]) - maxInWindow(a[0]) || b[1] - a[1]).slice(0, 10)
      const report = [
        `# pool-scan: профиль ${p.name} (сид ${seed}, ${turns} ходов)`,
        `Профиль: ${p.note}. Реплик+системных: ${msgs.length}, уникальных: ${counts.size}.`,
        '',
        ...top.map(([t, n]) => `- ${n}× (макс ${maxInWindow(t)} в окне 20) ${trace(t)}\n    «${t.slice(0, 100)}»`),
        '',
        `# свип окон отклика (#1487): карточек в партии ${cardsSeen.length}, без окна/классификации ${unclassified.length}, окна без отклика ${deadWindows.length}`,
      ].join('\n')
      const out = `/tmp/opencode/pool-scan-${p.name}.md`
      writeFileSync(out, report)
      // полный транскрипт партии: кандидат из top-10 обязан проверяться по нему (скилл,
      // урок прогона FLOOR), и исчезновение известной сигнатуры тоже подтверждается
      // по всем показам, а не по отсутствию в top-10 (прогон 4029, #1422)
      writeFileSync(
        `/tmp/opencode/pool-scan-${p.name}-transcript.txt`,
        events.map((e) => `${e.turn}\t${e.text.replace(/\n/g, ' ')}`).join('\n') + '\n',
      )
      console.log(`\n=== ${p.name} → ${out} ===\n` + report)
      expect(msgs.length).toBeGreaterThan(0)
    }
  }, 600_000)
})
