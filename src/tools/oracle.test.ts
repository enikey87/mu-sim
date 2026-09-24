// Оракул аудита: проверки — классы фактов, а не строки. Тесты держат три вещи:
//   1) фикстуры двух веток (обрезанные окна смерти, поле fixture в дампе объясняет происхождение);
//   2) негативный контроль — каждую проверку видно красной на партии, собранной в этом же тесте;
//   3) опорные фразы оракула всё ещё живут в исходниках игры.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Game } from '../engine/game'
import { playtest, transcript, worldDump } from './playtest'

const ORACLE = '.claude/skills/playtest-audit/oracle.py'
const FIXTURES = '.claude/skills/playtest-audit/fixtures'

interface Verdict { violations: Record<string, number>; games_affected: Record<string, number>; coverage: Record<string, number> }

/** Прогон оракула по каталогу; падение питона — не «чисто», а ошибка теста. */
function oracle(dir: string, env: Record<string, string> = {}): { code: number | null; verdict: Verdict | null; err: string } {
  const r = spawnSync('python3', [ORACLE, dir], { env: { ...process.env, ...env }, encoding: 'utf8' })
  expect(r.error, 'python3 недоступен — оракул нельзя проверить').toBeUndefined()
  return { code: r.status, verdict: r.stdout ? (JSON.parse(r.stdout) as Verdict) : null, err: r.stderr }
}

/** Партия как каталог для оракула: расшифровка и дамп фактов рядом, как их пишет npm run playtest. */
async function dump(seed: number, turns: number, watch?: (game: Game) => void): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-'))
  const p = await playtest(seed, turns, undefined, watch)
  writeFileSync(join(dir, `seed-${seed}.txt`), transcript(p))
  writeFileSync(join(dir, `seed-${seed}.world.json`), JSON.stringify(worldDump(p)))
  return dir
}

describe('оракул: фикстуры двух веток', () => {
  it('на ed718f8 находит смерть, кончившуюся по таймеру; на main того же сида — чисто', () => {
    const old = oracle(join(FIXTURES, 'ed718f8')).verdict!
    const now = oracle(join(FIXTURES, 'main')).verdict!
    expect(old.violations.dead_fact_lost).toBe(1)
    expect(old.coverage.dead_lost_frames).toBeGreaterThan(0) // окно осталось открытым — это и есть класс
    expect(now.violations).toEqual({})
    expect(now.coverage.games_with_dead).toBe(1) // то же окно смерти в выборке есть: чисто не от пустоты
  })

  it('на ed718f8 находит мьют «как в первый раз» повторно; на main того же сида — чисто', () => {
    const old = oracle(join(FIXTURES, 'mute-ed718f8')).verdict!
    const now = oracle(join(FIXTURES, 'mute-main')).verdict!
    expect(old.violations.mute_as_first_repeat).toBe(3) // первый мьют + три повторных с тем же текстом
    expect(old.coverage.mute_events).toBe(4) // окно не пусто: события мьюта в выборке есть
    expect(now.violations).toEqual({})
    expect(now.coverage.mute_events).toBe(4)
  })

  it('пустое окно называет себя, а не выглядит нулём нарушений', () => {
    const v = oracle(join(FIXTURES, 'main')).verdict!
    expect(v.coverage.blood_unexercised).toBe(1)
    const req = oracle(join(FIXTURES, 'main'), { ORACLE_REQUIRE: 'blood' })
    expect(req.code).not.toBe(0)
    expect(req.err).toMatch(/blood/)
    expect(oracle(join(FIXTURES, 'main'), { ORACLE_REQUIRE: 'dead' }).code).toBe(0)
  })
})

/** Фикстура с одной нарочно сломанной чертой — так проверку видно красной на настоящем кадре. */
function mutate(from: string, to: string, change: (d: { frames: Frame[]; rules: { deathGated: string[] } }) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-'))
  const d = JSON.parse(readFileSync(join(FIXTURES, from, 'seed-14.world.json'), 'utf8'))
  change(d)
  writeFileSync(join(dir, 'seed-14.world.json'), JSON.stringify(d))
  writeFileSync(join(dir, 'seed-14.txt'), readFileSync(join(FIXTURES, to, 'seed-14.txt')))
  return dir
}

interface Frame { before: Record<string, unknown>; mem: Record<string, unknown>; said: { w: string; k: string }[]; fired: { event: string; chosen: string[] }[]; away: string[] }

describe('оракул: негативный контроль', () => {
  it('речь в окне смерти без гейта — находка; тот же кадр с гейтом — нет', () => {
    const clean = oracle(join(FIXTURES, 'main')).verdict!
    expect(clean.violations.dead_speech).toBeUndefined()
    const dir = mutate('main', 'main', (d) => {
      const gated = new Set(d.rules.deathGated)
      const f = d.frames.find((x) => x.before.alik_dead && x.said.length && x.fired.some((h) => h.chosen.some((n) => gated.has(n))))!
      expect(f, 'в фикстуре не нашлось хода смерти с гейтом — контролю нечего ломать').toBeDefined()
      for (const h of f.fired) h.chosen = h.chosen.filter((n) => !gated.has(n)) // гейт снят: говорит обычное правило
    })
    expect(oracle(dir).verdict!.violations.dead_speech).toBeGreaterThan(0)
  })

  it('факт смерти, пропавший без шага серии, — находка; шаг серии тот же кадр оправдывает', () => {
    const dir = mutate('main', 'main', (d) => {
      const i = d.frames.findIndex((f) => f.before.alik_dead && !f.mem.alik_dead)!
      expect(i, 'в фикстуре не нашлось хода возвращения — контролю нечего ломать').toBeGreaterThan(0)
      d.frames[i].mem['arc.alik_death'] = d.frames[i].before['arc.alik_death'] // серия не шагнула
    })
    expect(oracle(dir).verdict!.violations.dead_fact_lost).toBe(1)
    expect(oracle(join(FIXTURES, 'main')).verdict!.violations.dead_fact_lost).toBeUndefined()
  })

  it('пачка непрочитанных при мёртвом Алике молчит по правилу — событие в дампе есть, сообщений нет', async () => {
    const dir = await dump(3, 2, async (g) => {
      g.S.mem['alik_dead'] = true
      await g.awayBurst(2, 1, 'Пока телефон заряжался')
    })
    const v = oracle(dir).verdict!
    expect(v.violations.dead_away_loud).toBeUndefined()
    expect(v.coverage.away_events).toBe(2) // окно не пусто: пачку пытались доставить дважды
    expect(v.coverage.away_messages).toBe(0)
    expect(v.coverage.away_unexercised).toBeUndefined()
  })

  it('сообщения пачки в кадре смерти — находка: проверка не зависит от того, каким путём они пришли', () => {
    const dir = mutate('main', 'main', (d) => {
      const f = d.frames.find((x) => x.before.alik_dead)!
      expect(f, 'в фикстуре не нашлось кадра смерти — контролю нечего ломать').toBeDefined()
      f.away = ['[12:00] Алик: Эээ, брат, ты спишь?']
    })
    expect(oracle(dir).verdict!.violations.dead_away_loud).toBe(1)
  })

  it('уведомление, показанное мимо выборщика, ловится по своему же условию', async () => {
    const text = 'Спасибо, что пришли сдать кровь! Вы наш герой. Приходите ещё.'
    const dir = await dump(5, 2, (g) => g.notify('🩸', 'Донорский центр', text))
    const v = oracle(dir).verdict!
    expect(v.violations.notif_gate_false).toBe(1)
    // та же партия без обхода гейта — чисто: проверка различает показанное и объявленное
    const clean = await dump(5, 2)
    expect(oracle(clean).verdict!.violations.notif_gate_false).toBeUndefined()
  })

  it('ход смерти через движок правил: дамп называет гейты — судить есть чем', async () => {
    const dir = await dump(9, 6, (g) => { g.S.mem['alik_dead'] = true })
    const v = oracle(dir).verdict!
    expect(v.coverage.games_with_dead).toBe(1)
    expect(v.coverage.games_without_rule_gates).toBeUndefined()
  })
})

describe('оракул: опорные фразы', () => {
  const src = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? src(p) : /\.(ts|tsx)$/.test(n) ? [readFileSync(p, 'utf8')] : []
    })

  it('каждая фраза оракула всё ещё есть в исходниках игры — иначе проверка осиротела молча', () => {
    const r = spawnSync('python3', [ORACLE, '--markers'], { encoding: 'utf8' })
    const { markers, anchors } = JSON.parse(r.stdout) as { markers: Record<string, string>; anchors: Record<string, string> }
    expect(Object.keys(anchors).sort()).toEqual(Object.keys(markers).sort())
    const game = src('src').join('\n')
    const dead = Object.entries(anchors).filter(([, a]) => !game.includes(a)).map(([k]) => k)
    expect(dead, 'фразы исчезли из игры — обнови MARKERS в oracle.py').toEqual([])
  })
})
