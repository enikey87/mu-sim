// #833: класс #826 на кнопках с намерением (act). Окно #826 уже держит пулы;
// тест #826 эти кнопки не смотрит. Липкая кнопка контекста (один и тот же текст каждый ход,
// пока контекст жив) — не цикл пула. Цикл — текст пропал и вернулся раньше 20 сообщений.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Choice } from '../engine/state'

// talk — один неотвеченный вопрос к живому контексту: он возвращается вместе с контекстом, это не пул.
const chat = (c: Choice): boolean => !c.scene && !c.go && c.act !== 'talk'

describe('окно свежести кнопок с намерением (#833)', () => {
  it('кнопка чата, включая act, не возвращается дословно внутри 20 сообщений', async () => {
    const { game } = makeGame({ seed: 3 })
    const log: { text: string; at: number }[] = []
    for (let i = 0; i < 300; i++) {
      if (game.battery.dead) { await game.battery.charge(); continue }
      if (game.S.mem['endgame.active']) break
      game.S.choices = null
      const cs = game.buildChoices()
      const at = game.S.stats.sent
      for (const c of cs) if (chat(c)) log.push({ text: c.text, at })
      const pick = cs.find((c) => c.act === 'arc') ?? cs[0]
      if (!pick) break
      await game.send(pick)
    }
    expect(log.length, 'пустой журнал кнопок ничего не доказывает').toBeGreaterThan(40)
    const turns = [...new Set(log.map((r) => r.at))].sort((a, b) => a - b)
    const byTurn = new Map<number, Set<string>>()
    for (const row of log) {
      const set = byTurn.get(row.at) ?? new Set()
      set.add(row.text)
      byTurn.set(row.at, set)
    }
    const last = new Map<string, number>()
    const bad: string[] = []
    for (const row of log) {
      const prev = last.get(row.text)
      if (prev !== undefined && row.at - prev < 20 && row.at !== prev) {
        const gap = turns.filter((t) => t > prev && t < row.at).some((t) => !byTurn.get(t)?.has(row.text))
        if (gap) bad.push(`«${row.text.slice(0, 60)}» ходы ${prev}→${row.at}`)
      }
      last.set(row.text, row.at)
    }
    expect(bad.slice(0, 5)).toEqual([])
  }, 120_000)
})
