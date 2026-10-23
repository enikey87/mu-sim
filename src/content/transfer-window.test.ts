// Окно отклика на перевод 50 ₽ (#1003): каждый перевод штампует факт-ход, кнопка реакции живёт ≤2 хода
// и не зависит от ctx (заметка 10 живой рецензии №3); ответ Алика потребляет окно (#951).
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { D, TRANSFER_FRESH_TURNS } from './excuses'

const findReply = (game: Game) => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'transferQ') }

describe('окно отклика на перевод (#1003)', () => {
  it('перевод даёт кнопку реакции, даже когда ctx перебит соседним сообщением; ответ закрывает окно', async () => {
    const { game } = makeGame()
    await game.transfer()
    expect(findReply(game), 'на ходу перевода кнопки нет').toBeDefined()
    await game.say(['Джан, и ещё: журнал напоминает про обещание.']) // ctx уехал на другое сообщение — как в заметке 10
    const btn = findReply(game)
    expect(btn, 'после соседнего сообщения кнопка реакции пропала').toBeDefined()
    expect(btn!.text, 'кнопка не из пула реакций на перевод').toMatch(/Спасибо за 50 ₽|Алик, это шутка\?|50 рублей\?!|Спасибо\. Осталось ещё немножко/)
    const from = game.S.msgs.length
    await game.send(btn!)
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said.length, 'Алик не ответил на реакцию').toBeGreaterThan(0)
    expect(findReply(game), 'после ответа окно не закрылось').toBeUndefined()
    // следующий перевод открывает окно заново
    await game.transfer()
    expect(findReply(game), 'новый перевод окно не открыл').toBeDefined()
  })

  it('окно ≤2 ходов: на втором ходу кнопка есть, дальше — нет', async () => {
    const { game } = makeGame()
    await game.transfer()
    game.S.stats.sent += TRANSFER_FRESH_TURNS
    expect(findReply(game), 'в окне кнопки нет').toBeDefined()
    game.S.stats.sent += 1
    expect(findReply(game), 'за окном кнопка осталась').toBeUndefined()
  })

  it('пул окна перевода держит одну строку в ходу, не повторяет её в окне и подставляет сумму (#1287)', async () => {
    // D-пул шёл через `fromD`: сырой draw в режиме лейбла перерисовывался на каждой пересборке хода
    // (кнопка менялась под пальцем, #826) и после исчерпания колоды возвращал ту же формулировку.
    // `windowFromD` выбирает строку в окне и подставляет `{ amount }` уже в неё
    const { game } = makeGame()
    await game.transfer()
    const at = Number(game.S.mem['transfer.at'])
    expect(Number.isFinite(at), 'перевод не штампанул ход — проверка пустеет').toBe(true)
    const turnTexts = new Set<string>()
    for (let i = 0; i < 10; i++) { const b = findReply(game); if (b) turnTexts.add(b.text) }
    expect([...turnTexts].length, `пересборка хода меняет кнопку: ${[...turnTexts].join(' → ')}`).toBe(1)
    const offered: string[] = []
    for (let turn = 0; turn <= TRANSFER_FRESH_TURNS; turn++) {
      game.S.stats.sent = at + turn
      const b = findReply(game)
      if (b) offered.push(b.text)
    }
    expect(offered.length, 'окно перевода ничего не предложило — проверка пустеет').toBe(TRANSFER_FRESH_TURNS + 1)
    expect(offered, `повтор строки пула внутри окна: ${offered.join(' → ')}`).toEqual([...new Set(offered)])
    expect(offered.some((t) => t.includes('50')), 'сумма не подставлена в выбранную строку').toBe(true)
  })

  it('новый перевод не возвращает ту же реакцию внутри окна повтора (#1299)', async () => {
    // Пул один на все переводы, а окно события (2 хода) своё у каждого: строка возвращалась дословно
    // через 12–17 ходов (партия 328117: «Спасибо за 50 ₽… А остальные?» 44→56; 322117: 78→95).
    // Долгоживущее окно повтора (#824): показанная строка молчит 20 ходов, исчерпанный в окне пул —
    // до конца окна (#1078), как у «Мууу» (#1291). Переводы идут раз в 7 ходов — прежнее окно их не держит.
    const { game } = makeGame()
    const shown: { t: string; at: number }[] = []
    for (let i = 1; i <= 12; i++) {
      const turn = i * 7
      game.S.stats.sent = turn
      await game.transfer()
      const b = findReply(game)
      if (b) shown.push({ t: b.text, at: turn })
    }
    expect(shown.length, 'кнопка реакции ни разу не показана — проверка пустеет').toBeGreaterThan(D.P_TRANSFER.length)
    const last = new Map<string, number>()
    const bad: string[] = []
    for (const s of shown) {
      const prev = last.get(s.t)
      if (prev !== undefined && s.at - prev < 20) bad.push(`«${s.t}» ходы ${prev}→${s.at}`)
      last.set(s.t, s.at)
    }
    expect(bad.slice(0, 3), 'повтор строки пула внутри окна повтора').toEqual([])
    // и окно отпускает: за 12 переводов пул вернулся — иначе проверка выше доказывала бы только молчание
    expect(shown.length, 'за окном пул не вернулся — проверка пустеет').toBeGreaterThan(new Set(shown.map((s) => s.t)).size)
  })

  it('перевод в пачке «пока тебя не было» тоже штампует окно', async () => {
    const { game } = makeGame()
    await game.awayMsg('transfer')
    expect(findReply(game), 'перевод из пачки без окна').toBeDefined()
    game.S.stats.sent += TRANSFER_FRESH_TURNS + 1
    expect(findReply(game), 'за окном кнопка осталась').toBeUndefined()
  })
})
