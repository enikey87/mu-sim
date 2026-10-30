// День выплаты: запуск, сборка из событий партии, дележ до 50 ₽, великая отмазка, поймать противоречие, исходы.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import type { Criterion } from '../engine/rules'
import { spec } from '../engine/rules/lines'
import { ANNOUNCE, CLAIMS, COINS_BRIDGE_CATCHES, DETECTIVE_CHAIN, LEAD, MORNING_CONTRA, OUTCOME, PAYDAY_SCENE, ROLL, SOURCES, type Claim, type Lead } from './payday'
import { ENDINGS } from './finales'
import { LEGENDS } from './legends'
import { CLAIM_LEDGER } from './ledger'
import { ENDGAME_ARCH } from './endgame'
import { actSigned, bathAsked, garikCut, judgeApology, met, nuneDekretOver, taxFrozen, taxThawed } from './memkeys'
import { ARCS } from './arcs'
import { is, spec as lineSpec, valueOf, type Entry } from './fact'

const texts = (g: Game, n = 0) => g.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
/** Утверждение о числе поимок (#1456, #1612): так выглядели захардкоженные строки — «трижды», «пять поимок», «ровно шесть». */
const COUNT_CLAIM = /трижды|(?:два|три|четыре|пять|шесть|семь|восемь|девять|десять|\d+)\s+(?:раз[а]?\s+)?(?:твои\s+)?поим|ровно\s+(?:\d+|два|три|четыре|пять|шесть|семь|восемь|девять|десять)(?!\p{L})/iu
const choose = async (g: Game, go: string) => { g.S.choices = null; const c = g.choices.find((x) => x.go === go); expect(c, go).toBeDefined(); await g.send(c!) }
const rich = (g: Game) => {
  g.S.day = 340
  Object.assign(g.S.mem, { 'finale.nune': 'default', 'finale.niva': 'chose', 'finale.boris': 'brigadir', 'met.samvel': true, 'met.karine': true, 'met.boris': true, 'intro.niva': true, 'niva.player': true })
  Object.assign(g.S.arcs, { nune: { i: 6, last: 0 }, niva: { i: 7, last: 0 }, boris: { i: 10, last: 0 } })
  Object.assign(g.S.ach, { q_goat: 1, court: 1, q_hash: 1 })
}

describe('День выплаты', () => {
  it('запускается сюжетным ходом только в третьем акте: 330+ день и 3 законченных сериала, после двух штрихов подводки (#893)', async () => {
    const { game } = makeGame()
    game.S.day = 340
    // без серии не открываем ничего: сюжетный ход в этой части теста не играется (#893 — scene-floor не мешает)
    game.S.stats.sent = 0
    for (let i = 0; i < 5; i++) expect((await game.fire('StoryBeat'))?.name ?? '').not.toMatch(/^Beat_Payday/)
    rich(game)
    // линии сошлись — третий акт предваряет подводка: два штриха в разные дни, и только потом анонс
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_First')
    expect(game.S.mem['payday.signs']).toBe(1)
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_Second')
    expect(game.S.mem['payday.signs']).toBe(2)
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_Payday')
    expect(game.S.scene?.id).toBe('payday')
    expect(game.S.ach.payday).toBeDefined()
  })
  it('законченная линия коллекторов не приближает День выплаты: считаются сюжетные сериалы (#338)', () => {
    const { game } = makeGame()
    game.S.day = 340
    const done = (id: string) => ({ i: ARCS[id].eps.length, last: 0 })
    Object.assign(game.S.arcs, { nune: done('nune'), boris: done('boris'), collectors: done('collectors') })
    const lead = () => game.rules.collect({ event: 'StoryBeat' }, game.facts()).some((r) => r.name === 'Beat_PaydayLead_First')
    expect(game.facts().arcsDone).toBe(2)
    expect(lead()).toBe(false)
    game.S.arcs.grant = done('grant')
    expect(game.facts().arcsDone).toBe(3)
    expect(lead()).toBe(true) // не пустая проверка: третий сюжетный сериал подводку открывает
  })
  it('полный проход: утро из событий партии → 240 000 → дележ → 50 ₽ → великая отмазка → поймал → мешок мелочи', async () => {
    const { game } = makeGame()
    rich(game)
    await game.enterNode('payday', 'announce')
    const n = game.S.msgs.length
    await choose(game, 'witness')
    const morning = texts(game, n).join('\n')
    expect(morning).toMatch(/Сейф открыли|«Нива» вернулась|Борис-прораб/)
    expect(morning).toMatch(/К выплате: 240\s000 ₽/)
    expect(game.S.scene?.node).toBe('split')
    await choose(game, 'share')
    expect(game.S.mem['payday.sum']).toBe(50)
    expect(game.S.scene?.node).toBe('grand')
    const chain = String(game.S.mem['payday.chain'])
    // звенья — из событий этой партии: сейф Нуне, «Нива», Борис-прораб, коза, суд, хаш
    expect(chain).toMatch(/сейф|«Нив|Борис|коз|суд|хаш/)
    game.S.choices = null
    // утром «Сейф открыли» / «Нива вернулась» — в отмазке это же место: есть что поймать
    expect(game.choices.find((c) => c.go === 'catch')!.text).toMatch(/^Стоп\. (Сегодня|Утром|Борис|«Нива»|Грант)/)
    // chose той же специфичности, что поимка (#760): этот проход проверяет мешок, а не жребий двух заслуг
    delete game.S.mem['finale.niva']
    const debt = game.S.debt
    await choose(game, 'catch')
    expect(game.S.mem.payday).toBe('coins')
    expect(game.S.debt).toBe(0)
    expect(game.S.money).toBeGreaterThanOrEqual(debt)
    expect(game.S.scene).toBeNull()
    await game.fire('CheckEnding')
    expect(game.S.ending).toBe('payday_coins')
  })
  it('утро выплаты — день payday.at: без паузы и после сдвига календаря на анонсе', async () => {
    const { game } = makeGame()
    rich(game)
    await game.enterNode('payday', 'announce')
    const at = Number(game.S.mem['payday.at'])
    expect(at).toBe(game.S.day + 1)
    await choose(game, 'bag')
    expect(game.S.day).toBe(at)

    const { game: g2 } = makeGame()
    rich(g2)
    await g2.enterNode('payday', 'announce')
    const at2 = Number(g2.S.mem['payday.at'])
    g2.nextDay(3) // away/зарядка, сцена висит
    const stuck = g2.S.day
    expect(stuck).toBeGreaterThan(at2)
    await choose(g2, 'bag')
    expect(g2.S.day).toBe(stuck) // не прыгаем ещё на день от уже прошедшего «завтра»
    expect(texts(g2).join(' ')).toMatch(/День выплаты/)
  })
  // #1355: вес мешка — из фактического долга (монета 10 ₽ — сталь с латунным покрытием, 5,63 г), а не константа
  it('вес мешка монет выводится из долга, а не зашит константой (#1355)', async () => {
    const bag = async (debt: number) => {
      const { game } = makeGame()
      game.S.mem['payday.caught'] = true
      // дележ уже случился: «к выплате» — 50 ₽, а мешок закрывает весь долг
      game.S.mem['payday.sum'] = 50
      game.adjustDebt(debt - game.debt)
      expect(game.S.debt).toBe(debt)
      const n = game.S.msgs.length
      expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_coins')
      const line = texts(game, n).find((t) => t.includes('мешок монет'))
      expect(line, 'системная строка мешка').toBeDefined()
      return line!
    }
    // долг партии 380117: 30 990 монет × 5,63 г = 174,5 кг
    expect(await bag(309_900)).toBe('У вашей двери мешок монет по 10 рублей. Долг закрыт. Вес — 174 кг.')
    expect(await bag(240_000), 'минимальный долг Дня выплаты').toContain('Вес — 135 кг')
    // 195 375 ₽ по 5,63 г — ровно 110 кг: та же цифра, но выведенная, а не зашитая
    expect(await bag(195_375)).toContain('Вес — 110 кг')
    for (const line of [await bag(309_900), await bag(100_000)]) expect(line, 'незаполненный плейсхолдер').not.toContain('{')
    expect(await bag(100_000)).toContain('Вес — 56 кг')
  })
  it('без поимки — 50 ₽ «остатка», а на следующий день кнопка: «Повторим через год?»', async () => {
    const { game } = makeGame()
    game.S.day = 340
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    await choose(game, 'refuse')
    expect(game.S.mem['payday.refused']).toBe(true)
    const debt = game.S.debt
    const n = game.S.msgs.length
    await choose(game, 'accept')
    expect(game.S.mem.payday).toBe('default')
    expect(game.S.debt).toBe(debt - 50)
    // исход ставит кнопку на «завтра»; ход заканчивается +1…3 — кнопка в том же send
    expect(texts(game, n).join(' ')).toMatch(/через год/)
    rich(game)
    game.S.day = 500
    expect((await game.fire('StoryBeat'))?.name).not.toBe('Beat_Payday')
    expect(game.S.scene).toBeNull()
  })
  // #1434/#1612: шесть мидгейм-поимок — свой исход Дня выплаты; срезы родни не проходят, «по рублю» отменяется
  it('Следователь: шесть поимок — доли не срезают, долг приходит целиком (#1434, #1612)', async () => {
    const { game } = makeGame()
    rich(game)
    game.S.mem.caughtUnique = 6
    await game.enterNode('payday', 'announce')
    await choose(game, 'witness')
    const debt = game.debt
    const n = game.S.msgs.length
    await choose(game, 'share')
    const out = texts(game, n).join('\n')
    // доли не прошли вовсе: перевод называет весь долг, а не остаток
    expect(out).not.toMatch(/К выплате: 50 ₽/)
    expect(out, 'перевод не назвал весь долг').toContain(`перевёл вам ${debt.toLocaleString('ru-RU')} ₽`)
    expect(out, 'исходная строка комиссии банка').not.toMatch(/комиссия банка за крупный перевод/)
    expect(out).toMatch(/Доли я отменил сам/)
    expect(out, 'родня не отступила').toMatch(/не надо мне ничего/)
    expect(out).toMatch(/Комиссию банк брать не будет/)
    // выплата честная: весь долг переводом, сцена закрыта, экран — свой
    expect(game.S.mem.payday).toBe('detective')
    expect(game.S.debt).toBe(0)
    expect(game.S.money).toBeGreaterThanOrEqual(debt)
    expect(game.S.scene).toBeNull()
    await game.fire('CheckEnding')
    expect(game.S.ending).toBe('payday_detective')
  })
  it('Следователь: «по рублю» отменяется — отказ делиться не удваивает срезы (#1434, #1612)', async () => {
    const { game } = makeGame()
    rich(game)
    game.S.mem.caughtUnique = 6
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    const debt = game.debt
    const n = game.S.msgs.length
    await choose(game, 'refuse')
    const out = texts(game, n).join('\n')
    expect(game.S.mem['payday.refused']).toBe(true)
    expect(out, 'угроза удержания осталась без ответа').toMatch(/по рублю/)
    expect(out, '«по рублю» всё-таки срезало').toContain(`перевёл вам ${debt.toLocaleString('ru-RU')} ₽`)
    expect(out).not.toMatch(/К выплате: 50 ₽/)
    expect(game.S.mem.payday).toBe('detective')
    expect(game.S.debt).toBe(0)
  })
  it('Следователь: «по рублю» звучит один раз — дефолтная «я бессилен» молчит (#1568)', async () => {
    // узел отказа выбирает ровно одну из двух строк: дефолтную или следовательскую
    const a2 = PAYDAY_SCENE.nodes.refuse.a2 as Entry<string>[]
    const probe = (caught: number) => { const { game } = makeGame(); game.S.mem.caughtUnique = caught; return game.open(a2) }
    expect(probe(6)).toEqual([expect.stringMatching(/не прошло/)])
    expect(probe(5)).toEqual([expect.stringMatching(/Я бессилен/)])
    expect(probe(3)).toEqual([expect.stringMatching(/Я бессилен/)])
    expect(probe(0)).toEqual([expect.stringMatching(/Я бессилен/)])
    const play = async (caught: number) => {
      const { game } = makeGame()
      rich(game)
      game.S.mem.caughtUnique = caught
      await game.enterNode('payday', 'announce')
      await choose(game, 'bag')
      const n = game.S.msgs.length
      await choose(game, 'refuse')
      return game.S.msgs.slice(n).filter((m) => m.kind === 'text').map((m) => m.text)
    }
    const detective = await play(6)
    const bits = detective.filter((t) => t.includes('услышала «по рублю»'))
    expect(bits, 'один бит «по рублю» — дважды').toHaveLength(1)
    expect(bits[0]).toMatch(/не прошло/)
    expect(detective.join('\n'), 'дефолтная «я бессилен» осталась рядом со следовательской').not.toMatch(/Я бессилен/)
    // дефолтный путь: та же сцена без шести поимок оставляет свою строку, «Следователя» в ней нет
    const plain = await play(0)
    expect(plain.join('\n')).toMatch(/Я бессилен/)
    expect(plain.join('\n')).not.toMatch(/не прошло/)
  })
  it('Следователь: с пятью поимками исход недоступен, с шестью — выигрывает у «Нивы» (#1434, #1612)', async () => {
    const pick = async (caught: number) => {
      const { game } = makeGame()
      game.S.mem.caughtUnique = caught
      game.S.mem['finale.niva'] = 'chose' // у «Нивы» 2 — следователь (3) обязан её обойти
      return (await game.fire('PaydayOutcome'))?.name
    }
    // на пяти поимках мост «Мешка» (1) «Ниву» не обходит: мешок берётся только без заслуженной «Нивы»
    expect(await pick(5)).toBe('Payday_niva')
    expect(await pick(6)).toBe('Payday_detective')
  })
  it('Следователь не вытесняет поимку в самой сцене: она остаётся за coins (#1434)', async () => {
    const { game } = makeGame()
    game.S.mem.caughtUnique = 6
    game.S.mem['payday.caught'] = true
    expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_coins')
  })
  // #1472: у покаяния две версии — обращённая к Карине и общая; при Карине дома звучала одна, а не обе подряд
  it('Следователь: бит покаяния звучит один раз — при Карине дома обращённый, без неё общий (#1472)', async () => {
    const play = async (setup: (g: Game) => void) => {
      const { game } = makeGame()
      rich(game)
      game.S.mem.caughtUnique = 6
      setup(game)
      await game.enterNode('payday', 'announce')
      await choose(game, 'witness')
      const n = game.S.msgs.length
      await choose(game, 'share')
      expect(game.S.mem.payday).toBe('detective')
      return texts(game, n).join('\n')
    }
    const REPENT = /Я мог бы сказать, что слово было чужое/g
    const home = await play((g) => { g.S.mem['intro.karine'] = true })
    expect(home.match(REPENT), 'бит покаяния выдан дважды').toHaveLength(1)
    expect(home).toMatch(/Карине, проверь/)
    expect(home, 'при Карине дома прозвучала общая строка').not.toMatch(/Ты ловил меня на слове/)

    const gone = await play((g) => { g.S.mem['intro.karine'] = true; g.S.mem['finale.rubik'] = 'karine' })
    expect(gone.match(REPENT), 'покаяние без Карине').toHaveLength(1)
    expect(gone).toMatch(/Ты ловил меня на слове/)
    expect(gone, 'Карине ушла к Рубику, а строка обращена к ней').not.toMatch(/Карине, проверь/)

    // Карине ещё не входила в историю: обращённая версия ей не адресуется, общая звучит один раз
    const stranger = await play((g) => { delete g.S.mem['met.karine'] })
    expect(stranger.match(REPENT), 'покаяние без знакомства с Карине').toHaveLength(1)
    expect(stranger).toMatch(/Ты ловил меня на слове/)
  })
  // #1456/#1481/#1612: условие исхода — gte(caughtUnique, DETECTIVE_CATCHES), и счётчик разных пар растёт без «трижды», поэтому ни одна строка
  // исходов на границах 4–8 не называет числа: уже на шестой поимке «трижды» противоречило бы записям
  it('исходы Дня выплаты не называют число поимок — при uniq 4–8 им нечего опровергать (#1456, #1612)', async () => {
    const play = async (caught: number) => {
      const { game } = makeGame()
      rich(game)
      // «Нива» (2) выше моста (1): для проверки текстов «Мешка» убираем её, у «Следователя» она и так проигрывает
      if (caught < 6) delete game.S.mem['finale.niva']
      game.S.mem.caughtUnique = caught
      await game.enterNode('payday', 'announce')
      await choose(game, 'witness')
      const debt = game.debt
      const n = game.S.msgs.length
      await choose(game, 'share')
      // у «Мешка» после дележа есть шаг «принять», у «Следователя» его нет: исход в обеих ветках должен сыграть
      if (game.choices?.some((c) => c.go === 'accept')) await choose(game, 'accept')
      await game.fire('CheckEnding')
      const dossier = ENDINGS.find((e) => e.id === game.S.ending)
      expect(dossier, `экран концовки для ${game.S.ending}`).toBeDefined()
      return { game, debt, out: texts(game, n).join('\n'), chain: String(game.S.mem['payday.chain']), dossier: dossier!.text }
    }
    for (const caught of [4, 5, 6, 7, 8]) {
      const p = await play(caught)
      // граница #1612: до шести поимок — мост «Мешка», с шести — «Следователь»
      expect(p.game.S.mem.payday, `${caught} уникальных`).toBe(caught < 6 ? 'coins' : 'detective')
      // выплата честная, как и на границе порога: число поимок на неё не влияет
      expect(p.game.S.debt, `${caught} уникальных: долг`).toBe(0)
      expect(p.game.S.money, `${caught} уникальных: деньги`).toBeGreaterThanOrEqual(p.debt)
      // строки исхода действительно сыграли — иначе запрет на число был бы вакуумным
      if (caught < 6) expect(p.out, `${caught} уникальных: мост не сыграл`).toMatch(/мешок монет/)
      else expect(p.out, `${caught} уникальных: покаяние не сыграло`).toContain('Не раз и не два я врал — и ты записывал.')
      // ни в переводе, ни в репликах, ни в отмазке, ни в досье нет числа, которого в партии не было
      for (const [where, text] of [['перевод и реплики', p.out], ['отмазка', p.chain], ['досье', p.dossier]] as const) {
        expect(text, `${caught} уникальных: число поимок в тексте (${where})`).not.toMatch(COUNT_CLAIM)
      }
    }
    // строки на месте: перевод с назначением, покаяние (одно — при Карине дома обращённое, #1472), отмазка-метка
    const six = await play(6)
    expect(six.out).toContain('Назначение: «Слово. Поимки. Долг»')
    expect(six.out, 'при Карине дома звучит и общая версия покаяния').not.toContain('Ты ловил меня на слове — и не раз, брат.')
    expect(six.chain).toBe(DETECTIVE_CHAIN)
    // сторож не пустой: новые формулировки границ ловятся, честная строка «не раз и не два» — нет
    expect('пять поимок').toMatch(COUNT_CLAIM)
    expect('ровно шесть').toMatch(COUNT_CLAIM)
    expect('3 поимки').toMatch(COUNT_CLAIM)
    expect('Не раз и не два я врал — и ты записывал.').not.toMatch(COUNT_CLAIM)
  })
  // #1456: «Настоящие деньги» вежливому следователю (#1435) — та же причина: числа в тексте нет
  it('Настоящие деньги через поимки: реплика не называет их число — при 4+ (тоже #1456)', async () => {
    const { game } = makeGame()
    rich(game)
    delete game.S.ach.court // путь без заседания: real открывают поимки, а не суд
    game.S.ach.saint = 10
    game.S.mem.caughtUnique = 5
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    const n = game.S.msgs.length
    await choose(game, 'share')
    const out = texts(game, n).join('\n')
    expect(game.S.mem.payday).toBe('real')
    expect(game.S.debt).toBe(0)
    // реплика пути без суда сыграла — иначе запрет на число был бы вакуумным
    expect(out).toContain('Ты был вежлив и ловил меня на слове')
    expect(out).not.toMatch(COUNT_CLAIM)
    await game.fire('CheckEnding')
    expect(ENDINGS.find((e) => e.id === game.S.ending)!.text).not.toMatch(COUNT_CLAIM)
  })
  // #1433: мост поимок — две мидгейм-поимки дают мешок и без поимки в самой сцене
  it.each([2, 5])('Мост поимок: две разные пары при %i поимках — монеты без Карине и поимки в сцене', async (caught) => {
    const { game } = makeGame()
    game.S.mem.caughtUnique = COINS_BRIDGE_CATCHES
    game.S.mem.caughtCount = caught
    expect(game.S.mem['intro.karine']).toBeUndefined()
    const debt = game.debt
    const n = game.S.msgs.length
    expect(game.S.mem['payday.caught'], 'поимки в сцене нет').toBeUndefined()
    expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_coinsByCatch')
    const out = texts(game, n).join('\n')
    expect(game.S.mem.payday).toBe('coins')
    expect(game.S.debt).toBe(0)
    expect(game.S.money).toBeGreaterThanOrEqual(debt)
    expect(out).toMatch(/ловил меня на слове.*до Дня выплаты/)
    expect(out).not.toMatch(/поймал (?:меня|его) в День выплаты|поймал дважды|весь год/)
    expect(out).toMatch(/мешок монет/)
    await game.fire('CheckEnding')
    expect(game.S.ending).toBe('payday_coins')
    const ending = ENDINGS.find((e) => e.id === game.S.ending)!
    expect(ending.text).toMatch(/монетами по 10 рублей/)
    expect(ending.text).not.toMatch(/поймал.*в День выплаты|Карине/)
  })
  it('Мост поимок: одна поимка мешок не открывает — порог 2, не 1 (#1433)', async () => {
    const pick = async (caught: number) => {
      const { game } = makeGame()
      game.S.mem.caughtUnique = caught
      return (await game.fire('PaydayOutcome'))?.name
    }
    expect(await pick(1)).toBe('Payday_default')
    expect(await pick(COINS_BRIDGE_CATCHES)).toBe('Payday_coinsByCatch')
  })
  // #1612: лестница по уникальным поимкам — 0–1 дефолт, 2–5 мост «Мешка», 6+ «Следователь»
  it('лестница исходов по уникальным поимкам: 0–1 — 50 ₽, 2–5 — мешок, 6+ — следователь (#1612)', async () => {
    const pick = async (caught: number) => {
      const { game } = makeGame()
      game.S.mem.caughtUnique = caught
      return (await game.fire('PaydayOutcome'))?.name
    }
    expect(await pick(0)).toBe('Payday_default')
    expect(await pick(1)).toBe('Payday_default')
    for (const caught of [2, 3, 4, 5]) expect(await pick(caught), `uniq ${caught}`).toBe('Payday_coinsByCatch')
    for (const caught of [6, 7, 8]) expect(await pick(caught), `uniq ${caught}`).toBe('Payday_detective')
  })
  it('с тремя поимками доли ещё срезают: мешок берётся после дележа, а не вместо него (#1612)', async () => {
    const { game } = makeGame()
    game.S.mem.caughtUnique = 3
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    const debt = game.debt
    await choose(game, 'share')
    // следовательского «долг приходит целиком» на трёх поимках ещё нет — срез дошёл до «к выплате»
    expect(game.S.mem['payday.sum']).toBe(50)
    const n = game.S.msgs.length
    await choose(game, 'accept')
    expect(game.S.mem.payday).toBe('coins')
    const out = texts(game, n).join('\n')
    expect(out, 'мост не сыграл — мешка в экране нет').toMatch(/мешок монет/)
    expect(game.S.debt).toBe(0)
    expect(game.S.money).toBeGreaterThanOrEqual(debt)
  })
  it('Мост поимок не спорит с заслуженным: Страсбург, «Не тебе», «Нива», Следователь (#1433, #1612)', async () => {
    const pick = async (caught: number, setup: (g: Game) => void) => {
      const { game } = makeGame()
      game.S.mem.caughtUnique = caught
      setup(game)
      return (await game.fire('PaydayOutcome'))?.name
    }
    expect(await pick(2, (g) => { g.S.ach.strasbourg = 1 })).toBe('Payday_strasbourg')
    expect(await pick(2, (g) => { g.S.mem['finale.razmik'] = 'default' })).toBe('Payday_notyou')
    expect(await pick(2, (g) => { g.S.mem['finale.niva'] = 'chose' })).toBe('Payday_niva')
    // пять поимок — ещё мост; шесть — уже «Следователь»: мост уступает и ему
    expect(await pick(5, () => {})).toBe('Payday_coinsByCatch')
    expect(await pick(6, () => {})).toBe('Payday_detective')
  })

  // #1435: «Настоящие деньги» — saint И (court ИЛИ detective). Критерии — только конъюнкция, дверь с поимками — своё правило
  it('Настоящие деньги без заседания: вежливость и три поимки (#1435, #1595 — порог свой)', async () => {
    const { game } = makeGame()
    game.S.ach.saint = 1
    game.S.mem.caughtUnique = 3 // порог real — три, отдельно от DETECTIVE_CATCHES (#1595)
    const n = game.S.msgs.length
    await game.fire('PaydayOutcome')
    expect(game.S.mem.payday, 'исход не «Настоящие деньги»').toBe('real')
    const out = texts(game, n).join('\n')
    expect(out, 'исход назвал заседание, которого не было').not.toMatch(/дошёл до суда/)
    expect(out, 'исход не назвал поимки').toMatch(/ловил меня на слове/)
  })
  it('Настоящие деньги через суд по-прежнему называют заседание (#1435)', async () => {
    const { game } = makeGame()
    game.S.ach.saint = 1
    game.S.ach.court = 1
    const n = game.S.msgs.length
    expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_real')
    const out = texts(game, n).join('\n')
    expect(out).toMatch(/дошёл до суда/)
    expect(out, 'вежливому с заседанием назвали поимки').not.toMatch(/ловил меня на слове/)
  })
  it('без вежливости поимки дают «Следователя», «Настоящие деньги» ждут трёх со «Святым» (#1435, #1612)', async () => {
    const pick = async (saint: boolean, caught: number) => {
      const { game } = makeGame()
      if (saint) game.S.ach.saint = 1
      game.S.mem.caughtUnique = caught
      return (await game.fire('PaydayOutcome'))?.name
    }
    expect(await pick(false, 6)).toBe('Payday_detective')
    // пять поимок без «Святого» — ещё мост «Мешка», не «Следователь» и не «Настоящие»
    expect(await pick(false, 5)).toBe('Payday_coinsByCatch')
    // три поимки без «Святого» — мост «Мешка», не «Следователь» и не «Настоящие»
    expect(await pick(false, 3)).toBe('Payday_coinsByCatch')
    // две поимки дают «мешок» мостом #1433, но не «Настоящие деньги»: вторая дверь требует трёх
    expect(await pick(true, 2)).not.toBe('Payday_real')
    // порог real не поднимался вместе со «Следователем»: трёх поимок со «Святым» по-прежнему достаточно (#1595)
    expect(await pick(true, 3)).toBe('Payday_real_detective')
  })
  it('Настоящие деньги второй дверью: три поимки со «Святым» минуют дележ и отмазку — сцена не отнимает real (#1595)', async () => {
    const { game } = makeGame()
    rich(game)
    delete game.S.ach.court
    game.S.ach.saint = 10
    game.S.mem.caughtUnique = 3 // порог real — три, отдельно от DETECTIVE_CATCHES (#1595)
    const debt = game.debt
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    const n = game.S.msgs.length
    await choose(game, 'share')
    const out = texts(game, n).join('\n')
    expect(game.S.mem.payday).toBe('real')
    expect(game.S.mem['payday.caught'], 'отмазка играла — сцена могла отнять real').toBeUndefined()
    expect(out, 'доли всё-таки срезали').toMatch(/Доли я отменил сам/)
    expect(out, 'real назвал заседание, которого не было').not.toMatch(/дошёл до суда/)
    expect(game.S.debt).toBe(0)
    expect(game.S.money).toBeGreaterThanOrEqual(debt)
  })

  it('переводы 50 ₽ вычитаются один раз: суд и выплата считают от одного долга (#832)', async () => {
    const { game } = makeGame()
    const base = game.debt
    await game.transfer()
    await game.transfer()
    expect(game.debt, 'два перевода — ровно минус сто').toBe(base - 100)
    // суд идёт своим счётом и долг не переписывает: база остаётся той же
    game.S.mem.court = 3
    expect(game.debt, 'суд не двигает базис долга').toBe(base - 100)
    // выплата называет ровно текущий долг, а не другой базис
    const debt = game.debt
    const n = game.S.msgs.length
    game.S.ach.saint = 1
    game.S.ach.court = 1
    expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_real')
    const sys = game.S.msgs.slice(n).filter((m) => m.kind === 'sys').map((m) => m.text).join(' ')
    expect(sys, 'выплата назвала не тот базис').toContain(`${debt.toLocaleString('ru-RU')} ₽`)
    expect(game.debt, 'долг закрыт выплатой').toBe(0)
  })

  it('Самвел не объявляет себя хозяином свадьбы до серии со свадьбой (#831)', () => {
    const line = ROLL.find((e) => valueOf(e).t.includes('хозяин свадьбы'))
    expect(line, 'строка Самвела не найдена — проверка пустеет').toBeDefined()
    const when = spec(line!).when ?? []
    expect(when.some((c) => String(c.key) === 'arc.samvel' && c.op === '>=' && Number(c.value) >= 1), 'нет ворот по серии, где свадьба объявлена').toBe(true)
  })

  it('противоречие утра не выдаёт старое событие за сегодняшнее (#832)', () => {
    // утро о конверте говорит как о воспоминании («Помнишь конверт из фундамента?»), поэтому «сегодня же
    // фундамент вскрыли» — ложь: вскрытие было в финале бетона, днями раньше
    const beton = MORNING_CONTRA.find((c) => c.morning.test('Помнишь конверт из фундамента? У него было двойное дно. 40 000 — чьи, не знаю, теперь наши.'))
    expect(beton, 'ворота этого противоречия не сработали — проверка была бы пустой').toBeDefined()
    expect(beton!.say, 'старое вскрытие подано как сегодняшнее').not.toMatch(/сегодня/i)
    // там, где утро само объявляет сегодняшнюю новость, «сегодня» уместно
    const safe = MORNING_CONTRA.find((c) => c.morning.test('Сейф открыли! Второй ключ нашёлся — у малыша в игрушках. Внутри 120 000 и соска.'))
    expect(safe!.say).toMatch(/сегодня/i)
    // и каждый блок morning-контра опирается на настоящую строку утра этой партии
    const morning = SOURCES.map((e) => valueOf(e).t).join('\n')
    for (const c of MORNING_CONTRA) expect(c.morning.test(morning), `нет строки утра под ${c.morning}`).toBe(true)
  })

  // #909: доля Гарика — аренда за хранение денег и доля экскурсий, а не «копил, пока сидел»
  it('источник Гарика переозвучен под новый голос: аренда и экскурсии, сумма прежняя', () => {
    const garik = SOURCES.filter((e) => valueOf(e).t.includes('Гарик принёс'))
    expect(garik.length, 'строка Гарика в источниках одна').toBe(1)
    const t = valueOf(garik[0]!).t
    expect(t).toMatch(/аренд/i)
    expect(t).toMatch(/экскурс/i)
    expect(t).toMatch(/честный человек/)
    expect(t, 'старой формулировки нет').not.toMatch(/копил, пока сидел/i)
    expect(valueOf(garik[0]!).amount).toBe(25000)
  })

  // #1065: завершение суда по плитке объявляет финал арки — источник ведёт только новой частью (залогом)
  it('источник по делу о плитке ведёт залогом, а не повторяет завершение суда', () => {
    const texts = SOURCES.map((e) => valueOf(e).t)
    expect(texts.filter((t) => /Суд по плитке закончился/.test(t)), 'повтор новости о завершении суда').toEqual([])
    const tile = SOURCES.filter((e) => valueOf(e).t.includes('залог'))
    expect(tile.length, 'строка про залог в источниках одна').toBe(1)
    const t = valueOf(tile[0]!).t
    expect(t, 'строка не начинается с залога').toMatch(/^Из суда по плитке вернули залог\./)
    expect(valueOf(tile[0]!).amount).toBe(35000)
  })

  // #1470: подпись акта и оплату объявил финал сериала — источник ведёт поступлением денег, а не второй новостью
  const RUBIK_NEWS = 'Инспектор Рубик подписал акт!'
  const RUBIK_LINK = 'Помнишь, Рубик подписал акт?'
  const rubikMorning = async (signed: boolean) => {
    const { game } = makeGame()
    game.S.mem['finale.rubik'] = 'default'
    game.S.mem['intro.grant'] = true
    if (signed) game.S.mem[actSigned] = true
    await game.enterNode('payday', 'bag')
    return { game, morning: texts(game).join('\n') }
  }
  it('источник Рубика ссылается на подписанный акт, а не объявляет его заново (#1470)', async () => {
    const { morning } = await rubikMorning(true)
    expect(morning, 'источник Рубика не прозвучал — проверка пустеет').toContain('55 000')
    expect(morning, 'акт объявлен новостью второй раз').not.toContain(RUBIK_NEWS)
    expect(morning, 'строка не опирается на подписанный акт как на известное').toContain(RUBIK_LINK)
    const rubik = SOURCES.map((e) => valueOf(e)).filter((s) => s.t.includes('55 000'))
    expect(rubik.length, 'у источника Рубика одна строка на случай').toBeGreaterThan(0)
    for (const s of rubik) expect(s.amount, 'сумма источника').toBe(55000)
  })
  it('без объявленного акта источник Рубика остаётся новостью (#1470)', async () => {
    const { morning } = await rubikMorning(false)
    expect(morning, 'новость о подписи пропала вместе с дублем').toContain(RUBIK_NEWS)
    expect(morning, 'ссылка на непрозвучавшую подпись').not.toContain(RUBIK_LINK)
  })

  // #988: «потом извинился» из RUDE_AGAIN опирается на факт, который ставит утренний источник судьи (возврат госпошлины)
  it('источник судьи ставит факт извинений (#988)', () => {
    const { game } = makeGame()
    game.S.ach.court = game.S.day
    game.S.mem['intro.judge'] = true
    const p = game.linePicked('PD_SRC', SOURCES)
    expect(p, 'источник судьи не выбран — проверка пустеет').toBeDefined()
    expect(p!.text).toMatch(/госпошлину/)
    expect(game.S.mem[judgeApology], 'извинения судьи ставит прозвучавшая строка').toBe(true)
  })

  // #1139: источник «Налоговая разморозила…» потребляет taxFrozen, иначе эпилог гейтится протухшей заморозкой
  const THAW = 'Налоговая разморозила счета! Сказали: Борис дал такие показания, что им стыдно. 90 000.'
  const FREEZE_NEWS = ['fin.boris.default', 'fin.rubik.default']
  const freezeNews = (game: Game) => {
    game.S.mem['finale.boris'] = 'default'
    game.S.mem['finale.rubik'] = 'default'
    game.S.mem[taxFrozen] = true
    game.S.arcs.boris = { i: 1, last: 0 }
    game.S.arcs.rubik = { i: 1, last: 0 }
  }
  const archSlugs = (game: Game) => game.open(ENDGAME_ARCH).map((l) => l.slug)

  it('источник разморозки снимает taxFrozen (#1139)', async () => {
    const { game } = makeGame()
    freezeNews(game)
    const line = SOURCES.map((e) => valueOf(e)).find((s) => s.t === THAW)
    expect(line, 'строка разморозки не найдена — проверка пустеет').toBeDefined()
    expect(line!.amount, 'сумма источника').toBe(90000)
    expect(game.holds(is(taxFrozen)), 'до источника счета заморожены — проверка пустеет').toBe(true)
    await game.enterNode('payday', 'bag')
    const morning = texts(game).join('\n')
    expect(morning, 'строка разморозки не прозвучала — проверка пустеет').toContain(THAW)
    expect(morning, 'пени добрали вторые 90 000 в то же утро').not.toContain('Налоговая вернула пени')
    expect(game.S.mem[taxFrozen], 'источник не снял заморозку').toBeUndefined()
    expect(game.holds(is(taxFrozen)), 'гейт эпилога всё ещё видит заморозку').toBe(false)
    expect(game.S.mem[taxThawed], 'разморозка не записана — срок легенды не наступает').toBe(true)
  })

  it('после разморозки эпилог не зовёт замороженные счета (#1139)', async () => {
    const { game } = makeGame()
    freezeNews(game)
    const before = archSlugs(game)
    for (const slug of FREEZE_NEWS) expect(before, `${slug} до источника — проверка пустеет`).toContain(slug)
    const legendText = (g: Game) => g.open(LEGENDS.frozen.lines).map((l) => (typeof l === 'string' ? l : l.t)).join(' ')
    expect(legendText(game), 'легенда до разморозки молчит — проверка пустеет').toMatch(/заморожен/)
    await game.enterNode('payday', 'bag')
    expect(texts(game).join('\n'), 'строка разморозки не прозвучала — проверка пустеет').toContain(THAW)
    const after = archSlugs(game)
    for (const slug of FREEZE_NEWS) expect(after, `${slug} звучит после разморозки`).not.toContain(slug)
    expect(legendText(game), 'легенда после разморозки всё ещё твердит про заморозку').not.toMatch(/заморожен/)
  })

  it('без разморозки эпилог называет замороженные счета (#1139)', () => {
    const { game } = makeGame()
    freezeNews(game)
    const slugs = archSlugs(game)
    for (const slug of FREEZE_NEWS) expect(slugs, `${slug} молчит без разморозки`).toContain(slug)
  })

  it('с живым hodl утро не продаёт коины, а исход отдаёт лаваш; хвастовство о курсе помечено (#815)', async () => {
    const { game } = makeGame()
    game.S.day = 420
    game.S.mem['crypto.hodl'] = true
    await game.enterNode('payday', 'announce')
    await choose(game, 'witness')
    const morning = texts(game).join('\n')
    // hodl жив: обменяна часть, остальное остаётся в коине
    expect(morning).toContain('Остальное держу')
    expect(morning).not.toMatch(/[Пп]родал весь/)
    // хвастовство о курсе из легенды прозвучало в партии — это утверждение Алика, а не описание мира
    const boast = LEGENDS.crypto.lines.map((l) => lineSpec(l)).find((x) => (x.claims ?? []).includes('lavash_rate_up'))
    expect(boast, 'хвастовство о курсе помечено claims').toBeDefined()
    await game.say([{ t: boast!.t, claims: ['lavash_rate_up'] }])
    // исход при живом hodl — лавашом, и курс в нём честный, 1:1
    expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_lavash')
    expect(texts(game).join('\n')).toContain('Курс: 1 LAV = 1 лаваш')
    // обе версии — про один предмет, значит игрок может поймать Алика на курсе
    expect(CLAIM_LEDGER.lavash_rate_up.subject).toBe('money.rate')
    expect(CLAIM_LEDGER.lavash_rate_same.subject).toBe('money.rate')
    expect(CLAIM_LEDGER.lavash_rate_up.value).not.toBe(CLAIM_LEDGER.lavash_rate_same.value)
    expect(game.lie()?.kind, 'курс — предмет поимки').toBe('money')
  })
  it('кнопка-шутка звучит на следующий день и не поздравляет «с» прошедшим днём (#821)', () => {
    for (const [id, o] of Object.entries(OUTCOME)) {
      for (const b of o.button) {
        expect(lineSpec(b).t, `${id}: кнопка поздравляет «с» днём, который уже прошёл`).not.toMatch(/[Сс] Днём выплаты/)
      }
    }
    expect(lineSpec(OUTCOME.default!.button[0]!).t, 'день выплаты назван прошедшим').toMatch(/был День выплаты/)
  })
  it('бедная партия: общие источники и добор до 240 000, общие звенья отмазки', async () => {
    const { game } = makeGame()
    game.S.day = 420
    await game.enterNode('payday', 'announce')
    await choose(game, 'doubt')
    expect(texts(game).join(' ')).toMatch(/К выплате: 240\s000 ₽/)
    await choose(game, 'share')
    expect(String(game.S.mem['payday.chain']).length).toBeGreaterThan(80)
  })
  it('День выплаты прошёл — правило уходит из пула, а не перехватывает StoryBeat молча', () => {
    const late = (g: Game) => g.rules.collect({ event: 'StoryBeat' }, g.facts()).some((r) => r.name === 'Beat_Payday_Late')
    const { game } = makeGame()
    game.S.day = 430
    game.S.stats.sent = 200
    expect(late(game), 'подводка не сыграна — третьему акту рано (#893)').toBe(false)
    game.S.mem['payday.lead'] = 428
    game.S.mem['payday.signs'] = 2
    expect(late(game)).toBe(true)
    game.S.mem['payday.at'] = 400
    expect(late(game)).toBe(false)
    delete game.S.mem['payday.at']
    game.S.mem.payday = 'coins'
    expect(late(game)).toBe(false)
  })
  it('прерванная сцена Дня выплаты не теряет третий акт: его объявляют снова (#571)', async () => {
    const { game } = makeGame()
    game.S.day = 340
    game.S.stats.sent = 200
    rich(game)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_First')
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_Second')
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_Payday')
    expect(game.S.scene?.id).toBe('payday')
    // игрок жмёт реплику с актом («поймать на лжи») посреди сцены — сцена прерывается
    await game.send({ text: 'Стоп. Это всё неправда.', tone: 'neutral', act: 'catchLie' })
    expect(game.S.mem.payday, 'исход не записан — акт не завершён').toBeUndefined()
    // не потерян: тот же ход объявляет сцену снова (once-метка beat'а снята вместе с днём)
    expect(game.S.scene?.id).toBe('payday')
    await choose(game, 'bag')
    await choose(game, 'share')
    expect(String(game.S.mem['payday.chain']).length).toBeGreaterThan(80)
  })
  // #893: приёмка — штрихи подводки звучат за 2–3 дня до выплаты, по одному в день, раньше третьего акта их нет
  it('подводка: два штриха за два дня до анонса, один в день, и только в третьем акте (#893)', async () => {
    const { game } = makeGame()
    rich(game)
    // все сериалы закрыты: в этом окне сюжетный ход не открывает сцену и штрихи не глушит scene-floor
    const done = (id: string) => ({ i: ARCS[id].eps.length, last: 0 })
    Object.assign(game.S.arcs, Object.fromEntries(Object.keys(ARCS).map((id) => [id, done(id)])))
    // раньше третьего акта штрихов нет
    game.S.day = 329
    expect((await game.fire('StoryBeat'))?.name ?? '').not.toMatch(/^Beat_PaydayLead/)
    expect(game.S.mem['payday.signs']).toBeUndefined()
    // линии сошлись: первый штрих, второй ждёт своего дня — в тот же день его нет
    game.S.day = 340
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_First')
    expect(game.S.mem['payday.signs']).toBe(1)
    expect((await game.fire('StoryBeat'))?.name ?? '', 'второй штрих в тот же день').not.toBe('Beat_PaydayLead_Second')
    expect(game.S.mem['payday.signs']).toBe(1)
    const sign1Day = game.S.day
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_Second')
    expect(game.S.mem['payday.signs']).toBe(2)
    const sign2Day = game.S.day
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_Payday')
    // выплата — «завтра» после анонса: от дня первого штриха до неё три дня, от второго — два
    const at = Number(game.S.mem['payday.at'])
    expect(at).toBe(game.S.day + 1)
    expect(at - sign1Day).toBe(3)
    expect(at - sign2Day).toBe(2)
  })
  // #893: штрихи линий — по фактам идущих линий; чужие голоса молчат (как в пулах Дня выплаты)
  it('штрих Нуне — только с идущим декретом, Гарик — только на связи и со своей линией (#893)', () => {
    const { game } = makeGame()
    const who = () => game.lines.eligible('PD_LEAD', LEAD, game.lineFacts()).map((p) => (p.spec as Lead).w)
    expect(who(), 'общие штрихи Алика — в любой партии').toEqual([undefined, undefined, undefined])
    game.S.arcs.nune = { i: 1, last: 0 }
    game.S.mem[met('nune')] = true
    expect(who()).toContain('nune')
    game.S.mem[nuneDekretOver] = true
    expect(who(), 'декрет кончился — свой штрих Нуне молчит').not.toContain('nune')
    delete game.S.mem[nuneDekretOver]
    game.S.arcs.garik = { i: 1, last: 0 }
    game.S.mem[met('garik')] = true
    expect(who()).toContain('garik')
    game.S.mem[garikCut] = true
    expect(who(), 'Гарик без связи — его штрих молчит').not.toContain('garik')
  })
  it('исходы по стилю партии: частный побеждает', async () => {
    const pick = async (setup: (g: Game) => void) => { const { game } = makeGame(); setup(game); return (await game.fire('PaydayOutcome'))?.name }
    expect(await pick(() => {})).toBe('Payday_default')
    expect(await pick((g) => { g.S.mem['payday.caught'] = true })).toBe('Payday_coins')
    expect(await pick((g) => { g.S.mem['payday.caught'] = true; g.S.mem['crypto.hodl'] = true })).toBe('Payday_lavash') // и поимка, и крипта: лаваш (3) выше монет (2)
    expect(await pick((g) => { g.S.mem['crypto.hodl'] = true })).toBe('Payday_lavash') // одной крипты хватает — поимка больше не нужна
    expect(await pick((g) => { g.S.mem['finale.niva'] = 'chose' })).toBe('Payday_niva')
    expect(await pick((g) => { g.S.ach.strasbourg = 1 })).toBe('Payday_strasbourg')
    expect(await pick((g) => { g.S.mem['finale.razmik'] = 'default' })).toBe('Payday_notyou') // любой финал Размика, без счётчика криков
    expect(await pick((g) => { g.S.ach.saint = 1; g.S.ach.court = 1 })).toBe('Payday_real') // вежливость и суд — квесты и поимки не нужны
  })
  it('«Нивой» важнее стиля партии: финал chose бьёт Размика и Страсбург (#760)', async () => {
    const pick = async (seed: number, setup: (g: Game) => void) => {
      const { game } = makeGame({ seed })
      setup(game)
      return (await game.fire('PaydayOutcome'))?.name
    }
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(await pick(seed, (g) => { g.S.mem['finale.niva'] = 'chose'; g.S.mem['finale.razmik'] = 'default' }), `размик, сид ${seed}`).toBe('Payday_niva')
      expect(await pick(seed, (g) => { g.S.mem['finale.niva'] = 'chose'; g.S.ach.strasbourg = 1 }), `страсбург, сид ${seed}`).toBe('Payday_niva')
    }
    // chose нет — «Не тебе», как прежде
    expect(await pick(1, (g) => { g.S.mem['finale.razmik'] = 'default' })).toBe('Payday_notyou')
    const hierarchy = '`real` (4) > `lavash` (3) = `detective` (3) > `coins` (2) = `niva` (2) > `strasbourg`/`notyou` (1) > `default` (0)'
    expect(readFileSync('ENDINGS.md', 'utf8')).toContain(hierarchy)
    expect(readFileSync('docs/design/endings-single-condition.md', 'utf8')).toContain(hierarchy)
  })
  it('в перекличке — только те, кого игрок встречал, и каждый один раз', async () => {
    const { game } = makeGame()
    game.S.day = 340
    game.S.mem['met.judge'] = true
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    // перекличка — между «добавил вас в группу» и вопросом Самвела про доли
    const start = game.S.msgs.findIndex((m) => m.kind === 'sys' && /ДЕНЬ ВЫПЛАТЫ/.test(m.text))
    const roll = game.S.msgs.slice(start + 1, -1)
    const whos = roll.flatMap((m) => (m.kind === 'text' && m.who ? [m.who] : []))
    expect(whos).toContain('judge')
    expect(whos).not.toContain('rubik')
    expect(new Set(whos).size).toBe(whos.length)
  })
  // застолье уже списало 6 000 и уменьшило долг на 1 000 — партия приходит к выплате с этими числами
  const afterFeast = (g: Game) => { g.S.day = 340; g.S.ach.q_tamada = 1; g.adjustDebt(239000 - g.S.debt) }
  it('доля за сервиз добирает разницу: с зачтённым на застолье выходит названная сумма', async () => {
    const { game } = makeGame()
    afterFeast(game)
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    const n = game.S.msgs.length
    await choose(game, 'share')
    const out = texts(game, n).join('\n')
    expect(out).toMatch(/зачли шесть тысяч/)
    expect(out).toMatch(/тридцать девять сверху/)
    // 239 000 − 39 000: вместе с зачтёнными шестью тысячами сервиз стоит ровно названные сорок пять
    expect(out).toMatch(/К выплате: 200\s000 ₽/)
  })
  it('отказ делиться берёт больше названного — и это объявлено до долей, а не спрятано в числе', async () => {
    const { game } = makeGame()
    afterFeast(game)
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    const n = game.S.msgs.length
    await choose(game, 'refuse')
    const out = texts(game, n).join('\n')
    expect(out).toMatch(/родня услышала «по рублю»/)
    expect(out).toMatch(/К выплате: 180\s500 ₽/) // 239 000 − 39 000 − 19 500
  })
  it('отказ делиться: Гоар называет фактическое списание, а не номинал 39 000 (#913)', async () => {
    const { game } = makeGame()
    afterFeast(game)
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    const n = game.S.msgs.length
    await choose(game, 'refuse')
    const goar = game.S.msgs.slice(n).find((m) => m.kind === 'text' && m.who === 'goar' && /сервиз/.test(m.text))
    expect(goar?.kind, 'реплики про сервиз нет — проверка пустеет').toBe('text')
    if (goar?.kind !== 'text') return
    const named = Number(goar.text.replace(/[^\d]/g, ''))
    const i = game.S.msgs.indexOf(goar)
    const pay = (from: number, dir: -1 | 1): number | undefined => {
      for (let k = from; k >= 0 && k < game.S.msgs.length; k += dir) {
        const m = game.S.msgs[k]
        const hit = m.kind === 'sys' && m.text.match(/К выплате: ([\d\s\u00a0\u202f]+) ₽/)
        if (hit) return Number(hit[1].replace(/\D/g, ''))
      }
      return undefined
    }
    const before = pay(i - 1, -1)
    const after = pay(i + 1, 1)
    expect(before, 'до реплики нет суммы').toEqual(expect.any(Number))
    expect(after, 'после реплики нет суммы').toEqual(expect.any(Number))
    expect(named, goar.text).toBe(before! - after!)
    expect(named, 'номинал 39 000 при отказе — не то списание').not.toBe(39000)
    expect(goar.text).not.toMatch(/тридцать девять|сорок пять/)
  })
  it('баран передан игроку: доля Бориса не срезает выплату и называет, кто им пользовался (#856)', () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 8, last: 0 }
    game.S.mem['met.boris'] = true
    const claim = () => game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts())
      .map((p) => p.spec as Claim).find((c) => c.who === 'boris')
    expect(claim()?.cut, 'баран ещё у Алика — доля срезает выплату').toBe(20000)
    game.S.items.push('баран Борис') // has.boris — так его ставит барахолка
    expect(claim()?.cut, 'баран передан игроку — срезать за службу Алику нечего').toBe(0)
    expect(claim()?.t, 'текст называет, кто пользовался бараном').toMatch(/служил Алику/)
  })

  it('доля Карине за ванную не называет обещания игрока: условие мира назвала она сама (#862)', () => {
    const { game } = makeGame()
    // так доля и появляется: ритуал примирения, ветка «текстом» — Карине объявляет своё условие.
    // Игрок при этом мог отказаться от допработы ванной, и обещания в партии не было
    game.S.mem[bathAsked] = true
    const bath = game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts()).filter((p) => /ванн/i.test(p.text))
    expect(bath.length, 'доля за ванную не выпала — проверка пустеет').toBe(1)
    expect(bath[0].text, '«вы обещали» — обещания игрок не давал').not.toMatch(/обещал|договор|соглас/i)
  })
  it('доля Самвела уместна только по факту его линии, а не по знакомству от чужой реплики (#701)', () => {
    const { game } = makeGame()
    const whos = (pool: ReturnType<typeof game.lines.eligible>) => pool.map((p) => (p.spec as { who?: string }).who)
    expect(whos(game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts()))).not.toContain('samvel')
    const roll = whos(game.lines.eligible('PD_ROLL', ROLL, game.lineFacts()))
    expect(roll).not.toContain('samvel')
    expect(roll).not.toContain('karine')
    // знакомство без линии (суд, родня) претензию не открывает — открывает его сериал
    game.S.mem['intro.samvel'] = true
    expect(whos(game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts()))).not.toContain('samvel')
    game.S.arcs.samvel = { i: ARCS.samvel.eps.length, last: 0 }
    expect(whos(game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts()))).toContain('samvel')
  })
  // несостыковка из плейтест-раундов 43–44: распорядитель дележа сам открывал Самвелу знакомство,
  // и в партии без его линии он требовал «подарок молодым» на свадьбе, которой не было (#701)
  it('дележ без самвеловской линии ведёт Алик, с линией — дядя Самвел, и претензия только по линии', async () => {
    const host = async (line: boolean) => {
      const { game } = makeGame()
      game.S.day = 340
      if (line) await game.playArc('samvel') // линия партии — настоящим производителем, не памятью
      await game.enterNode('payday', 'announce')
      await choose(game, 'bag')
      const hostLine = game.S.msgs.find((m) => m.kind === 'text' && /по традиции, каждому долю/.test(m.text))
      expect(hostLine, 'дележ звучит').toBeDefined()
      const pool = (p: ReturnType<typeof game.lines.eligible>) => p.map((x) => (x.spec as { who?: string }).who)
      return {
        who: hostLine!.kind === 'text' ? hostLine!.who : undefined,
        claims: pool(game.lines.eligible('PD_CLAIM', CLAIMS, game.lineFacts())),
      }
    }
    const noLine = await host(false)
    expect(noLine.who).toBeUndefined() // говорит Алик: Самвел не появляется «из ниоткуда»
    expect(noLine.claims).not.toContain('samvel')
    const withLine = await host(true)
    expect(withLine.who).toBe('samvel')
    expect(withLine.claims).toContain('samvel')
  })
  // #740: замер на 201 партии — доля была первым словом спикера у тёти Гоар (140 из 142), мамы (49 из 201)
  // и Нуне (2 из 79, сид 99031); остальные к дележу уже писали сами. Незнакомый голос — представление.
  it('доля незнакомого спикера представляется; знакомого — как раньше, и дележ считается одинаково (#740)', async () => {
    const play = async (known: boolean, quest: 'q_goat' | 'q_tamada' = 'q_goat') => {
      const { game } = makeGame()
      Object.assign(game.S.ach, { [quest]: 1 })
      game.S.arcs.nune = { i: 1, last: 0 } // dekret: Нуне могла так и не заговорить самой
      if (known) Object.assign(game.S.mem, { 'met.goar': true, 'met.nune': true, 'met.mama': true })
      await game.enterNode('payday', 'announce')
      await choose(game, 'bag')
      const n = game.S.msgs.length
      await choose(game, 'share')
      return texts(game, n).join('\n')
    }
    const strangers = await play(false)
    expect(strangers).toMatch(/Это тётя Гоар\. Коза — моя\./)
    expect(strangers).toMatch(/Здравствуйте\. Я Нуне\./)
    expect(strangers).toMatch(/Это мама Алика\./)
    expect(strangers).not.toMatch(/поседела/)
    const strangersTamada = await play(false, 'q_tamada')
    expect(strangersTamada).toMatch(/Это тётя Гоар\. А сервиз\?/)
    const known = await play(true)
    expect(known).not.toMatch(/Это тётя Гоар|Я Нуне|Это мама Алика/)
    expect(known).toMatch(/А кто будет платить за мою козу/)
    expect(known).toMatch(/Налог с выплаты\. Я из декрета/)
    expect(known).toMatch(/Я из-за вас обоих поседела/)
    // доли те же: 240 000 − 60 000 (коза) − 30 000 (налог) − 25 000 (лекарства) = 125 000; сервиз — 39 000
    expect(strangers).toMatch(/К выплате: 125\s000 ₽/)
    expect(strangersTamada).toMatch(/К выплате: 146\s000 ₽/)
    expect(known).toMatch(/К выплате: 125\s000 ₽/)
    for (const out of [strangers, strangersTamada, known]) expect(out).toMatch(/К выплате: 50 ₽/)
  })
  it('у спикера доли с веткой «первый раз» разведены по знакомству все реплики, а не одна (#740)', () => {
    const crit = (e: Entry<Claim>, f: (c: Criterion) => boolean): boolean =>
      (spec(e).when ?? []).some(function walk(c): boolean {
        return f(c) || (c.all ?? []).some(walk)
      })
    const first = (e: Entry<Claim>, who: string) => crit(e, (c) => c.key === `met.${who}` && c.op === '!exist')
    const known = (e: Entry<Claim>, who: string) => crit(e, (c) => c.key === `met.${who}` && c.op === '==' && c.value === true)
    let branched = 0
    for (const who of new Set(CLAIMS.map((e) => valueOf(e).who))) {
      const entries = CLAIMS.filter((e) => valueOf(e).who === who)
      // без ветки «первый раз» знакомство спикера держат факты его арки/сцены (grant, razmik, rubik, judge, samvel, karine, boris)
      if (!entries.some((e) => first(e, who))) continue
      branched += entries.length
      for (const e of entries) {
        expect(first(e, who) !== known(e, who), `${who}: «${valueOf(e).t.slice(0, 40)}…» без разведения по знакомству`).toBe(true)
      }
    }
    expect(branched, 'веток «первый раз» не стало — проверка пустеет').toBeGreaterThanOrEqual(6)
  })
  it('после выплаты старая допработа и перевод не меняют долг; кнопка допработы закрыта', async () => {
    const { game } = makeGame()
    await game.job()
    const job = game.S.msgs.find((m) => m.kind === 'job')!
    expect(job.kind).toBe('job')
    rich(game)
    await game.enterNode('payday', 'announce')
    await choose(game, 'bag')
    await choose(game, 'refuse')
    game.S.choices = null
    await choose(game, 'accept')
    expect(game.debtSealed()).toBe(true)
    const sealed = game.S.debt
    const money = game.S.money
    // исход закрыл все незакрытые job
    expect(game.S.msgs.find((m) => m.id === job.id && m.kind === 'job')!).toMatchObject({ answered: true })
    // даже прямой вызов после печати — долг не растёт
    await game.job()
    const job2 = [...game.S.msgs].reverse().find((m) => m.kind === 'job' && !m.answered)
    if (job2 && job2.kind === 'job') await game.answerJob(job2.id, true)
    expect(game.S.debt).toBe(sealed)
    await game.transfer()
    expect(game.S.debt).toBe(sealed)
    expect(game.S.money).toBe(money) // перевод тоже без эффекта
    expect(game.adjustDebt(1000)).toBe(false)
    expect(game.S.debt).toBe(sealed)
  })
})

describe('День выплаты: дедлайн-предохранитель (#1119, вариант 2+4)', () => {
  const flat = (g: Game) => g.open(ANNOUNCE).map((l) => (typeof l === 'string' ? l : (l as { t: string }).t))

  it('медленная партия без арок и 150 сообщений доходит до анонса дедлайном к 410–412 дню', async () => {
    const { game } = makeGame()
    game.S.day = 427
    game.S.stats.sent = 0
    for (let i = 0; i < 3; i++) expect((await game.fire('StoryBeat'))?.name ?? '').not.toMatch(/^Beat_Payday/)
    game.nextDay(1) // 428: подводка дедлайна стартует без условий и метит капитуляцию
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_Deadline')
    expect(game.S.mem['payday.signs']).toBe(1)
    expect(game.S.mem['payday.surrender']).toBe(true)
    game.nextDay(1)
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_PaydayLead_Second')
    expect(game.S.mem['payday.signs']).toBe(2)
    game.nextDay(2) // 430: безусловный запуск
    expect((await game.fire('StoryBeat'))?.name).toBe('Beat_Payday_Deadline')
    expect(game.S.scene?.id).toBe('payday')
    expect(game.S.ach.payday).toBeDefined()
  })

  it('кожа капитуляции: с фактом анонс отдаёт «терпение кончилось», без факта — обычные строки', () => {
    const { game } = makeGame()
    game.S.mem['payday.surrender'] = true
    const skins = flat(game)
    expect(skins).toHaveLength(1)
    expect(skins[0]).toContain('терпение кончилось')
    delete game.S.mem['payday.surrender']
    const usual = flat(game)
    expect(usual.some((t) => t.includes('терпение кончилось'))).toBe(false)
    expect(usual.length).toBeGreaterThan(0)
  })
})
