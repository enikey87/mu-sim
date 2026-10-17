// ВРЕМЕННЫЙ замер сидов (#918) — удалить после подбора.
import { describe, it } from 'vitest'
import { makeGame, botTurn } from '../test/helpers'
import type { Game } from '../engine/game'

const recharge = async (game: Game): Promise<boolean> => {
  if (!game.battery.dead) return false
  await game.battery.charge()
  return true
}

async function playToPayday(game: Game, maxTurns = 200): Promise<{ barter: number; payday: number | null }> {
  await game.playArc('boris')
  let barter = 0
  game.rules.tracer = (t) => { if (t.chosen.length && t.event === 'PickScene' && t.chosen[0] === 'Scene_barter') barter++ }
  let payday: number | null = null
  for (let t = 0; t < maxTurns; t++) {
    if (await recharge(game)) continue
    if (game.S.mem.payday !== undefined || game.S.scene?.id === 'payday' || game.S.mem['payday.at'] !== undefined) { payday = game.S.day; break }
    const opts = game.choices
    if (game.S.scene) {
      const sid = game.S.scene.id
      const good = String((game.S.scene.vars as { n?: string }).n ?? '')
      const go = sid === 'barter' ? (good.includes('Борис') ? 'take' : 'refuse') : opts[0]?.go
      const c = go ? opts.find((x) => x.go === go) : undefined
      if (c) await game.send(c)
      else if (opts[0]) await game.send(opts[0])
    } else {
      const q = opts.find((c) => c.act === 'arc' && c.arg === 'boris')
      await game.send(q ?? { text: 'Алик, ну как там?', tone: 'neutral' })
    }
    game.S.offlineDays = 0
  }
  return { barter, payday }
}

describe('замер сидов (#918)', () => {
  it('bazaar 1..24', async () => {
    const ok: number[] = []
    for (let seed = 1; seed <= 24; seed++) {
      const { game } = makeGame({ seed })
      const r = await playToPayday(game)
      process.stdout.write(`bazaar seed ${seed}: payday=${r.payday} barter=${r.barter}\n`)
      if (r.payday !== null && r.barter > 0) ok.push(seed)
    }
    process.stdout.write(`BAZAAR QUALIFY: ${ok.join(', ')}\n`)
  }, 600_000)

  it('sim Turn_Wrong 11..30', async () => {
    for (const seed of Array.from({ length: 20 }, (_, i) => 11 + i)) {
      const { game } = makeGame({ seed })
      const fired = new Set<string>()
      const orig = game.rules.fire.bind(game.rules)
      game.rules.fire = async (...a: Parameters<typeof orig>) => { const r = await orig(...a); if (r) fired.add(r.name); return r }
      for (let i = 0; i < 250; i++) await botTurn(game)
      process.stdout.write(`sim seed ${seed}: Turn_Wrong=${fired.has('Turn_Wrong')} total=${fired.size}\n`)
    }
  }, 600_000)
})
