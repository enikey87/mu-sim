import { describe, it, expect } from 'vitest'
import type { Entry } from './fact-types'
import { makeGame, alikTexts } from '../test/helpers'
import { ARCS } from './arcs'
import { LEGENDS } from './legends'
import { FINALES } from './finales'
import { is, valueOf } from './fact'
import { Gated, type Criterion } from '../engine/rules'
import { ARC_DONE } from './arcs'
import { CHORUS } from './world'
import { borisForeman, garikConcrete, garikCut, grantPaid, houseOnGarik, intro, taxFrozen, wedding } from './memkeys'

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
    await game.playEpisode(ARCS.garik.eps[6], 'garik')
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом просел на два сантиметра'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('финал Гарика без дома не выдумывает просадку', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.garik.eps[6], 'garik')
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

describe('связка Гарик×бетон (#680)', () => {
  const has = (lines: string[], bit: string) => lines.some((line) => line.includes(bit))

  async function throughGarik(beton: boolean) {
    const { game } = makeGame()
    if (beton) await game.playArc('beton')
    const bits: string[] = []
    for (let i = 0; i < 4; i++) {
      game.S.day += 5
      const from = game.S.msgs.length
      await game.playArc('garik')
      bits.push(...alikTexts(game.S.msgs.slice(from)))
    }
    return bits
  }

  it('розетка в серии 2 раньше блога; «тёплый и шуршит» — только если бетон уже был', async () => {
    const withBeton = await throughGarik(true)
    const socket = withBeton.findIndex((line) => line.includes('розетку'))
    const blog = withBeton.findIndex((line) => line.includes('Жизнь в основании'))
    expect(socket).toBeGreaterThanOrEqual(0)
    expect(blog).toBeGreaterThan(socket)
    expect(has(withBeton, 'тёплый и шуршит')).toBe(true)

    const without = await throughGarik(false)
    expect(has(without, 'розетку')).toBe(true)
    expect(has(without, 'Жизнь в основании')).toBe(true)
    expect(has(without, 'тёплый и шуршит')).toBe(false)
    expect(has(without, 'фундамент тёплый')).toBe(true)
  })

  // негативный контроль: та же строка без gate звучит и без бетона — отсутствие держит гейт
  it('снятый гейт возвращает «тёплый и шуршит» в партии без бетона', async () => {
    const { game } = makeGame()
    const bare = 'Гарик говорит, удобно: тёплый и шуршит.'
    expect(game.open([bare])).toEqual([bare])
    expect(game.open(ARCS.garik.eps[2].m).map((m) => (typeof m === 'string' ? m : m.t))).not.toContain(bare)
  })
})

describe('цитата про конверт Гарика — после трубочки и бетона (#881)', () => {
  const LINE = 'Гарик через трубочку передал: конверт в фундаменте. И кто теперь должен?'

  it('до серии с трубочкой вопроса нет; после неё, если бетон уже был, — есть', async () => {
    const { game } = makeGame()
    // Гарик уже в фундаменте, бетон уже сыграл: проверка держит номер серии Гарика, не знакомство
    game.S.mem[garikConcrete] = true
    game.S.mem[intro('garik')] = true
    game.S.arcs.beton = { i: 1, last: 0 }
    const pool = () => game.open(ARCS.garik.follow)
    expect(pool(), 'до серий Гарика').not.toContain(LINE)
    expect(pool()).toContain('Гарик ещё в фундаменте?')
    game.S.day += 5
    await game.playArc('garik')
    expect(game.S.arcs.garik.i, 'серия «застыл»').toBe(1)
    expect(pool(), 'трубочки ещё нет').not.toContain(LINE)
    game.S.day += 5
    await game.playArc('garik')
    expect(game.S.arcs.garik.i, 'трубочка выведена').toBe(2)
    expect(pool(), 'новость про конверт уже может прозвучать').toContain(LINE)
  })

  it('без бетона конверт не цитируется и после трубочки', () => {
    const { game } = makeGame()
    game.S.mem[garikConcrete] = true
    game.S.mem[intro('garik')] = true
    game.S.arcs.garik = { i: 2, last: 0 }
    expect(game.open(ARCS.garik.follow)).not.toContain(LINE)
    expect(game.open(ARCS.garik.follow)).toContain('Гарик ещё в фундаменте?')
  })
})

describe('блог Гарика: аренда за показ и доля экскурсий (#909)', () => {
  const RENT = /Экскурсии Гранта теперь заходят/
  it('серия блога связывает его с экскурсиями: аренда и делёж кассы при живых экскурсиях, без них — только гэг', () => {
    const { game } = makeGame()
    game.S.mem[intro('garik')] = true
    game.S.arcs.garik = { i: 3, last: 0 }
    const texts = () => game.open(ARCS.garik.eps[3].m).map((m) => (typeof m === 'string' ? m : m.t)).join(' ')
    expect(texts(), 'гэг про подписчиков остался').toMatch(/Сорок тысяч подписчиков/)
    expect(texts(), 'без экскурсий экономики нет').not.toMatch(RENT)
    game.S.arcs.beton = { i: 7, last: 0 }
    game.S.mem[intro('grant')] = true
    expect(texts(), 'аренда за показ').toMatch(RENT)
    expect(texts()).toMatch(/касса делится/)
  })
})

describe('хор Гарика: новый голос не спорит с признанием (#909)', () => {
  it('после достания реплики не говорят «в фундаменте», а голос — прячется, торгуется, платит', () => {
    const { game } = makeGame()
    game.S.mem[intro('garik')] = true
    game.S.arcs.garik = { i: ARCS.garik.eps.length, last: 0 } // линия пройдена: Гарика достали
    const texts = game.open(CHORUS.garik).map((l) => (typeof l === 'string' ? l : l.t))
    expect(texts.length, 'проверка пустеет: хор Гарика закрыт').toBeGreaterThan(0)
    const all = texts.join(' ')
    expect(all, 'Гарик снова «в фундаменте»').not.toMatch(/фундамент/i)
    expect(all, 'прячется').toMatch(/не видел/)
    expect(all, 'торгуется').toMatch(/по тарифу/)
    expect(all, 'платит').toMatch(/платил/)
  })
})

describe('хребет Гарика: конверт-мотив и признание «я спрятался» (#907)', () => {
  const textsOf = (game: ReturnType<typeof makeGame>['game'], ep: (typeof ARCS.garik)['eps'][number]): string[] =>
    game.open(ep.m).map((m) => (typeof m === 'string' ? m : m.t))

  it('эп. 1 называет конверт игрока как причину: Алик сам послал Гарика', () => {
    const { game } = makeGame()
    const ep1 = textsOf(game, ARCS.garik.eps[0]).join(' ')
    expect(ep1, 'конверт — причина попадания в бетон').toMatch(/конверт/i)
    expect(ep1, 'Алик послал Гарика, а не «бетон схватился» сам').toMatch(/послал Гарика/)
    expect(ep1, 'официальная версия «застыл» остаётся').toMatch(/застыл/)
  })

  it('мотив конверта пишет факт на доску, а бетон после не признаётся с нуля (#933)', async () => {
    // Гарик раньше бетона: мотив звучит и пишет heard.money_foundation (claims)
    const { game } = makeGame()
    const from = game.S.msgs.length
    await game.playArc('garik')
    const said = alikTexts(game.S.msgs.slice(from)).join(' ')
    expect(said, 'мотив звучит у Гарика').toContain('Я туда твои деньги уронил')
    expect(game.facts()['heard.money_foundation'], 'история конверта записана на доску').toBe(true)
    // бетон после: не «признание с нуля», а деталь к известному
    const from2 = game.S.msgs.length
    await game.playArc('beton')
    const said2 = alikTexts(game.S.msgs.slice(from2)).join(' ')
    expect(said2, 'признания с нуля нет').not.toContain('я нёс тебе деньги')
    expect(said2, 'вместо него деталь').toContain('ведро было прораба Мкртича')
  })

  it('в нормальном порядке (бетон первым) рассказ бетона не меняется (#933)', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length
    await game.playArc('beton')
    const said = alikTexts(game.S.msgs.slice(from)).join(' ')
    expect(said, 'признание с нуля осталось').toContain('я нёс тебе деньги')
    expect(game.facts()['heard.money_foundation'], 'факт записан бетоном').toBe(true)
  })

  it('серия признания существует: Гарик говорит сам, до неё Алик держит версию «застрял»', () => {
    const { game } = makeGame()
    const eps = ARCS.garik.eps
    const confession = eps.findIndex((ep) => textsOf(game, ep).some((t) => /Я не застрял\. Я спрятался/.test(t)))
    expect(confession, 'серия признания есть').toBeGreaterThan(0)
    // говорит сам Гарик, не Алик пересказом
    const own = textsOf(game, eps[confession]).some((t) => t.includes('Я не застрял. Я спрятался.'))
    expect(own, 'реплика признания — голос самого Гарика').toBe(true)
    // до признания — «застыл» как официальная версия; после признания Алик её держит
    expect(textsOf(game, eps[0]).join(' ')).toMatch(/застыл/)
    expect(textsOf(game, eps[confession]).join(' '), 'Алик держит версию после признания').toMatch(/Он путает/)
    // реплика «Алик мне тоже должен» переехала в признание из приветствия
    expect(textsOf(game, eps[4]).join(' '), 'в приветствии «тоже должен» больше нет').not.toMatch(/тоже должен/)
    expect(textsOf(game, eps[confession]).join(' ')).toMatch(/он мне должен/)
    // признание до развязки «достали»
    expect(confession, 'признание — не финал').toBeLessThan(eps.length - 1)
  })

  it('трубочка и розетка — одна серия; общее число серий выросло на одну', () => {
    const { game } = makeGame()
    const eps = ARCS.garik.eps
    const straw = eps.findIndex((ep) => textsOf(game, ep).some((t) => t.includes('трубочку')))
    expect(straw, 'серия с трубочкой есть').toBeGreaterThan(0)
    expect(textsOf(game, eps[straw]).some((t) => t.includes('розетку')), 'розетка — в той же серии').toBe(true)
    expect(eps.length, 'серий семь: было шесть, добавлено признание').toBe(7)
    // Гарик пишет сам только после серии с интернетом (SPEAKS): признание позже блога
    const blog = eps.findIndex((ep) => textsOf(game, ep).some((t) => t.includes('Жизнь в основании')))
    const confession = eps.findIndex((ep) => textsOf(game, ep).some((t) => /Я спрятался/.test(t)))
    expect(confession, 'признание — после интернета').toBeGreaterThan(blog)
  })

  it('в партии признание звучит голосом Гарика после блога', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 6; i++) {
      game.S.day += 5
      const from = game.S.msgs.length
      await game.playArc('garik')
      const slice = game.S.msgs.slice(from)
      const said = slice.find((m) => m.kind === 'text' && m.who === 'garik' && m.text.startsWith('Я не застрял.'))
      if (said) {
        expect(game.S.mem[garikCut], 'к моменту признания интернет уже был').toBe(false)
        return
      }
    }
    expect.fail('признание не прозвучало за арку')
  })
})

describe('повтор вопроса о похоронах — самая давняя строка, не колода (#880)', () => {
  it('через 3 хода после отправки всего пула звучит строка, показанная раньше окна', async () => {
    const { game } = makeGame()
    game.S.day = 250
    await game.playArc('alik_death')
    game.S.day += 5
    await game.playArc('alik_death')
    expect(game.S.arcs.alik_death.i).toBe(2)
    const pool = ARCS.alik_death.follow
    const open = () => game.open(pool)
    game.S.stats.sent = 0
    const early = [game.freshPlayer('F_alik_death', pool), game.freshPlayer('F_alik_death', pool)]
    expect(early.every(Boolean), 'две строки показаны задолго до окна').toBe(true)
    for (const t of early) game.seen.mark(t!)
    game.S.stats.sent = 30
    while (game.freshPlayer('F_alik_death', pool) !== null) { /* остальные — в этом ходе */ }
    for (const t of open()) game.seen.mark(t)
    game.S.stats.sent = 34
    game.S.day += 1
    // одинаковый возраст: берётся та, что раньше в пуле, а не следующая карта колоды
    const old = open().find((t) => early.includes(t))!
    const offered = game.buildChoices().find((c) => c.act === 'arc' && c.arg === 'alik_death')
    expect(offered, 'вопрос смерти не молчит').toBeTruthy()
    expect(offered!.text, 'берётся показ старше 20 ходов, не только что отправленный').toBe(old)
  })
})

describe('вопрос «уже случилось?» только перед серией, которая отвечает (#589)', () => {
  it('до развязки кнопки нет; когда следующая серия — она, кнопка есть', async () => {
    await followBefore('garik', 'Гарика достали из фундамента?', /Гарика достали!/, 'Как там Гарик?', { when: /трубочку/, has: 'Гарик ещё в фундаменте?' })
    await followBefore('rubik', 'Рубик уехал?', /Не уедет/, 'Как там инспектор?')
    await followBefore('rubik', 'Акт подписали?', /подписал акт/, 'Как там инспектор?')
    await followBefore('grant', 'Грант заплатил?', /заплатил|оплачено/, 'Что там заказчик?')
    await followBefore('razmik', 'Размик слез?', /Размик слез!/, 'Как там Размик?', { when: /лаваш/, has: 'Размик ещё на кране?' })
    await followBefore('niva', '«Нива» нашлась?', /«Нива» вернулась!/, 'Есть новости про «Ниву»?', { when: /Гюмри/, has: 'Где «Нива»?' })
    // контрольная строка — без ворот: с #831 требует объявленной свадьбы (первую серию); «снова», не «ещё» — к серии Самвел уже развёлся (#1000)
    await followBefore('samvel', 'Самвел снова женится?', /Самвел женится снова/, 'Тамада гуляет, а я жду. Так нечестно.')
  })
})

describe('follow Бориса и остальных арок: строка с фактом серии — под гейтом (#926)', () => {
  it('серия болезни не играла — «смету съел» нет; сыграла — кнопка перед ней', async () => {
    await followBefore('boris', 'Что нового у Бориса? Смету он съел, а долг всё висит.', /Съел смету/, 'Как там Борис? Шерсть-то ладно, а деньги когда?')
  })
  it('«профессия» — факт реплики про прораба, не номер шага арки (#1253)', async () => {
    const { game } = makeGame()
    const LINE = 'Алик, как Борис-то? Профессия у него серьёзная, а денег у меня всё нет.'
    const keep = 'Как там Борис? Шерсть-то ладно, а деньги когда?'
    const pool = () => game.open(ARCS.boris.follow)
    // серия профессии следующая, счётчик арки её уже обогнал (playArc поднимает i до показа строк)
    game.S.arcs.boris = { i: 7, last: 0 }
    expect(game.S.mem[borisForeman], 'факт профессии без реплики').toBeUndefined()
    expect(pool(), 'строка сослалась на незвучавшую профессию').not.toContain(LINE)
    expect(pool(), 'пул пуст — негатив ничего не доказывает').toContain(keep)

    game.S.day += 5
    await game.playArc('boris')
    expect(game.S.mem[borisForeman], 'реплика про прораба не поставила факт').toBe(true)
    expect(pool(), 'после реплики строки нет').toContain(LINE)
    expect(pool(), 'соседняя строка пропала').toContain(keep)
  })
  it('«Борис женился?» — вопрос перед серией-приглашением, без утверждения подарка (#974)', () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 5, last: 0 }
    const pool = game.open(ARCS.boris.follow)
    const line = pool.find((t) => /Борис женился\?/.test(t))
    expect(line, 'строки-вопроса нет — проверка пустеет').toBeTruthy()
    expect(line, 'подарок как состоявшееся дарение').not.toMatch(/конверт|куда ушёл/i)
    // ёмкость держат безгейтные соседи (порог «Бригадира», #753/#926)
    expect(pool).toContain('Как там баран? Хоть шерсти с него клок будет или опять только вздохи в сторону Арарата?')
    expect(pool).toContain('Передайте привет Борису. И спросите, кто за шерсть платить будет.')
  })
  it('«с того света» — факт серии «пишу с того света»: раньше её кнопки нет', async () => {
    await followBefore('alik_death', 'Как вы там, Алик? С того света переводов не шлют?', /Пишу с того света/, 'Алик, вы живы? Живой — значит должник. Мёртвый — нет.')
  })
  it('«Размик слез, а долг растёт» — после финала арки, не раньше', async () => {
    // кнопка после финала: до слеза строка отсутствует, слез — появляется (и после развязки остаётся)
    const { game } = makeGame()
    const pool = () => game.open(ARCS.razmik.follow)
    const LINE = 'Размик слез, а долг растёт. Я всё ещё первый в очереди?'
    game.S.arcs.razmik = { i: 0, last: 0 }
    expect(pool(), 'до арки строки нет').not.toContain(LINE)
    game.S.day += 5
    await game.playArc('razmik')
    game.S.arcs.razmik = { i: 8, last: 0 }
    expect(pool(), 'финал сыгран — строка есть').toContain(LINE)
  })
})

describe('«Нива» звонит только после первого «Би-бип» (#1112)', () => {
  const CALLS = '«Нива» мне всё звонит, а платить всё равно Алику.'
  const GONE = '«Нива» уехала, а долг остался у тебя.'

  it('до «Би-бип» строки про звонки нет, есть формулировка без звонков; после — наоборот', async () => {
    const { game } = makeGame()
    const pool = () => game.open(ARCS.niva.follow)
    await game.playArc('niva') // серия 1: «Нива» у Алика, уехать ещё не успела
    expect(pool(), '«Нива» ещё не в бегах — говорить не о чем').not.toContain(GONE)
    await game.playArc('niva') // серия 2: уехала — nivaAway
    expect(game.S.mem['niva.away'], '«Нива» не уехала — проверка пустеет').toBe(true)
    expect(pool(), 'звонков ещё не было').toContain(GONE)
    expect(pool(), 'звонков ещё не было').not.toContain(CALLS)
    for (let i = 0; i < 3; i++) await game.playArc('niva') // серии 3–5: Гюмри, Грузия, «Би-бип.»
    expect(game.S.mem['wrote.niva'], '«Нива» не написала — проверка пустеет').toBe(true)
    expect(pool()).toContain(CALLS)
    expect(pool(), 'после звонка заменять нечем').not.toContain(GONE)
  })

  // негативный контроль: та же строка без гейта первого сообщения видна и до «Би-бип» — значит, прячет её именно гейт
  it('снятый гейт первого сообщения возвращает строку про звонки до «Би-бип»', async () => {
    const { game } = makeGame()
    await game.playArc('niva')
    await game.playArc('niva')
    const bare = [...ARCS.niva.follow.filter((e) => valueOf(e) !== CALLS), CALLS] as Entry<string>[]
    expect(game.open(bare), 'без гейта строка есть').toContain(CALLS)
  })
})

describe('вопрос про развязку Самвела — только перед серией, которая отвечает (#604)', () => {
  const at = () => [0, 1, 2, 3, 4, 5, 6, 7]

  it('до серии «Самвел женится снова» кнопки нет; перед ней — есть', async () => {
    const { game } = makeGame()
    for (const i of at()) {
      const lines = game.open(ARCS.samvel.follow)
      expect(lines, `серия ${i}`).toContain('Тамада гуляет, а я жду. Так нечестно.')
      if (i === 7) expect(lines, 'перед развязкой').toContain('Самвел снова женится?')
      else expect(lines, `до развязки, серия ${i}`).not.toContain('Самвел снова женится?')
      game.S.day += 5
      await game.playArc('samvel')
    }
    // после развязки вопроса тоже нет — он отвечен
    expect(game.open(ARCS.samvel.follow)).not.toContain('Самвел снова женится?')
  })

  // негативный контроль: та же строка без gate открыта на любой серии — значит, кнопку убирает именно гейт
  it('снятие номера серии возвращает кнопку: строка без gate видна и до развязки', async () => {
    const { game } = makeGame()
    const bare = [...ARCS.samvel.follow.slice(0, 3), 'Самвел снова женится?'] as Entry<string>[]
    for (let i = 0; i < 5; i++) {
      expect(game.open(bare), `серия ${i}`).toContain('Самвел снова женится?')
      game.S.day += 5
      await game.playArc('samvel')
    }
  })
})

describe('плитка с5 — реестр памятников без гейта на Гранта (#682)', () => {
  it('серия видна и без Гранта в истории, Грант в тексте не упоминается', async () => {
    const { game } = makeGame()
    expect(game.S.mem[intro('grant')], 'Гранта ещё нет в истории').toBeUndefined()
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.tile.eps[4], 'tile')
    const lines = alikTexts(game.S.msgs.slice(from))
    expect(lines.some((l) => l.includes('Твою плитку внесли в реестр памятников')), 'серия прозвучала').toBe(true)
    expect(lines.some((l) => l.includes('Грант')), 'о Гранте не говорится').toBe(false)
  })
})

describe('панч серии по факту другой арки (#681)', () => {
  const insert = 'Ту самую — что тряпочку с арматурины унесла.'

  it('вставка про козу тёти Гоар звучит, когда в сериале про деньги в фундаменте была вторая серия', async () => {
    const { game } = makeGame()
    game.S.arcs.beton = { i: 2, last: 0 } // две серии фундамента позади — факт, не номер хода
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.boris.eps[4], 'boris')
    expect(alikTexts(game.S.msgs.slice(from))).toContain(insert)
  })

  it('в партии без второй серии фундамента вставки нет', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.boris.eps[4], 'boris')
    expect(alikTexts(game.S.msgs.slice(from))).not.toContain(insert)
  })

  // негативный контроль: тот же факт открыт на любой серии Бориса — значит, вставку держит именно гейт
  it('без гейта вставка звучала бы и без серий фундамента', async () => {
    const { game } = makeGame()
    const bare = [...ARCS.boris.eps[4].m, insert] as Entry<string>[]
    const from = game.S.msgs.length
    await game.playEpisode({ ...ARCS.boris.eps[4], m: bare }, 'boris')
    expect(alikTexts(game.S.msgs.slice(from))).toContain(insert)
  })
})

describe('Рубик-налоговик: вопрос после развязки (#914)', () => {
  it('до развязки вопроса нет, после — есть', () => {
    const { game } = makeGame()
    const q = 'Рубик из налоговой — значит, деньги в безопасности? Пусть лежат.'
    expect(game.open(ARCS.rubik.follow), 'до развязки вопрос телеграфировал бы открытие').not.toContain(q)
    game.S.mem['tax.frozen'] = true
    expect(game.open(ARCS.rubik.follow), 'после развязки вопрос уместен').toContain(q)
  })
})

describe('владение Борисом: линия признаёт владельца (#856)', () => {
  it('после передачи барана ответ «как Борис-то?» говорит, что он у игрока', () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: ARCS.boris.eps.length, last: 0 }
    const done = () => game.open(ARC_DONE.boris).map(lineText)
    expect(done().some((t) => /у тебя живёт/.test(t)), 'без передачи — строка молчит').toBe(false)
    game.S.items.push('баран Борис') // has.boris — так его ставит барахолка
    expect(done().some((t) => /у тебя живёт/.test(t)), 'после передачи — признаёт владельца').toBe(true)
  })
})

describe('follow-вопросы бетона не называют развязку раньше её серии (#858)', () => {
  const ARSEN = 'Арсен бумаги разобрал: Грант теперь мне должен. А платит всё равно Алик?'
  const GOAR = 'Тётя Гоар по углам гадает. А деньги мои куда уйдут?'

  it('«Арсен бумаги разобрал» — после eps[3], «Гоар гадает» — после eps[5]', async () => {
    const { game } = makeGame()
    // герои введены заранее: вопрос держит номер серии, а не знакомство (иначе проверка была бы пустой)
    for (const who of ['arsen', 'grant', 'goar']) game.S.mem[`intro.${who}`] = true
    const pool = () => game.open(ARCS.beton.follow)
    game.S.arcs.beton = { i: 3, last: -99 }
    expect(pool(), 'перед развязкой (идёт eps[3])').not.toContain(ARSEN)
    expect(pool(), 'до гадания').not.toContain(GOAR)
    game.S.day += 5
    await game.playArc('beton') // eps[3]: «мой племянник Арсен изучил вопрос по бумагам… теперь тебе должен Грант»
    expect(pool(), 'развязка вышла — вопрос уместен').toContain(ARSEN)
    expect(pool(), 'Гоар ещё не гадала').not.toContain(GOAR)
    game.S.day += 5
    await game.playArc('beton') // eps[4]
    game.S.day += 5
    await game.playArc('beton') // eps[5]: «Тётя Гоар погадала на кофейной гуще…»
    expect(pool(), 'гадание вышло — вопрос уместен').toContain(GOAR)
  })

  // негативный контроль: та же строка без gate открыта и до развязки — значит, вопрос убирает именно номер серии
  it('снятие номера серии возвращает вопрос: строка без gate видна до развязки', () => {
    const { game } = makeGame()
    for (const who of ['arsen', 'grant']) game.S.mem[`intro.${who}`] = true
    game.S.arcs.beton = { i: 3, last: -99 }
    const bare = [...ARCS.beton.follow.slice(0, 3), ARSEN] as Entry<string>[]
    expect(game.open(bare)).toContain(ARSEN)
  })
})

describe('follow «Тогда и долги его живы?» — под гейтом 4-й серии grandpa (#1082)', () => {
  const LINE = 'Дедушка Грачик жив? Тогда и долги его живы?'

  it('до 4-й серии строки нет в пуле следования, после — есть', async () => {
    const { game } = makeGame()
    const pool = () => game.open(ARCS.grandpa.follow)
    game.S.arcs.grandpa = { i: 3, last: -99 }
    expect(pool(), 'долги дедушки вводит 4-я серия — до неё «долги его» не названы').not.toContain(LINE)
    game.S.day += 5
    await game.playArc('grandpa') // 4-я серия: «Мне — долги. Тебе — благословение»
    expect(pool(), 'завещание прозвучало — вопрос уместен').toContain(LINE)
  })

  // негативный контроль: та же строка без gate видна до 4-й серии — значит, вопрос скрывает именно номер серии (модель #858)
  it('снятие гейта возвращает вопрос: строка без gate видна до серии', () => {
    const { game } = makeGame()
    game.S.arcs.grandpa = { i: 3, last: -99 }
    const bare = [...ARCS.grandpa.follow.slice(0, 1), LINE] as Entry<string>[]
    expect(game.open(bare)).toContain(LINE)
  })
})

describe('follow-строки оперируют только введёнными фактами (#813)', () => {
  /** Числа строки без разделителей: «8 000» → 8000. */
  const numbers = (t: string): string[] => (t.match(/\d[\d\s\u00A0]*\d|\d/g) ?? []).map((n) => n.replace(/[\s\u00A0]/g, ''))
  /** Сказанные строки значения — как `saidLines` из #783: реплики, sys, предмет, done. */
  const said = (v: unknown, out: string[] = []): string[] => {
    if (typeof v === 'string') { out.push(v); return out }
    if (Array.isArray(v)) { for (const x of v) said(x, out); return out }
    if (v && typeof v === 'object') {
      const line = valueOf(v as Entry<string>)
      if (typeof line === 'string') out.push(line)
      else if (line !== v) said(line, out)
      else if (typeof (v as { t?: unknown }).t === 'string') out.push((v as { t: string }).t)
      for (const k of ['m', 'sys', 'item', 'done'] as const) { const x = (v as Record<string, unknown>)[k]; if (x !== undefined) said(x, out) }
    }
    return out
  }
  const flat = (cs: readonly Criterion[]): Criterion[] => cs.flatMap((c) => (c.op === 'all' ? flat(c.all ?? []) : [c]))
  /** Числа, известные игроку вне сериала: 50 ₽ — обычный перевод Алика (`nextTransfer`), он в партии с первого дня. */
  const GAME_WIDE = ['50']
  /** Что партия успела сказать к состоянию ворот строки: серии по воротам; финал — только если ворота его называют. */
  const introduced = (id: string, when: readonly Criterion[]): string[] => {
    const arc = ARCS[id]
    const out: string[] = []
    const cs = flat(when)
    // серии этого сериала — всегда: вопрос задают, пока сериал идёт
    for (const ep of arc.eps) out.push(...said(ep))
    // ворота называют другую серию или её номер: добираем её серии
    for (const c of cs) {
      const key = String(c.key)
      if (!key.startsWith('arc.') || c.op === '!exist') continue
      const arcId = key.slice(4)
      if (arcId === 'done' || arcId === id) continue
      const n = Number(c.value)
      const eps = (c.op === '==' || c.op === '<=') && Number.isFinite(n) ? (ARCS[arcId]?.eps ?? []).slice(0, n + 1) : ARCS[arcId]?.eps ?? []
      for (const ep of eps) out.push(...said(ep))
    }
    // финал: свои реплики — только под воротами о финале (иначе его в партии ещё не было)
    for (const c of cs) {
      const key = String(c.key)
      if (!key.startsWith('finale.')) continue
      const arcId = key.slice(7)
      if (arcId !== id) continue
      const wanted = c.op === '==' ? String(c.value) : undefined
      for (const f of FINALES[id] ?? []) if (!wanted || f.id === wanted) out.push(...said(f), ...said(ARC_DONE[id] ?? []))
    }
    return out
  }
  it('слова-отсылки на легенды звучат только когда легенда играла (#821)', () => {
    // слово → чем партия его вводит: услышанное игроком утверждение о деньгах (шаг #813 — числа, шаг #821 — слова)
    const LEGEND_WORDS: Array<[string, RegExp, string[]]> = [
      ['фундамент', /фундамент/i, ['heard.money_foundation']],
      ['сейф', /сейф/i, ['heard.money_safe']],
      ['крипта', /крипт|коин/i, ['heard.money_crypto', 'ach.q_crypto', 'crypto.hodl']],
    ]
    const bad: string[] = []
    let checked = 0
    for (const [id, a] of Object.entries(ARCS)) {
      for (const e of a.follow) {
        const t = valueOf(e)
        const when = e instanceof Gated ? flat(e.when) : []
        for (const [word, re, markers] of LEGEND_WORDS) {
          if (!re.test(t)) continue
          checked++
          const named = markers.some((m) => when.some((c) => String(c.key) === m))
          const inCorpus = introduced(id, when).join(' ').toLowerCase().includes(word)
          if (!named && !inCorpus) bad.push(`${id}: «${t}» говорит про ${word}, а ворота не знают этой легенды`)
        }
      }
    }
    expect(checked, 'слов-отсылок не стало — проверка пустеет').toBeGreaterThanOrEqual(5)
    expect(bad).toEqual([])
  })
  it('слова-факты follow-строки названы сериями, пройденными к вопросу (#824)', () => {
    // словарь: слово → сериал и число пройденных серий, после которых слово прозвучало (#813 числа, #821 легенды, #824 факты)
    // inArc — слово принадлежит этому сериалу: чужой «акт» Нуне или чужое «завещание» Алика проверяются своими воротами
    const FACT_WORDS: Array<{ re: RegExp; arc: string; from: number; inArc?: string; facts?: string[]; why: string }> = [
      { re: /завещани|наследств/i, arc: 'grandpa', from: 4, inArc: 'grandpa', why: 'завещание и раскладку называет 4-я серия grandpa' },
      { re: /долги его|долги дедушк/i, arc: 'grandpa', from: 4, inArc: 'grandpa', why: 'долги дедушки вводит 4-я серия grandpa («Мне — долги»)' },
      { re: /хоспис|шаурмичн/i, arc: 'grandpa', from: 6, inArc: 'grandpa', why: 'хоспис и шаурмичная — последняя серия grandpa' },
      { re: /штраф/i, arc: 'rubik', from: 3, inArc: 'rubik', why: '«штраф» Рубик произносит в 3-й серии' },
      { re: /(?<![а-яё])акт/i, arc: 'rubik', from: 7, inArc: 'rubik', why: 'акт обсуждают в 7-й серии rubik' },
      { re: /замороз|размороз/i, arc: 'rubik', from: 8, inArc: 'rubik', facts: [taxFrozen], why: 'заморозку называют 8-я серия rubik и факт tax.frozen' },
      { re: /к вдове|вдове/i, arc: 'alik_death', from: 5, inArc: 'alik_death', why: 'вдову называет 5-я серия alik_death («Самвел сделал предложение вдове»)' },
      // события (пункты 1–2 #831): не только числа и слова-факты, но и названия событий
      { re: /свадьб/i, arc: 'samvel', from: 1, inArc: 'samvel', why: 'свадьбу Самвела объявляет 1-я серия samvel' },
      { re: /поминк|похорн|похорон/i, arc: 'alik_death', from: 1, inArc: 'alik_death', why: 'свои похороны и поминки Алик вводит 1-й серией alik_death' },
    ]
    const bad: string[] = []
    let checked = 0
    for (const [id, a] of Object.entries(ARCS)) {
      for (const e of a.follow) {
        const t = valueOf(e)
        const when = e instanceof Gated ? flat(e.when) : []
        for (const w of FACT_WORDS) {
          if (w.inArc && w.inArc !== id) continue
          if (!w.re.test(t)) continue
          checked++
          const byArc = when.some((c) => String(c.key) === `arc.${w.arc}` && ['>=', '=='].includes(c.op) && Number(c.value) >= w.from)
          const byFact = (w.facts ?? []).some((k) => when.some((c) => String(c.key) === k))
          if (!byArc && !byFact) bad.push(`${id}: «${t}» — ${w.why}, а ворота этого не требуют`)
        }
      }
    }
    expect(checked, 'слов-фактов не стало — проверка пустеет').toBeGreaterThanOrEqual(5)
    expect(bad).toEqual([])
  })

  it('каждое число follow-строки названо серией или финалом, доступным её воротам', () => {
    const bad: string[] = []
    let checked = 0
    for (const [id, a] of Object.entries(ARCS)) {
      for (const e of a.follow) {
        const t = valueOf(e)
        const nums = numbers(t)
        if (!nums.length) continue
        checked++
        const corpus = introduced(id, e instanceof Gated ? e.when : []).join(' ').replace(/[\s\u00A0]/g, '')
        for (const n of nums) if (!corpus.includes(n) && !GAME_WIDE.includes(n)) bad.push(`${id}: «${t}» называет ${n} — партия к этим воротам её не вводила`)
      }
    }
    expect(checked, 'чисел в follow-строках не стало — проверка пустеет').toBeGreaterThanOrEqual(8)
    expect(bad).toEqual([])
  })
})

describe('вопрос про коллекторов держит только показанное аркой (#1013)', () => {
  const LETTERS = 'Коллекторы пишут, деньги требуют.'
  const open = (game: ReturnType<typeof makeGame>['game']) => game.open(ARCS.collectors.follow)

  it('«звонят» и тёщи-коллекторши нет: арка показывает письма, а тёща в партии не вводится', () => {
    const { game } = makeGame()
    game.S.mem.credit_broke = true
    game.S.arcs.collectors = { i: 2, last: 0 }
    expect(open(game), 'строка про письма пропала — проверка пустеет').toContain(LETTERS)
    expect(ARCS.collectors.follow.map(valueOf).filter((t) => /звон|тёщ/i.test(t)), 'строка утверждает звонок или тёщу без события').toEqual([])
    // источник — серия 2 («тебе коллекторы пишут?»): звонков арка не показывает вовсе
    expect(/пишут/.test(JSON.stringify(ARCS.collectors.eps)), 'арка не показывает писем — строка была бы не про что').toBe(true)
  })

})

describe('колкость про нескончаемую свадьбу Самвела (#1114)', () => {
  const LONGER = 'Самвел, у вас свадьба или пожизненное застолье? Я хотя бы денег жду, а вы чего?'
  const OUTLIVE = 'Эта свадьба переживёт нас обоих, Алик.'
  const SETTLE = 'Алик, эта свадьба кончится или мне в ней прописаться?'
  const follow = (game: ReturnType<typeof makeGame>['game']) => game.open(ARCS.samvel.follow)
  const talk = (game: ReturnType<typeof makeGame>['game']) =>
    game.open(LEGENDS.wedding.talk ?? []).map((p) => p[0])

  it('до линии строк нет; линия идёт — есть, и после снятия восьмидневного флага тоже', async () => {
    const { game } = makeGame()
    expect(follow(game), 'до свадьбы колкости нет').not.toContain(LONGER)
    expect(follow(game), 'до свадьбы колкости нет').not.toContain(OUTLIVE)
    expect(talk(game), 'до свадьбы вопроса нет').not.toContain(SETTLE)
    await game.playArc('samvel')
    expect(game.holds(is(wedding('samvel'))), 'первая серия ставит флаг').toBe(true)
    expect(follow(game), 'линия идёт').toContain(LONGER)
    expect(follow(game), 'линия идёт').toContain(OUTLIVE)
    expect(talk(game), 'линия идёт').toContain(SETTLE)
    game.nextDay(9)
    expect(game.holds(is(wedding('samvel'))), 'флаг восьми дней снят — проверка не пустеет').toBe(false)
    expect(follow(game), 'свадьба в тексте не кончилась').toContain(LONGER)
    expect(follow(game), 'свадьба в тексте не кончилась').toContain(OUTLIVE)
    expect(talk(game), 'свадьба в тексте не кончилась').toContain(SETTLE)
  })
})

describe('конверты Самвела: вопрос открывает реплика легенды, а не календарь (#1016)', () => {
  const ENVELOPES = 'Самвел, конверты у вас. Мой долг — туда же сдать?'
  const EMPTY = 'Конверт молодым пуст? Пусть дядя из моего долга отсыпет.'
  const open = (game: ReturnType<typeof makeGame>['game']) => game.open(ARCS.samvel.follow)

  it('до реплики легенды про конверты обоих вопросов нет, после — есть', async () => {
    const { game } = makeGame()
    game.S.arcs.samvel = { i: 1, last: 0 } // арка идёт с декабря, как в партии 182117
    expect(open(game), 'вопрос про конверты звучит до того, как мир их ввёл').not.toContain(ENVELOPES)
    expect(open(game), 'вопрос про пустой конверт звучит до того, как мир их ввёл').not.toContain(EMPTY)
    // настоящий путь: реплика легенды свадьбы звучит ходом Алика (Turn_Legend)
    game.setLegend('wedding', 'samvel')
    let heard = false
    for (let i = 0; i < 120 && !heard; i++) {
      game.S.stats.sent += 3
      game.setLegend('wedding', 'samvel') // серии других сериалов по дороге ставят свои легенды
      const n = game.S.msgs.length
      if ((await game.fire('AlikTurn'))?.name === 'Turn_Legend')
        heard = game.S.msgs.slice(n).some((m) => m.kind === 'text' && m.text.includes('Гости подарили конверты'))
      game.S.scene = null
    }
    expect(heard, 'реплика легенды не прозвучала — проверка пустеет').toBe(true)
    expect(game.facts()['heard.samvel_envelopes'], 'реплика не опубликовала утверждение про конверты').toBe(true)
    expect(open(game), 'после реплики вопроса про конверты нет').toContain(ENVELOPES)
    expect(open(game), 'после реплики вопроса про пустой конверт нет').toContain(EMPTY)
  })
})

describe('поминки: «50 рублей» введены серией похорон до варианта (#1204)', () => {
  const FEE = /50 рублей/
  const wake = () => ARCS.alik_death.follow.map(valueOf).find((t) => /поминки/.test(t))
  const funeralTexts = () => ARCS.alik_death.eps[1].m.map((m) => {
    const v = valueOf(m)
    return typeof v === 'string' ? v : v.t
  })
  const spoken = (game: ReturnType<typeof makeGame>['game'], from: number) =>
    game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' ? [m.text] : []))

  it('сумма есть в обеих ветках серии похорон, либо вариант без суммы', async () => {
    const line = wake()
    expect(line, 'вариант про поминки пропал — проверка пустеет').toEqual(expect.any(String))
    const texts = funeralTexts()
    expect(texts, 'серия похорон без двух веток — проверка пустеет').toHaveLength(2)

    const { game } = makeGame()
    game.S.arcs.alik_death = { i: 1, last: -99 }
    expect(game.open(ARCS.alik_death.follow), 'до серии похорон варианта нет').not.toContain(line)

    if (FEE.test(line!)) {
      for (const t of texts) expect(t, 'сумма до введения').toMatch(FEE)
    } else {
      expect(line, 'вариант без суммы').not.toMatch(FEE)
    }

    const hear = async (gone: boolean) => {
      const { game: g } = makeGame()
      if (gone) g.S.mem['finale.rubik'] = 'karine'
      g.S.arcs.alik_death = { i: 1, last: -99 }
      const from = g.S.msgs.length
      g.S.day += 5
      await g.playArc('alik_death')
      const lines = spoken(g, from)
      expect(lines.length, 'серия похорон молчит — проверка пустеет').toBeGreaterThan(0)
      if (FEE.test(line!)) {
        expect(lines.join('\n'), 'сумма до введения').toMatch(FEE)
        expect(g.open(ARCS.alik_death.follow), 'после ввода вариант есть').toContain(line)
      } else {
        expect(g.open(ARCS.alik_death.follow), 'вариант без суммы всё равно после похорон').toContain(line)
      }
      return lines.join('\n')
    }
    const home = await hear(false)
    const away = await hear(true)
    expect(home, 'обе ветки серии схлопнулись в одну — проверка одной пустеет').not.toBe(away)
  })
})
