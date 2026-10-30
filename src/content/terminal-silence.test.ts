// Терминальные эпилоги обещают полную тишину после своего экрана (#1585): «Вендетта» (#1556) и
// «Кровный враг» (#1571) закрывают мир событиями AlikTurn, но суточная реплика Алика, хор родни и
// «удалёнки» идут своими каналами. Каждая проверка сначала доказывает, что канал живой до экрана,
// и только потом требует тишины после него: иначе «после» проверяло бы пустой пул, а не гейт.
import { describe, expect, it } from 'vitest'
import { makeGame, flush } from '../test/helpers'
import { ENDGAME_BLOODFEUD_FORMALITIES, ENDGAME_VENDETTA_FORMALITIES } from './endgame'
import { CHRONIC_RUDE_AFTER_VENDETTA, ENDING_MIN_DAY } from './finales'
import type { Game } from '../engine/game'

const alikTexts = (game: Game) => game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'alik')
const deleted = (game: Game) => game.S.msgs.filter((m) => m.kind === 'text' && m.deleted)
const lifeCards = (game: Game) => game.S.msgs.filter((m) => m.kind === 'card' && m.event === 'life')

/** Карточка мирной жизни выходит — производитель randomNotif жив до экрана; иначе проверка после пустеет. */
function proveLifeCards(game: Game): number {
  for (let i = 0; i < 200; i++) {
    game.randomNotif()
    if (lifeCards(game).length) break
  }
  return lifeCards(game).length
}

/** Экран «Вендетты» сыгран и закрыт — партия в терминальном эпилоге вражды. */
async function enterVendetta(game: Game): Promise<void> {
  game.S.mem.vendetta = true
  game.S.day = ENDING_MIN_DAY
  await game.fire('CheckEnding')
  expect(game.S.ending, 'экран «Вендетты»').toBe('vendetta')
  await game.closeEnding()
  await flush()
}

/** Экран «Кровного врага» сыгран и закрыт — партия в терминальном эпилоге отлучения. */
async function enterBloodfeud(game: Game): Promise<void> {
  game.S.mem.vendetta = true
  game.S.mem['count.rudeAfterVendetta'] = CHRONIC_RUDE_AFTER_VENDETTA
  await game.fire('CheckEnding')
  expect(game.S.ending, 'экран «Кровного врага»').toBe('bloodfeud')
  await game.closeEnding()
  await flush()
}

const TERMINALS = [
  { suffix: 'Vendetta', title: 'Вендетта', formalities: ENDGAME_VENDETTA_FORMALITIES, enter: enterVendetta },
  { suffix: 'Bloodfeud', title: 'Кровный враг', formalities: ENDGAME_BLOODFEUD_FORMALITIES, enter: enterBloodfeud },
] as const

/** Перерыв суточной реплики и хора — 12 ходов; шаг больше, чтобы следующий вызов снова был кандидатом. */
const RULE_TURNS = 13

describe('терминальные эпилоги держат полную тишину (#1585)', () => {
  it.each(TERMINALS)('«$title»: суточная реплика Алика молчит после экрана', async ({ suffix, enter }) => {
    const { game } = makeGame({ seed: 11 })
    let spoke = false
    for (let i = 0; i < 60 && !spoke; i++) {
      const before = alikTexts(game).length
      await game.fire('PeriodLine')
      spoke = alikTexts(game).length > before
      game.S.stats.sent += RULE_TURNS
    }
    expect(spoke, 'PeriodLine не звучит и до экрана — проверка после пустеет').toBe(true)

    await enter(game)
    // глушить есть кого: условия суточной реплики выполнены и перерыв выдержан — гасит её тишина эпилога
    const period = game.rules.rules('PeriodLine').find((r) => r.name === 'PeriodLine')
    expect(period, 'суточная реплика — правило').toBeDefined()
    expect(period!.when.filter((c) => !game.holds(c)), 'условия суточной реплики выполнены').toEqual([])
    for (let i = 0; i < 8; i++) {
      const before = alikTexts(game).length
      const r = await game.fire('PeriodLine')
      expect(r?.name, 'суточную реплику гасит терминальная тишина').toBe(`Quiet_Terminal_${suffix}_PeriodLine`)
      expect(alikTexts(game).length, 'после экрана Алик не пишет').toBe(before)
      game.S.stats.sent += RULE_TURNS
    }
  })

  it.each(TERMINALS)('«$title»: хор родни молчит, хотя говорить ему есть кому', async ({ suffix, enter }) => {
    const { game } = makeGame({ seed: 5 })
    game.S.mem['intro.samvel'] = true
    let spoke = false
    for (let i = 0; i < 60 && !spoke; i++) {
      await game.fire('Mentioned', {}, { target: 'samvel' })
      spoke = game.S.msgs.some((m) => m.kind === 'text' && m.who === 'samvel')
      game.S.stats.sent += RULE_TURNS
    }
    expect(spoke, 'хор не звучит и до экрана — проверка после пустеет').toBe(true)

    await enter(game)
    // глушить есть кого: хор Самвела проходит свои условия и перерыв выдержан, а говорит тишина эпилога
    const chorus = game.rules.rules('Mentioned').find((r) => r.name === 'Chorus_samvel')
    expect(chorus, 'хор Самвела — правило с пулом').toBeDefined()
    expect(chorus!.when.filter((c) => !game.holds(c)), 'условия хора выполнены').toEqual([])
    const before = game.S.msgs.length
    const r = await game.fire('Mentioned', {}, { target: 'samvel' })
    expect(r?.name, 'хор родни гасит терминальная тишина').toBe(`Quiet_Terminal_${suffix}_Mentioned`)
    expect(game.S.msgs.slice(before), 'родня в терминальном эпилоге не пишет').toEqual([])
  })

  it.each(TERMINALS)('«$title»: «удалённое» сообщение не появляется', async ({ enter }) => {
    const { game } = makeGame({ seed: 3 })
    await game.deletedMsg()
    expect(deleted(game).length, '«удалёнка» не звучит и до экрана — проверка после пустеет').toBe(1)

    await enter(game)
    const before = game.S.msgs.length
    await game.deletedMsg()
    expect(game.S.msgs.slice(before), 'после экрана «удалёнок» нет').toEqual([])
  })

  it.each(TERMINALS)('«$title»: ход отдаёт только колоду эпилога', async ({ formalities, enter }) => {
    const { game } = makeGame({ seed: 7 })
    game.S.mem['intro.samvel'] = true
    await enter(game)
    const pool = new Set<string>(formalities)
    for (let i = 0; i < 8; i++) {
      const before = game.S.msgs.length
      await game.turnRoll()
      for (const m of game.S.msgs.slice(before)) {
        if (m.kind !== 'text') continue
        expect(m.who, 'родня в терминальном эпилоге не пишет').toBeUndefined()
        expect(pool.has(m.text), 'реплика Алика — из колоды эпилога').toBe(true)
      }
      game.S.stats.sent += RULE_TURNS
    }
  })

  // гейт стоит на терминальных фактах, а не на всём эндгейме: в выплате Алик жив и его реплики — формальности
  it('обычный эпилог выплаты не заглушён: суточная реплика там звучит', async () => {
    const { game } = makeGame({ seed: 11 })
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    await game.closeEnding()
    await flush()
    expect(game.S.mem['endgame.active'], 'эндгейм выплаты').toBe(true)
    expect([game.S.mem['endgame.vendetta'], game.S.mem['endgame.bloodfeud']], 'терминальных фактов нет').toEqual([undefined, undefined])

    let spoke = false
    for (let i = 0; i < 60 && !spoke; i++) {
      const before = alikTexts(game).length
      await game.fire('PeriodLine')
      spoke = alikTexts(game).length > before
      game.S.stats.sent += RULE_TURNS
    }
    expect(spoke, 'тишина терминальных эпилогов не распространяется на выплату').toBe(true)
  })
})

// #1614: терминальный эпилог запечатан и для телефона. randomNotif — единственный производитель мирных
// карточек (`event: 'life'`); его зовёт шанс хода 12% и Idle_Notif, и в замороженном мире на 268 ходов
// это давало 30 карточек при почти нулевом знаменателе реплик (notif_share 0,42–0,60 при лимите 0,25).
describe('терминальный эпилог молчит и в телефоне (#1614)', () => {
  it.each(TERMINALS)('«$title»: мирная карточка телефона не выходит после экрана', async ({ enter }) => {
    const { game } = makeGame({ seed: 13 })
    expect(proveLifeCards(game), 'randomNotif молчит и до экрана — проверка после пустеет').toBeGreaterThan(0)

    await enter(game)
    const before = game.S.msgs.length
    for (let i = 0; i < 300; i++) game.randomNotif()
    expect(game.S.msgs.slice(before), 'мирная карточка телефона пережила терминальный экран').toEqual([])
  })

  // тишина эпилога — про мир Алика, а не про устройство игрока: батарея и непрочитанные остаются
  it.each(TERMINALS)('«$title»: батарея и непрочитанные живут', async ({ enter }) => {
    const { game } = makeGame({ seed: 3 })
    await enter(game)
    expect(game.notify('⚠️', 'Система', 'Низкий заряд батареи: 19%', { event: 'battery' }), 'батарею заглушила тишина эпилога').toBe(true)
    expect(game.ui.notif?.app, 'баннер батареи не показан').toBe('Система')
    game.dismissNotif()
    expect(game.notify('💬', 'Алик Воздухонесян', '5 новых сообщений', { event: 'unread' }), 'непрочитанные заглушила тишина эпилога').toBe(true)
    expect(game.ui.notif?.app, 'баннер непрочитанных не показан').toBe('Алик Воздухонесян')
  })

  // гейт стоит на терминальных фактах, а не на всём эндгейме: нейтральный эпилог выплаты телефон не глушит
  it('обычный эпилог выплаты не заглушён: мирные карточки телефона там выходят', async () => {
    const { game } = makeGame({ seed: 13 })
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    await game.closeEnding()
    await flush()
    expect(game.S.mem['endgame.active'], 'эндгейм выплаты').toBe(true)
    expect([game.S.mem['endgame.vendetta'], game.S.mem['endgame.bloodfeud']], 'терминальных фактов нет').toEqual([undefined, undefined])
    expect(proveLifeCards(game), 'тишина терминальных эпилогов распространилась на выплату').toBeGreaterThan(0)
  })
})
