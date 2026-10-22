// Проверка моментов нарезки поста (#1238): каждая строка сценария — из расшифровки указанного сида.
// Манифест docs/marketing/pikabu-moments.json ходит в паре с docs/marketing/pikabu-cut.md: текст в посте
// и снятые кадры должны существовать в партии, а не быть придуманными для красоты.
//
// Запуск: node scripts/marketing-moments.mjs [манифест] [--transcript <расшифровка>]
//   без --transcript партия переигрывается ботом (PLAYTEST_SEEDS/PLAYTEST_TURNS из манифеста);
//   с --transcript сверяется готовая расшифровка (так инструмент проверяется тестом).
// Коды выхода: 0 — все строки сошлись, 1 — расхождение, 2 — манифест/расшифровка/прогон не дали материала.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_MANIFEST = 'docs/marketing/pikabu-moments.json'

/** Строки, чей текст не совпал: [{id, n, why}]. Пусто — сценарий подтверждён расшифровкой. */
export function checkMoments(text, moments) {
  const lines = text.split('\n')
  const out = []
  for (const m of moments) {
    for (const l of m.lines) {
      const line = lines[l.n - 1]
      if (line === undefined) out.push({ id: m.id, n: l.n, why: `строки ${l.n} нет — в расшифровке ${lines.length}` })
      else if (!line.trim().includes(l.text)) out.push({ id: m.id, n: l.n, why: `не совпало: «${line.trim().slice(0, 90)}»` })
    }
  }
  return out
}

/** Манифест без моментов прошёл бы любую сверку — это ошибка входа, а не зелёный прогон. */
export function validateManifest(data) {
  const bad = []
  if (!Array.isArray(data.moments) || data.moments.length === 0) bad.push('в манифесте нет моментов')
  for (const m of data.moments ?? []) {
    if (!m.id) bad.push('у момента нет id')
    if (!Array.isArray(m.lines) || m.lines.length === 0) bad.push(`${m.id ?? '?'}: нет строк`)
    for (const l of m.lines ?? []) {
      if (!Number.isInteger(l.n) || l.n < 1) bad.push(`${m.id ?? '?'}: номер строки «${l.n}» не положительное целое`)
      if (typeof l.text !== 'string' || !l.text.trim()) bad.push(`${m.id ?? '?'}: пустой текст строки ${l.n}`)
    }
  }
  if (data.seed !== undefined && (!Number.isInteger(data.seed) || data.seed < 1)) bad.push(`сид «${data.seed}» не положительное целое`)
  if (data.turns !== undefined && (!Number.isInteger(data.turns) || data.turns < 1)) bad.push(`ходов «${data.turns}» не положительное целое`)
  return bad
}

/** Партия ботом: расшифровка `seed-<N>.txt` во временном каталоге. Пусто — прогон не дал файла. */
function playtestText(seed, turns, root) {
  const dir = mkdtempSync(join(tmpdir(), 'marketing-'))
  const r = spawnSync('npx', ['vitest', 'run', 'src/tools/playtest.test.ts'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PLAYTEST_OUT: dir, PLAYTEST_SEEDS: String(seed), PLAYTEST_TURNS: String(turns) },
  })
  if (r.status !== 0) {
    process.stderr.write(`прогон сида ${seed} не удался:\n${(r.stderr || r.stdout).split('\n').slice(-12).join('\n')}\n`)
    return ''
  }
  try {
    return readFileSync(join(dir, `seed-${seed}.txt`), 'utf8')
  } catch {
    return ''
  }
}

function main(argv) {
  let manifest = DEFAULT_MANIFEST
  let transcript = ''
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--transcript') { transcript = argv[++i] ?? ''; continue }
    if (argv[i].startsWith('--')) { process.stderr.write(`не понимаю ключ ${argv[i]}\n`); return 2 }
    manifest = argv[i]
  }
  if (!transcript && argv.includes('--transcript')) { process.stderr.write('--transcript без пути\n'); return 2 }

  let data
  try {
    data = JSON.parse(readFileSync(manifest, 'utf8'))
  } catch (e) {
    process.stderr.write(`не читается манифест ${manifest}: ${e.message}\n`)
    return 2
  }
  const bad = validateManifest(data)
  if (bad.length) {
    process.stderr.write(`манифест ${manifest}:\n${bad.map((b) => `  ${b}`).join('\n')}\n`)
    return 2
  }

  const root = process.cwd()
  const byParty = new Map()
  for (const m of data.moments) {
    const seed = m.seed ?? data.seed
    const turns = m.turns ?? data.turns ?? 300
    if (!transcript && !Number.isInteger(seed)) {
      process.stderr.write(`${m.id}: не задан сид ни у момента, ни у манифеста\n`)
      return 2
    }
    if (!transcript) byParty.set(`${seed}:${turns}`, { seed, turns })
  }

  let failed = 0
  let checked = 0
  for (const m of data.moments) {
    const seed = m.seed ?? data.seed
    const turns = m.turns ?? data.turns ?? 300
    let text = transcript ? readFileSync(transcript, 'utf8') : byParty.get(`${seed}:${turns}`)?.text
    if (!transcript && text === undefined) {
      text = playtestText(seed, turns, root)
      byParty.set(`${seed}:${turns}`, { seed, turns, text })
    }
    if (!text) {
      process.stderr.write(`${m.id}: нет расшифровки сида ${seed} (${turns} ходов) — сверять нечего\n`)
      return 2
    }
    const problems = checkMoments(text, [m])
    checked += m.lines.length
    if (problems.length) {
      failed += problems.length
      for (const p of problems) process.stdout.write(`✗ ${p.id}:${p.n} — ${p.why}\n`)
    } else {
      const first = m.lines[0]
      const quote = text.split('\n')[first.n - 1].trim().slice(0, 72)
      process.stdout.write(`✓ ${m.id}: ${m.lines.map((l) => l.n).join(', ')} — «${quote}»\n`)
    }
  }

  const where = transcript ? transcript : `сид ${data.seed}, ${data.turns ?? 300} ходов`
  if (failed) {
    process.stdout.write(`\nМоменты не сошлись: ${failed} из ${checked} строк (${where}).\n`)
    return 1
  }
  process.stdout.write(`\nМоменты сошлись: ${data.moments.length} из ${data.moments.length}, строк ${checked} (${where}).\n`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)))
