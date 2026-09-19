// Большая симуляция: бот играет сотни ходов; проверяем отсутствие ошибок, повторов и нелогичных пар «реплика → ответ».
import { describe, it, expect } from 'vitest'
import { makeGame, botTurn, alikTexts, FIX_RE } from './helpers'
import { SAD, TIMEY } from '../engine/game'
import type { Choice, Ctx } from '../engine/state'
import { D } from '../content/excuses'

interface Step { choice: Choice | null; ctxBefore: Ctx | null; replies: string[] }

async function play(seed: number, turns: number) {
  const { game } = makeGame({ seed })
  const steps: Step[] = []
  for (let i = 0; i < turns; i++) {
    const ctxBefore = game.S.ctx ? { ...game.S.ctx } : null
    const from = game.S.msgs.length
    const choice = await botTurn(game)
    steps.push({ choice, ctxBefore, replies: alikTexts(game.S.msgs.slice(from)) })
  }
  return { game, steps }
}

describe.each([1, 2, 3])('симуляция, seed %i', (seed) => {
  it('300 ходов без ошибок, повторов и нелогичных ответов', async () => {
    const { game, steps } = await play(seed, 300)

    // 1. нет мусора в текстах
    const all = JSON.stringify(game.S.msgs)
    expect(all).not.toMatch(/undefined|NaN|\[object|null,"t|г\.\./)

    // 2. реплики Алика не повторяются (исправления опечаток — естественно повторяются)
    const texts = alikTexts(game.S.msgs).filter((t) => !FIX_RE.test(t))
    const dups = texts.filter((t, i) => texts.indexOf(t) !== i)
    expect(dups).toEqual([])

    // 3. логика пар «вариант → контекст»
    for (const s of steps) {
      const c = s.choice
      if (!c?.act) continue
      const ctx = s.ctxBefore ?? {}
      if (c.act === 'congrats') expect(ctx.sad, 'поздравление после печального события').not.toBe(true)
      if (c.act === 'condole') expect(ctx.sad, 'соболезнование без повода').toBe(true)
      if (c.act === 'shortQ') expect(TIMEY.test(ctx.s ?? ''), `«это когда?» на «${ctx.s}»`).toBe(true)
      if (c.act === 'voiceText') expect(s.replies.join(' '), 'ответ на «текстом» — про корову').not.toMatch(/коров|мычан/i)
      if (c.act === 'idleReply') expect(ctx.type).toBe('idle')
      if (c.act === 'reactQ') expect(ctx.type).toBe('reactOnly')
      if (['photo', 'voice', 'voiceText', 'transferQ', 'stickerQ', 'fwdQ'].includes(c.act)) {
        const want = { photo: 'photo', voice: 'voice', voiceText: 'voice', transferQ: 'transfer', stickerQ: 'sticker', fwdQ: 'fwd' }[c.act]
        expect(ctx.type, `${c.act} при ctx.type=${ctx.type}`).toBe(want)
      }
    }

    // 4. что-то в игре происходило
    expect(game.S.stats.sent).toBeGreaterThan(200)
    expect(Object.keys(game.S.ach).length).toBeGreaterThan(20)
  }, 60_000)
})

describe('разнообразие', () => {
  it('за три партии срабатывают все виды хода Алика и все сцены', async () => {
    const fired = new Set<string>()
    const scenes = new Set<string>()
    for (const seed of [11, 12, 13]) {
      const { game } = makeGame({ seed })
      const orig = game.rules.fire.bind(game.rules)
      game.rules.fire = async (...a: Parameters<typeof orig>) => { const r = await orig(...a); if (r) fired.add(r.name); return r }
      for (let i = 0; i < 250; i++) {
        await botTurn(game)
        if (game.S.scene) scenes.add(game.S.scene.id)
      }
    }
    for (const r of ['Turn_Scene', 'Turn_Arc', 'Turn_Group', 'Turn_Wrong', 'Turn_Sticker', 'Turn_Forward', 'Turn_Transfer', 'Turn_Job', 'Turn_Photo', 'Turn_Voice', 'Turn_Short', 'Turn_Excuse', 'Tone_Rude'])
      expect(fired, r).toContain(r)
    expect(scenes.size).toBeGreaterThanOrEqual(12)
  }, 120_000)
  it('SAD покрывает печальные события словаря', () => {
    expect((D.EVENT as string[]).filter((e) => SAD.test(e)).length).toBeGreaterThan(15)
  })
})
