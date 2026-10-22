// Моменты нарезки поста (#1238): инструмент scripts/marketing-moments.mjs сверяет строки сценария
// с расшифровкой указанного сида. Здесь — сам инструмент на синтетической расшифровке; настоящий
// сценарий переигрывается ботом руками (`node scripts/marketing-moments.mjs`), в CI его нет:
// расшифровка сида сдвигается от каждого контентного PR, и сторожа на неё были бы красными не по делу.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = 'scripts/marketing-moments.mjs'

interface Moment { id: string; title: string; show: string; lines: Array<{ n: number; text: string }> }
interface Manifest { seed: number; turns: number; moments: Moment[] }

const TRANSCRIPT = [
  'Партия 42, стиль neutral',
  '—— 1 января 2027 г. ——',
  '[12:00] Алик: Деньги в бетоне.',
  '(на фоне кто-то протяжно: «Мууууу»)',
  '    варианты:',
  '      Алик, это ты на фото? Или баран?',
].join('\n')

const MOMENTS: Manifest = {
  seed: 42,
  turns: 10,
  moments: [
    { id: 'beton', title: 'бетон', show: 'карточка', lines: [{ n: 3, text: '[12:00] Алик: Деньги в бетоне.' }] },
    { id: 'button', title: 'кнопка', show: 'блок вариантов', lines: [{ n: 6, text: 'Алик, это ты на фото? Или баран?' }] },
  ],
}

function run(manifest: unknown, transcript = TRANSCRIPT) {
  const dir = mkdtempSync(join(tmpdir(), 'marketing-test-'))
  const manifestPath = join(dir, 'moments.json')
  writeFileSync(manifestPath, JSON.stringify(manifest))
  const transcriptPath = join(dir, 'seed.txt')
  writeFileSync(transcriptPath, transcript)
  const r = spawnSync('node', [SCRIPT, manifestPath, '--transcript', transcriptPath], { encoding: 'utf8' })
  expect(r.error, 'node недоступен — инструмент нельзя проверить').toBeUndefined()
  return { code: r.status, out: r.stdout, err: r.stderr }
}

describe('моменты нарезки поста (#1238)', () => {
  it('все строки сценария нашлись в расшифровке — зелёный прогон', () => {
    const { code, out } = run(MOMENTS)
    expect(code, out).toBe(0)
    expect(out).toContain('✓ beton: 3')
    expect(out).toContain('✓ button: 6')
    expect(out).toMatch(/Моменты сошлись: 2 из 2, строк 2/)
  })

  it('подменённый текст — красный с номером строки, а не «похоже»', () => {
    const broken = structuredClone(MOMENTS)
    broken.moments[0].lines[0].text = '[12:00] Алик: Деньги в банке с огурцами.'
    const { code, out } = run(broken)
    expect(code).toBe(1)
    expect(out).toMatch(/✗ beton:3/)
    expect(out).toContain('не совпало')
  })

  it('номер строки за концом расшифровки — красный, а не пусто', () => {
    const broken = structuredClone(MOMENTS)
    broken.moments[1].lines[0].n = 600
    const { code, out } = run(broken)
    expect(code).toBe(1)
    expect(out).toMatch(/✗ button:600/)
    expect(out).toContain('строки 600 нет')
  })

  it('манифест без моментов — ошибка входа, а не пустая зелень', () => {
    const { code, err } = run({ seed: 42, moments: [] })
    expect(code).toBe(2)
    expect(err).toContain('нет моментов')
  })

  it('нечисловой номер строки и пустой текст — ошибка входа', () => {
    const bad = { seed: 42, moments: [{ id: 'x', lines: [{ n: '3', text: ' ' }] }] }
    const { code, err } = run(bad)
    expect(code).toBe(2)
    expect(err).toContain('не положительное целое')
    expect(err).toContain('пустой текст')
  })

  it('испорченный манифест — ошибка входа с путём, а не «сошлось»', () => {
    const dir = mkdtempSync(join(tmpdir(), 'marketing-test-'))
    const manifestPath = join(dir, 'broken.json')
    writeFileSync(manifestPath, '{ не json')
    const r = spawnSync('node', [SCRIPT, manifestPath], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('не читается манифест')
  })
})
