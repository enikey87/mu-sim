import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { ARCS } from './arcs'
import { FINALES } from './finales'
import { valueOf } from './fact'
import { grantPaid, houseOnGarik, intro, taxFrozen } from './memkeys'

const lineText = (m: unknown) => (typeof m === 'string' ? m : (m as { t: string }).t)

async function followBefore(id: string, question: string, answers: RegExp, keep: string, mid?: { when: RegExp; has: string }) {
  const { game } = makeGame()
  const pool = () => game.open(ARCS[id].follow)
  const at = () => game.S.arcs[id]?.i ?? 0
  const nextText = () => (ARCS[id].eps[at()]?.m ?? []).map((e) => lineText(valueOf(e))).join('\n')
  let atAnswer = false
  while (at() < ARCS[id].eps.length) {
    const next = nextText()
    const lines = pool()
    const hit = answers.test(next)
    if (!hit) expect(lines, `${id} до «${next.slice(0, 42)}»`).not.toContain(question)
    else expect(lines, id).toContain(question)
    expect(lines, id).toContain(keep)
    if (mid && (hit || mid.when.test(next))) expect(lines, id).toContain(mid.has)
    if (hit) { atAnswer = true; break }
    game.S.day += 5
    await game.playArc(id)
  }
  expect(atAnswer, id).toBe(true)
}

describe('гейты реплик серии до её remember (#450)', () => {
  it('новый акт сообщает об оплате Гранта и заморозке счетов до записи этих фактов', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.grant.eps[0], 'grant')
    expect(game.S.mem[grantPaid]).toBeUndefined()
    expect(game.S.mem[taxFrozen]).toBeUndefined()

    const from = game.S.msgs.length
    await game.playEpisode(ARCS.rubik.eps[7], 'rubik')
    const lines = alikTexts(game.S.msgs.slice(from))
    expect(lines.some((line) => line.includes('Объект сдан, Грант заплатил!'))).toBe(true)
    expect(lines.some((line) => line.includes('Счета заморожены. Деньги есть'))).toBe(true)
    expect(lines.some((line) => line.includes('Теперь и бумага'))).toBe(false)
    expect(game.S.mem[grantPaid]).toBe(true)
    expect(game.S.mem[taxFrozen]).toBe(true)
  })

  it('финал Гарика описывает дом, если тот стоял на нём до освобождения', async () => {
    const { game } = makeGame()
    game.S.mem[houseOnGarik] = true
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.garik.eps[5], 'garik')
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом просел на два сантиметра'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('финал Гарика без дома не выдумывает просадку', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.garik.eps[5], 'garik')
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом просел'))).toBe(false)
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Гарика достали!'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('частный финал Гарика помнит дом до освобождения', async () => {
    const { game } = makeGame()
    game.S.mem[houseOnGarik] = true
    const from = game.S.msgs.length
    await game.playFinale('garik', FINALES.garik.find((f) => f.id === 'cutter')!)
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом, говорят, просядет'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('финал Карине вводит Гранта и не теряет её первую реплику', async () => {
    const { game } = makeGame()
    expect(game.S.mem[intro('grant')]).toBeUndefined()
    const from = game.S.msgs.length
    await game.playFinale('rubik', FINALES.rubik.find((f) => f.id === 'karine')!)
    expect(game.S.msgs.slice(from).some((m) => m.kind === 'text' && m.who === 'karine' && m.text.startsWith('Это Карине.'))).toBe(true)
    expect(game.S.mem[intro('grant')]).toBe(true)
  })
})

describe('вопрос «уже случилось?» только перед серией, которая отвечает (#589)', () => {
  it('до развязки кнопки нет; когда следующая серия — она, кнопка есть', async () => {
    await followBefore('garik', 'Гарика достали?', /Гарика достали!/, 'Как там Гарик?', { when: /трубочку/, has: 'Гарик ещё в фундаменте?' })
    await followBefore('rubik', 'Рубик уехал?', /Не уедет/, 'Как там инспектор?')
    await followBefore('rubik', 'Акт подписали?', /подписал акт/, 'Как там инспектор?')
    await followBefore('grant', 'Грант заплатил?', /заплатил|оплачено/, 'Что заказчик?')
    await followBefore('razmik', 'Размик слез?', /Размик слез!/, 'Как там Размик?', { when: /лаваш/, has: 'Размик ещё на кране?' })
    await followBefore('niva', '«Нива» нашлась?', /«Нива» вернулась!/, 'Есть новости про «Ниву»?', { when: /Гюмри/, has: 'Где «Нива»?' })
  })
})
