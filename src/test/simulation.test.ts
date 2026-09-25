// Большая симуляция: бот играет сотни ходов; проверяем отсутствие ошибок, повторов и нелогичных пар «реплика → ответ».
import { describe, it, expect } from 'vitest'
import { makeGame, botTurn, alikTexts, FIX_RE } from './helpers'
import { SAD, TIMEY } from '../engine/game'
import type { Choice, Ctx } from '../engine/state'
import { D } from '../content/excuses'
import { WORLD } from '../content/world'
import { ENDGAME_ALIK_BACK, ENDGAME_FORMALITIES, ENDGAME_RETURNER_LINES } from '../content/endgame'

interface Step { choice: Choice | null; ctxBefore: Ctx | null; mourning: boolean; replies: string[] }

async function play(seed: number, turns: number) {
  const { game } = makeGame({ seed })
  const steps: Step[] = []
  // эндгейм гоняет формальности по кругу (#190/#267) — абсолютный uniq только до закрытия концовки;
  // после — запрет подряд (docs/design/endgame.md), не полное исключение эндгейма
  let beforeEndgame = Infinity
  for (let i = 0; i < turns; i++) {
    const ctxBefore = game.S.ctx ? { ...game.S.ctx } : null
    const mourning = game.holds(WORLD.mourning)
    const from = game.S.msgs.length
    const choice = await botTurn(game)
    if (game.S.mem['endgame.active'] && beforeEndgame === Infinity) beforeEndgame = game.S.msgs.length
    steps.push({ choice, ctxBefore, mourning, replies: alikTexts(game.S.msgs.slice(from)) })
  }
  return { game, steps, beforeEndgame }
}

/** Реплики Алика без исправлений опечаток; подряд — соседние одинаковые. */
const alikLines = (msgs: Parameters<typeof alikTexts>[0]) => alikTexts(msgs).filter((t) => !FIX_RE.test(t))
const consecutive = (texts: string[]) => texts.filter((t, i) => i > 0 && t === texts[i - 1])

const FORMALITIES = new Set<string>(ENDGAME_FORMALITIES)
const NEVER_AGAIN = new Set<string>([...Object.values(ENDGAME_RETURNER_LINES).flat(), ...ENDGAME_ALIK_BACK])
/**
 * Повторы эндгейма по docs/design/endgame.md: формальность — из колоды, повтор только после полного круга;
 * реплики возвращающих и «Алик добавил обратно» — никогда. Круг считается по самим показам, не по соседству.
 */
function endgameRepeats(texts: readonly string[]): string[] {
  const out: string[] = []
  let round = new Set<string>()
  const once = new Set<string>()
  for (const t of texts) {
    if (FORMALITIES.has(t)) {
      if (round.has(t)) {
        if (round.size < FORMALITIES.size) out.push(`формальность до конца колоды (${round.size}/${FORMALITIES.size}): ${t}`)
        round = new Set()
      }
      round.add(t)
    } else if (NEVER_AGAIN.has(t)) {
      if (once.has(t)) out.push(`повтор возвращения: ${t}`)
      once.add(t)
    }
  }
  return out
}

describe.each([1, 2, 3])('симуляция, seed %i', (seed) => {
  it('300 ходов без ошибок, повторов и нелогичных ответов', async () => {
    const { game, steps, beforeEndgame } = await play(seed, 300)

    // 1. нет мусора в текстах
    const all = JSON.stringify(game.S.msgs)
    expect(all).not.toMatch(/undefined|NaN|\[object|null,"t|г\.\./)

    // 2. до эндгейма — без повторов вовсе; в эндгейме — без подряд (колода формальностей по кругу)
    const pre = alikLines(game.S.msgs.slice(0, beforeEndgame))
    expect(pre.filter((t, i) => pre.indexOf(t) !== i)).toEqual([])
    const endgame = alikLines(game.S.msgs.slice(beforeEndgame))
    expect(consecutive(endgame)).toEqual([])
    // колода, а не только «не подряд»: срез эндгейма не пустой, формальности в нём есть
    expect(endgame.filter((t) => FORMALITIES.has(t)).length, 'формальностей в эндгейме нет — проверка пуста').toBeGreaterThan(20)
    expect(endgameRepeats(endgame)).toEqual([])

    // 3. логика пар «вариант → контекст»
    for (const s of steps) {
      const c = s.choice
      if (!c?.act) continue
      const ctx = s.ctxBefore ?? {}
      if (c.act === 'congrats') expect(ctx.sad, 'поздравление после печального события').not.toBe(true)
      if (c.act === 'condole') expect(ctx.sad === true || s.mourning, 'соболезнование без повода').toBe(true)
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

describe('повторы в эндгейме (#267, #304)', () => {
  it('круг колоды: повтор после полного круга законен, раньше — нет', () => {
    const all = [...FORMALITIES]
    expect(endgameRepeats([...all, all[0], all[1]])).toEqual([])
    expect(endgameRepeats([all[0], all[1], all[0]])).toEqual([expect.stringMatching(/^формальность до конца колоды \(2\//)])
  })
})

describe('разнообразие', () => {
  it('за десять партий срабатывают все виды хода Алика и все сцены', async () => {
    const fired = new Set<string>()
    const scenes = new Set<string>()
    // Turn_Wrong — меньше одного за партию: на пяти сидах ноль попаданий случался и на main (#287)
    for (const seed of [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
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
  }, 240_000)
  it('SAD покрывает печальные события словаря', () => {
    expect((D.EVENT as string[]).filter((e) => SAD.test(e)).length).toBeGreaterThan(15)
  })
})
