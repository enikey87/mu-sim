import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import { ARCS } from './arcs'
import { D, type When } from './excuses'
import { LEGENDS } from './legends'
import { QUESTS } from './quests'
import { turnRules } from './rules/turn'
import { dateOf } from '../engine/time'
import { isOpen, test, valueOf, type Entry, type LineSpec } from '../engine/rules'
import { playtest, transcript } from '../tools/playtest'

describe('регрессии первоначального аудита', () => {
  it('активная легенда не допускает независимую денежную отмазку', async () => {
    const { game } = makeGame()
    game.setLegend('grant', 'grant')
    const before = game.S.msgs.length
    await game.excuseTurn()
    const text = game.S.msgs.slice(before).flatMap((m) => m.kind === 'text' ? [m.text] : []).join(' ')
    expect(text).toContain(LEGENDS.grant.until)
  })

  it('непрочитанные отмазки тоже остаются внутри активной легенды', () => {
    let promiseSeen = false
    for (let seed = 1; seed <= 80; seed++) {
      const { game } = makeGame({ seed })
      game.setLegend('grant', 'grant')
      const promises = game.S.promises.length
      game.awayBurst(1, 0)
      if (game.S.promises.length === promises) continue
      const message = game.S.msgs.at(-1)
      expect(message).toMatchObject({ kind: 'text', text: expect.stringContaining(LEGENDS.grant.until) })
      promiseSeen = true
    }
    expect(promiseSeen).toBe(true)
  })

  it('следующий перевод исполняет обещанные 51 ₽', async () => {
    let checked = false
    for (let seed = 1; seed <= 50 && !checked; seed++) {
      const { game } = makeGame({ seed })
      await game.fire('PlayerSays', { intent: 'transferQ' })
      if (game.S.mem.nextTransfer !== 51) continue
      const debt = game.S.debt
      await game.transfer()
      expect(game.S.debt).toBe(debt - 51)
      expect(game.S.msgs.findLast((m) => m.kind === 'transfer')).toMatchObject({ kind: 'transfer', amount: 51 })
      expect(game.S.mem.nextTransfer).toBeUndefined()
      checked = true
    }
    expect(checked).toBe(true)
  })

  it('среда утром, обещанная в среду, означает следующую среду', () => {
    const { game } = makeGame()
    while (dateOf(game.S.day).getDay() !== 3) game.S.day++
    const when = (D.WHEN as Entry<When>[]).map(valueOf).find((entry) => entry.t === 'в среду утром')!
    game.recordPromise({ text: when.t, ...when })
    expect(game.S.promises.at(-1)?.due).toBe(game.S.day + 7)
  })

  it('Нуне называется по имени в линии Бориса только после начала её арки', () => {
    const open = (line: Entry<string | LineSpec>, facts: Record<string, string | number | boolean>) => {
      const spec = valueOf(line)
      return typeof spec === 'string' || (spec.when ?? []).every((criterion) => test(criterion, facts))
    }
    const before = LEGENDS.boris_smeta.lines.filter((line) => open(line, {})).map(valueOf)
    expect(before.some((line) => typeof line !== 'string' && line.t.includes('бухгалтер'))).toBe(true)
    expect(before.some((line) => typeof line !== 'string' && line.t.includes('Нуне'))).toBe(false)

    const after = LEGENDS.boris_smeta.lines.filter((line) => open(line, { 'arc.nune': 1 })).map(valueOf)
    expect(after.some((line) => typeof line !== 'string' && line.t.includes('Нуне'))).toBe(true)
  })

  it('воспоминание называет последний полученный предмет', async () => {
    const { game } = makeGame()
    game.S.stats.sent = 20
    game.S.items.push('Угол конверта в бетоне')
    const rule = turnRules.find((candidate) => candidate.name === 'Turn_Memory')!
    await rule.respond!(game.rules.ctx(game, rule, { event: 'AlikTurn' }, game.facts()))
    expect(game.S.msgs.findLast((m) => m.kind === 'text')).toMatchObject({ kind: 'text', text: expect.stringContaining('Угол конверта в бетоне') })
  })

  it('работа тамадой имеет однозначный арифметический итог', () => {
    const node = QUESTS.q_tamada.nodes.yes
    expect(node.fx?.debt).toBe(-1000)
    expect(node.sys).toContain('долг Алика уменьшился на 1 000 ₽')
  })

  it('перевод за плитку доступен только после снятия угла', () => {
    const note = (D.TRANSFER_NOTE as Entry<string>[]).find((entry) => valueOf(entry) === 'за плитку в углу')!
    expect(isOpen(note, {})).toBe(false)
    expect(isOpen(note, { 'tile.cornerRemoved': true })).toBe(true)
  })

  it('выход неправильного ключа исполняет событийное обещание', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 4; i++) {
      if (i) game.S.day++
      await game.playArc('nune')
    }
    const promise = game.S.promises.find((record) => record.condition === 'nune.keyPassed')!
    expect(promise.met).toBeUndefined()

    game.S.day++
    await game.playArc('nune')
    await game.afterTurn()
    expect(promise.met).toBe(game.S.day)
    expect(game.legend()).toBe('safe_wrongkey')
  })

  it('текстовая выгрузка сохраняет каждое голосовое сообщение', async () => {
    const played = await playtest(4, 100)
    const voices = played.game.S.msgs.filter((message) => message.kind === 'voice').length
    const rendered = transcript(played).split('🎤 голосовое 0:').length - 1
    expect(voices).toBeGreaterThan(0)
    expect(rendered).toBe(voices)
  })

  it('формулировки фиксируют границы долга и обследования фундамента', () => {
    expect(String(ARCS.tile.eps.at(-1)?.m[0])).toContain('Основной долг остался')
    expect(String(ARCS.beton.eps[3].m[0])).toContain('Фундамент не вскрывали')
    expect((valueOf(ARCS.grant.eps[3].m[0]) as { t: string }).t).toContain('Ваш долг — его обязательство')
  })
})
