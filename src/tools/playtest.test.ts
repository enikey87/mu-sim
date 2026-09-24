// Плейтест: партия воспроизводится по seed и по записи действий.
// Прогон для разбора: PLAYTEST_OUT=<папка> PLAYTEST_SEEDS=1-8 [PLAYTEST_TURNS=300] npm run playtest
import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { is, missing } from '../engine/rules'
import { playtest, transcript, worldDump, deathGated, requiresKey } from './playtest'
import { alikDead } from '../content/memkeys'
import type { Game } from '../engine/game'
import type { Rule } from '../engine/rules'

describe('плейтест', () => {
  it('тот же seed — та же партия; запись действий проигрывается в ту же переписку', async () => {
    const a = await playtest(4, 80)
    const b = await playtest(4, 80)
    expect(transcript(b)).toBe(transcript(a))
    expect(a.acts.some((x) => x.kind === 'send')).toBe(true)
    const r = await playtest(4, 0, a.acts)
    expect(transcript(r)).toBe(transcript(a))
    expect(a.world.length).toBe(a.acts.length)
    expect(worldDump(a)).toEqual(expect.objectContaining({ seed: 4, frames: expect.any(Array) }))
  }, 60_000)
  it('расхождение с записью — ошибка, а не другая партия', async () => {
    const a = await playtest(4, 10)
    const acts = a.acts.map((x) => (x.kind === 'send' ? { ...x, offered: ['не то'] } : x))
    await expect(playtest(4, 0, acts)).rejects.toThrow(/replay/)
  })
  it('речь после молчащего правила не приписывается ему', async () => {
    const p = await playtest(9, 8, undefined, (g: Game) => {
      g.S.mem[alikDead] = true
      g.rules.add({
        name: 'Quiet_Probe_Silent', event: 'AlikTurn', when: [is(alikDead)], specificity: 10_000,
        respond: () => false,
      })
    })
    const attributed = p.world.flatMap((f) => f.said).filter((s) => s.r === 'Quiet_Probe_Silent')
    expect(attributed).toEqual([])
  }, 60_000)
  it('requiresKey: missing(alik_dead) — не гейт смерти; is(alik_dead) — гейт', () => {
    expect(requiresKey(missing(alikDead), alikDead)).toBe(false)
    expect(requiresKey(is(alikDead), alikDead)).toBe(true)
    const liveOnly = [{ name: 'Live', event: 'X', when: [missing(alikDead)] }] as Rule<Game>[]
    const deadGate = [{ name: 'Dead', event: 'X', when: [is(alikDead)] }] as Rule<Game>[]
    expect(deathGated(liveOnly)).toEqual([])
    expect(deathGated(deadGate)).toEqual(['Dead'])
  })
})

const seeds = (s: string): number[] => s.split(',').flatMap((p) => {
  const [a, b] = p.split('-').map(Number)
  return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]
})

describe.runIf(process.env.PLAYTEST_OUT)('прогон для разбора', () => {
  it('пишет переписки и записи действий', async () => {
    const out = process.env.PLAYTEST_OUT!
    mkdirSync(out, { recursive: true })
    for (const seed of seeds(process.env.PLAYTEST_SEEDS ?? '1-4')) {
      const p = await playtest(seed, Number(process.env.PLAYTEST_TURNS ?? 300))
      writeFileSync(join(out, `seed-${seed}.txt`), transcript(p))
      writeFileSync(join(out, `seed-${seed}.json`), JSON.stringify({ seed, style: p.style, hour: p.hour, acts: p.acts }))
      writeFileSync(join(out, `seed-${seed}.world.json`), JSON.stringify(worldDump(p)))
    }
  }, 1_800_000)
})
