// Окно отклика на перевод 50 ₽ (#1003): каждый перевод штампует факт-ход, кнопка реакции живёт ≤2 хода
// и не зависит от ctx (заметка 10 живой рецензии №3); ответ Алика потребляет окно (#951).
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { D, TRANSFER_FRESH_TURNS } from './excuses'
import { creditOffer, moneyAt, paydayScene, transferAt } from './memkeys'
import { ARCS } from './arcs'

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

// Новейшее денежное событие выигрывает (#1376): «50 рублей?!» ссылается на сумму, которую чат уже
// перекрыл своим денежным ходом. Окно по счётчику ходов при этом остаётся прежним — гасит его только
// эпизод со своей суммой, а не любой ход.
describe('новейшее денежное событие гасит окно перевода (#1376)', () => {
  const transferTurn = (game: Game) => Number(game.S.mem[transferAt])

  it('аванс пирожками после перевода: реакции на перевод нет; без эпизода — есть', async () => {
    const { game } = makeGame()
    await game.transfer()
    const at = transferTurn(game)
    expect(findReply(game), 'на ходу перевода кнопки нет').toBeDefined()
    // ход между переводом и эпизодом: окно ещё открыто — эпизод не «второй ход окна», а другой денежный ход
    game.S.stats.sent = at + 1
    expect(findReply(game), 'через ход после перевода окно закрыто — проверка пустеет').toBeDefined()
    await game.enterNode('q_mama', 'drive')
    expect(game.S.mem[moneyAt], 'аванс пирожками не штампанул денежный ход').toBe(at + 1)
    expect(findReply(game), 'реакция на перевод поверх аванса пирожками').toBeUndefined()

    // тот же ход без промежуточного денежного эпизода: кнопка на месте — гасит эпизод, а не время
    const { game: clean } = makeGame()
    await clean.transfer()
    clean.S.stats.sent = transferTurn(clean) + 1
    expect(findReply(clean), 'без денежного эпизода окно перевода пропало').toBeDefined()
  })

  // Каждый денежный эпизод пишет ход сам: допработа, вычет хаша, застолье, чайник, вычет серии,
  // продажа вещи, счёт сцены. Штамп ставит сдвиг денег, а не текст: запечатанный долг его не ставит.
  it('денежные эпизоды штампуют ход: допработа, хаш, застолье, чайник, серия, продажа, сцена', async () => {
    const cases: Array<[string, (game: Game) => Promise<void> | void]> = [
      ['допработа', async (game) => {
        game.alikMsg({ kind: 'job', from: 'alik', text: 'Сделаешь забор?' })
        const job = game.S.msgs.find((m) => m.kind === 'job')!
        expect(job, 'оффера допработы нет — проверка пустеет').toBeDefined()
        await game.answerJob(job.id, true)
      }],
      ['вычет хаша', (game) => game.enterNode('q_hash', 'eat')],
      ['застолье', (game) => game.enterNode('q_tamada', 'yes')],
      ['чайник в счёт долга', (game) => game.enterNode('q_lottery', 'draw')],
      ['вычет серии «я твой адвокат»', (game) => game.playEpisode(ARCS.tile.eps[3], 'tile')],
      ['счёт сцены (кофе и хачапури)', (game) => game.enterNode('meet', 'cafe3')],
      ['продажа вещи', (game) => { game.S.mem[creditOffer] = true; game.sellThing() }],
    ]
    for (const [what, play] of cases) {
      const { game } = makeGame()
      const debt = game.S.debt
      const money = game.S.money
      await play(game)
      expect(game.S.debt !== debt || game.S.money !== money, `${what}: деньги не двигались — проверка пустеет`).toBe(true)
      expect(game.S.mem[moneyAt], `${what}: денежный ход не штампанул`).toBe(game.S.stats.sent)
    }

    // штамп ставит сам сдвиг: запечатанный долг узел не двигает — и денежного хода нет
    const { game: sealed } = makeGame()
    sealed.S.mem[paydayScene] = true
    await sealed.enterNode('meet', 'cafe3')
    expect(sealed.S.mem[moneyAt], 'запечатанный долг штампанул денежный ход').toBeUndefined()
  })
})
