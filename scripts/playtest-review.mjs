// Разбор расшифровки плейтеста для ревьюера (#737): кандидаты в несостыковки одним отчётом.
// Ничего не судит и не заменяет оракула: точные повторы и строки-утверждения — материал для глаз.
// Запуск: node scripts/playtest-review.mjs <каталог с seed-*.txt | файл расшифровки>
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Маркеры-кандидаты «утверждение без факта»: ревьюер сверяет строку с партией. */
export const MARKERS = ['опять', 'снова', 'уже', 'ни разу', 'никогда', 'выполнено', 'до сих пор']
const MARKER_RE = new RegExp(MARKERS.join('|'), 'iu')
const MARKER_LABEL = MARKERS.join('/')

const DATE_RE = /^—— (.+?) ——$/
const SYS_RE = /^\[система\] (.*)$/
const TIME_RE = /^\[(\d{2}:\d{2})\] (.*)$/
const SPEECH_RE = /^([^:]{1,40}): (.*)$/

/** Строки расшифровки: реплика (говорящий+текст), служебная (система/карточка/уведомление). Даты — из разделителей дня. */
export function parseTranscript(text) {
  const out = []
  let date = '—'
  for (const raw of text.split('\n')) {
    const dm = DATE_RE.exec(raw)
    if (dm) { date = dm[1]; continue }
    if (!raw.trim()) continue
    if (raw.startsWith('Партия ')) continue
    if (/^\s/.test(raw)) continue // блок вариантов игрока и пометки — не речь
    const sm = SYS_RE.exec(raw)
    if (sm) { out.push({ kind: 'sys', who: 'система', text: sm[1], date }); continue }
    if (raw.startsWith('(')) { out.push({ kind: 'aside', who: '', text: raw, date }); continue }
    const rest = TIME_RE.exec(raw)?.[2] ?? raw
    const sp = SPEECH_RE.exec(rest)
    if (sp) out.push({ kind: 'text', who: sp[1], text: sp[2], date })
  }
  return out
}

/** Повторы внутри одной партии: ключ — говорящий и текст (у служебных — сам текст). */
function repeats(lines, kinds) {
  const by = new Map()
  for (const l of lines) {
    if (!kinds.includes(l.kind)) continue
    const key = l.kind === 'text' ? `${l.who}\u0000${l.text}` : l.text
    const hit = by.get(key)
    if (hit) { hit.count++; hit.last = l.date } else by.set(key, { who: l.who, text: l.text, count: 1, first: l.date, last: l.date })
  }
  // реплики игрока — монотонность бота, а не контент партии: в списке после персонажей
  const rank = (r) => (r.who === 'Я' ? 1 : 0)
  return [...by.values()].filter((r) => r.count > 1).sort((a, b) => rank(a) - rank(b) || b.count - a.count)
}

const entry = (r) => (r.who ? `${r.count}× ${r.who}: «${r.text}»` : `${r.count}× «${r.text}»`)

/** Отчёт по партиям: [{name, lines}]. Никаких вердиктов — только кандидаты. */
export function review(parties) {
  const out = []
  const sums = { lines: 0, said: 0, service: 0, repeats: 0, serviceRepeats: 0, markers: 0 }
  const repeatBlocks = []
  const serviceBlocks = []
  const markerBlocks = []
  for (const p of parties) {
    const { lines } = p
    sums.lines += lines.length
    sums.said += lines.filter((l) => l.kind === 'text').length
    sums.service += lines.filter((l) => l.kind !== 'text').length
    const rep = repeats(lines, ['text'])
    const srv = repeats(lines, ['sys', 'aside'])
    sums.repeats += rep.length
    sums.serviceRepeats += srv.length
    const markers = lines.filter((l) => l.kind !== 'aside' && MARKER_RE.test(l.text))
    sums.markers += markers.length
    repeatBlocks.push([p.name, rep])
    serviceBlocks.push([p.name, srv])
    markerBlocks.push([p.name, markers])
  }
  out.push(`Плейтест-разбор: партий — ${parties.length}, строк — ${sums.lines}, реплик — ${sums.said}, служебных — ${sums.service}`)
  const section = (title, blocks, fmt) => {
    out.push('', `== ${title} ==`)
    for (const [name, list] of blocks) {
      out.push(`${name}:`)
      if (!list.length) out.push('  нет')
      for (const x of list) out.push(`  ${fmt(x)}`)
    }
  }
  section('Повторы реплик (говорящий + текст, внутри партии)', repeatBlocks, (r) => `${entry(r)} — ${r.first} … ${r.last}`)
  section('Повторы служебных (система, карточки, уведомления)', serviceBlocks, (r) => `${entry(r)} — ${r.first} … ${r.last}`)
  section(`Кандидаты «${MARKER_LABEL}» (сверить с партией)`, markerBlocks, (l) => `[${l.date}] ${l.kind === 'sys' ? '[система] ' : `${l.who}: `}«${l.text}»`)
  out.push('', `== Итог ==`, `повторов: ${sums.repeats} · служебных повторов: ${sums.serviceRepeats} · кандидатов: ${sums.markers}`)
  return out.join('\n')
}

/** Файлы расшифровок: каталог с seed-*.txt или один файл. */
export function transcripts(path) {
  const st = statSync(path)
  const files = st.isDirectory()
    ? readdirSync(path).filter((n) => /^seed-.*\.txt$/.test(n)).sort().map((n) => join(path, n))
    : [path]
  if (!files.length) throw new Error(`нет расшифровок seed-*.txt в «${path}» — разбирать нечего`)
  return files.map((f) => ({ name: f.split('/').pop(), lines: parseTranscript(readFileSync(f, 'utf8')) }))
}

function main() {
  const path = process.argv[2]
  if (!path) {
    console.error('Использование: node scripts/playtest-review.mjs <каталог с seed-*.txt | файл расшифровки>')
    process.exit(2)
  }
  try {
    process.stdout.write(review(transcripts(path)) + '\n')
  } catch (e) {
    console.error(String(e.message ?? e))
    process.exit(2)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
