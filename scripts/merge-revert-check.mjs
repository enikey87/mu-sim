// Проверка перед PR (#736): ветка не возвращает молча то, что main убирал.
// Класс #723: ветка влила main, разрешила конфликт своей стороной — строка, которую main менял
// (и её текущее значение), вернулась к старому. Git такое слияние пропускает молча, CI зелёный.
//
// Критерий: строка, которую ветка добавляет относительно main (`git diff main head`) и которой в main
// сейчас нет, но которая в истории main была (`git log -S`) — реставрация удалённого: файл, строка, коммит.
// Легитимная правка так тоже может выглядеть (вернули старую формулировку нарочно) — это предупреждение,
// решение за агентом: исправить или объяснить в PR.
// Запуск: node scripts/merge-revert-check.mjs [репозиторий] [main-ref] [head-ref]
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const run = (dir, args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
  if (r.error) throw new Error(`git недоступен: ${r.error.message}`)
  return { code: r.status, out: r.stdout, err: r.stderr }
}
const must = (dir, args) => {
  const r = run(dir, args)
  if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${(r.err || r.out).trim()}`)
  return r.out
}

/** Строки, которые ветка добавляет относительно main и которых нет в текущей версии main. */
export function addedLines(dir, main, head) {
  const files = must(dir, ['diff', '--name-only', main, head]).split('\n').map((s) => s.trim()).filter(Boolean)
  const out = []
  for (const file of files) {
    const diff = must(dir, ['diff', '--unified=0', main, head, '--', file])
    const shown = run(dir, ['show', `${main}:${file}`])
    const mainText = shown.code === 0 ? shown.out : '' // файла в main нет: любые строки — новые
    for (const raw of diff.split('\n')) {
      if (!raw.startsWith('+') || raw.startsWith('+++')) continue
      const text = raw.slice(1).trim()
      if (!text || mainText.includes(text)) continue // пустое или строка и так есть в main — не добавка
      out.push({ file, text })
    }
  }
  return out
}

/** Где main убирал эту строку: последний коммит, поменявший её количество (пусто — никогда). */
export function removedIn(dir, main, file, text) {
  const out = run(dir, ['log', '-S', text, '--format=%h', '-1', main, '--', file])
  return out.code === 0 ? out.out.trim() : ''
}

/** Отчёт: массив находок {file, text, commit}. Пустой — ветка ничего удалённого не вернула. */
export function checkReverts(dir, main, head) {
  const found = []
  for (const { file, text } of addedLines(dir, main, head)) {
    const commit = removedIn(dir, main, file, text)
    if (commit) found.push({ file, text, commit })
  }
  return found
}

function main() {
  const [dir = '.', mainRef = 'origin/main', headRef = 'HEAD'] = process.argv.slice(2)
  let found
  try {
    must(dir, ['rev-parse', '--verify', '--quiet', mainRef])
    must(dir, ['rev-parse', '--verify', '--quiet', headRef])
    if (run(dir, ['merge-base', '--is-ancestor', mainRef, headRef]).code !== 0) {
      console.error(`Замечание: ${headRef} не содержит ${mainRef} — перед PR ветку стоит слить с main; сравниваю как есть.`)
    }
    found = checkReverts(dir, mainRef, headRef)
  } catch (e) {
    console.error(String(e.message ?? e))
    process.exit(2)
  }
  const files = new Set(found.map((f) => f.file))
  if (!found.length) {
    console.log(`Откатов нет: ${mainRef} против ${headRef} — ни одна добавленная строка не была удалена в истории main.`)
    return
  }
  console.log(`Возможные откаты: ${mainRef} против ${headRef}`)
  for (const f of found) console.log(`  ${f.file}: строка возвращена, main её убирал (${f.commit}):\n    ${f.text}`)
  console.log(`Итог: ${found.length} строк(и) в ${files.size} файл(ах) — исправь или объясни в PR.`)
  process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
