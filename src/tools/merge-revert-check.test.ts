// Проверка откатов (#736): синтетические репозитории — ветка влила main и разрешила конфликт своей стороной.
// Инструмент scripts/merge-revert-check.mjs: «строка, которой в main нет, но которую main когда-то убирал».
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = 'scripts/merge-revert-check.mjs'

/** git в синтетическом репозитории; падение — ошибка теста. */
function git(dir: string, ...args: string[]): string {
  const r = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
  expect(r.status, `git ${args.join(' ')} → ${r.stderr}`).toBe(0)
  return r.stdout.trim()
}

const run = (dir: string, main = 'main', head = 'HEAD') => {
  const r = spawnSync('node', [SCRIPT, dir, main, head], { encoding: 'utf8' })
  expect(r.error, 'node недоступен — инструмент нельзя проверить').toBeUndefined()
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const write = (dir: string, name: string, text: string) => writeFileSync(join(dir, name), text)
const commit = (dir: string, msg: string) => { git(dir, 'add', '-A'); git(dir, 'commit', '-qm', msg) }

/**
 * base: X/Z — рядом, ветка правит Y (конфликт на соседних строках) и мержит main.
 * resolve: 'ours' — взяли свою сторону (X/Z вернулись к base — откат); 'main' — взяли main; 'own' — своё новое значение.
 */
function mergedRepo(resolve: 'ours' | 'main' | 'own'): string {
  const dir = mkdtempSync(join(tmpdir(), 'revert-'))
  git(dir, 'init', '-q', '-b', 'main')
  write(dir, 'f.txt', 'line0\nX=old\nY=old\nZ=old\nline4\n')
  commit(dir, 'base')
  const base = git(dir, 'rev-parse', 'HEAD')
  write(dir, 'f.txt', 'line0\nX=new\nY=old\nZ=new\nline4\n')
  commit(dir, 'main: X=new, Z=new')
  git(dir, 'checkout', '-q', '-b', 'feature', base)
  write(dir, 'f.txt', 'line0\nX=old\nY=dev\nZ=old\nline4\n')
  commit(dir, 'feature: Y=dev')
  const merge = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', 'merge', 'main'], { cwd: dir, encoding: 'utf8' })
  expect(merge.status, 'ожидался конфликт: правки на соседних строках').not.toBe(0)
  write(dir, 'f.txt', { ours: 'line0\nX=old\nY=dev\nZ=old\nline4\n', main: 'line0\nX=new\nY=dev\nZ=new\nline4\n', own: 'line0\nX=own\nY=dev\nZ=own\nline4\n' }[resolve])
  commit(dir, `merge main (${resolve})`)
  return dir
}

/** base → main правит X → ветка правит далёкую строку и мержит main чисто. */
function cleanRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'revert-'))
  git(dir, 'init', '-q', '-b', 'main')
  write(dir, 'f.txt', 'X=old\nf1\nf2\nf3\nf4\nfar=old\n')
  commit(dir, 'base')
  const base = git(dir, 'rev-parse', 'HEAD')
  write(dir, 'f.txt', 'X=new\nf1\nf2\nf3\nf4\nfar=old\n')
  commit(dir, 'main: X=new')
  git(dir, 'checkout', '-q', '-b', 'feature', base)
  write(dir, 'f.txt', 'X=old\nf1\nf2\nf3\nf4\nfar=dev\n')
  commit(dir, 'feature: far=dev')
  git(dir, 'merge', '-q', '--no-edit', 'main')
  expect(git(dir, 'show', 'HEAD:f.txt')).toBe('X=new\nf1\nf2\nf3\nf4\nfar=dev')
  return dir
}

describe('проверка откатов (#736)', () => {
  it('конфликт, разрешённый своей стороной: обе возвращённые строки в отчёте, чужая правка — нет', () => {
    const dir = mergedRepo('ours')
    const { code, out } = run(dir)
    expect(code).toBe(1)
    expect(out, 'не молчит об обеих строках').toContain('X=old')
    expect(out).toContain('Z=old')
    expect(out, 'правка ветки Y=dev — не откат').not.toContain('Y=dev —')
    expect(out).toContain('f.txt')
  })
  it('конфликт, разрешённый в пользу main, — чисто', () => {
    const { code, out } = run(mergedRepo('main'))
    expect(code).toBe(0)
    expect(out).toMatch(/Откатов нет/)
  })
  it('ветка переписала строку main своим новым значением — не откат, чисто', () => {
    const { code } = run(mergedRepo('own'))
    expect(code).toBe(0)
  })
  it('чистое слияние с правкой вдалеке — чисто', () => {
    const { code, out } = run(cleanRepo())
    expect(code).toBe(0)
    expect(out).toMatch(/Откатов нет/)
  })
  it('ветка продублировала строку, которая в main уже есть, — не реставрация, чисто', () => {
    const dir = mkdtempSync(join(tmpdir(), 'revert-'))
    git(dir, 'init', '-q', '-b', 'main')
    write(dir, 'f.txt', '// note\ncode1\nf1\nf2\nf3\nf4\n')
    commit(dir, 'base')
    const base = git(dir, 'rev-parse', 'HEAD')
    write(dir, 'f.txt', '// note\ncode1b\nf1\nf2\nf3\nf4\n')
    commit(dir, 'main: code1b')
    git(dir, 'checkout', '-q', '-b', 'feature', base)
    write(dir, 'f.txt', '// note\ncode1\nf1\nf2\nf3\nf4\n// note\n')
    commit(dir, 'feature: второй // note')
    git(dir, 'merge', '-q', '--no-edit', 'main')
    expect(git(dir, 'show', 'HEAD:f.txt')).toBe('// note\ncode1b\nf1\nf2\nf3\nf4\n// note')
    expect(run(dir).code).toBe(0)
  })
  it('новый файл ветки — не реставрация: у него нет истории в main', () => {
    const dir = cleanRepo()
    git(dir, 'checkout', '-q', 'feature')
    write(dir, 'new.txt', 'X=old\n')
    commit(dir, 'feature: новый файл')
    expect(run(dir).code).toBe(0)
  })
  it('несуществующий ref — ошибка с кодом 2, а не «чисто»', () => {
    const dir = cleanRepo()
    const { code, err } = run(dir, 'nope', 'HEAD')
    expect(code).toBe(2)
    expect(err).toMatch(/git/)
  })
})
