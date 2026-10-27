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

type Profile = { name: string; tone: 'rude' | 'polite' | 'neutral'; texts: string[]; note: string }

const PROFILES: Profile[] = [
  {
    name: 'rude', tone: 'rude', note: 'хроническая грубость без извинений: блок-цикл, лестница S0–S5',
    texts: [
      'АЛИК!!! ВЕРНИ ДЕНЬГИ!!!', 'Ты мошенник!!!', 'Где мои 240 000?!', 'Хватит врать!!!',
      'Я устал от твоих отмазок!!', 'Ты не подрядчик, ты вор!!!', 'АЛИК ВОЗДУХОНЕСЯН!!! ГДЕ ДЕНЬГИ?!',
      'Мне плевать на твою родню!!! ПЛАТИ!', 'Сколько можно ждать?!', 'Ты меня за дурака держишь?!',
      'Я всё расскажу всем!!!', 'ХВАТИТ!!!', 'Плита кривая, деньги где?!', 'Ты кричал, что заплатишь — я записал!!!',
      'Никаких больше «завтра»!!!', 'Верни хотя бы тысячу!!!',
    ],
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
  const probe = text.slice(0, 24).replace(/[«»]/g, '')
  if (probe.trim().length < 12) return 'источник не найден (строка короткая/шаблонная)'
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
      if (/^\s*'/.test(lines[line - 1] ?? '')) return `POOL ${f}:${line}`
      return `ДРУГОЕ ${f}:${line}`
    }
  }
  return 'источник не найден (шаблон/склейка)'
}

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
      for (let i = 0; i < turns; i++) await game.send({ text: p.texts[i % p.texts.length], tone: p.tone })
      const msgs = game.S.msgs
        .filter((m) => (m.kind === 'text' && m.from !== 'me') || m.kind === 'sys')
        .map((m) => (m.kind === 'sys' ? `SYS: ${m.text}` : String((m as { text: string }).text)))
      const counts = new Map<string, number>()
      for (const t of msgs) counts.set(t, (counts.get(t) ?? 0) + 1)
      const top = [...counts.entries()].filter(([t, n]) => n >= 3 && t.length > 8).sort((a, b) => b[1] - a[1]).slice(0, 10)
      const report = [
        `# pool-scan: профиль ${p.name} (сид ${seed}, ${turns} ходов)`,
        `Профиль: ${p.note}. Реплик+системных: ${msgs.length}, уникальных: ${counts.size}.`,
        '',
        ...top.map(([t, n]) => `- ${n}× ${trace(t)}\n    «${t.slice(0, 100)}»`),
      ].join('\n')
      const out = `/tmp/opencode/pool-scan-${p.name}.md`
      writeFileSync(out, report)
      console.log(`\n=== ${p.name} → ${out} ===\n` + report)
      expect(msgs.length).toBeGreaterThan(0)
    }
  }, 600_000)
})
