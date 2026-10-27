// Баран Борис после бартера (#1001, заметка 15 живой рецензии №3): реплики о его месте ветвятся по
// факту `has.boris` — баран живёт у игрока, а сметы, квитанции и уход болеют у Алика только в прошлом.
// Без факта — как раньше. Производители настоящие: серии — `playArc`, ход болезни — `AlikTurn`,
// пулы — тот же фильтр `isOpen`, которым их рисует колода.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import type { Game } from '../engine/game'
import { LEGENDS } from './legends'
import { PROMISE_DUE, meet } from './world'
import { DELETED } from './life'
import { D } from './excuses'
import { spec, type Entry } from './fact'
import { borisSmetaReady } from './memkeys'

/** Единственный производитель `has.boris` — товар барахолки (scenes.ts, «баран Борис»). */
const giveBoris = (game: Game) => game.S.items.push('баран Борис')

/** Серии арки: у Алика (баран у него) и у игрока (после бартера) — свои формулировки одного и того же события. */
const EPISODES = {
  ill: {
    ep: 1,
    home: 'Борис заболел. Съел смету. Всю.',
    player: 'Борис заболел. Смету он доел ещё у меня, а икается тебе. Привет ему передавай.',
  },
  receipts: {
    ep: 2,
    home: 'Борису лучше. Но теперь он ест только квитанции.',
    player: 'Борису лучше. Он теперь ест только квитанции. Мои доел ещё у меня.',
  },
  wedding: {
    ep: 4,
    home: 'Борис влюбился. В козу тёти Гоар. Родня против: невеста с биографией.',
    player: 'Борис влюбился. В козу Гоар. Ты ему не мешай — он у тебя теперь, но сердце здесь.',
  },
} as const

describe('серии арки про Бориса: место барана — в формулировке серии (#1001)', () => {
  it.each(Object.entries(EPISODES))('%s: при has.boris звучит вариант игрока, без факта — вариант Алика', async (_name, v) => {
    for (const owner of [false, true]) {
      const { game } = makeGame()
      if (owner) giveBoris(game)
      for (let i = 0; i <= v.ep; i++) await game.playArc('boris') // до нужной серии включительно
      const said = alikTexts(game.S.msgs)
      const where = `серия ${v.ep + 1}, ${owner ? 'баран у игрока' : 'баран у Алика'}`
      expect(said, `${where}: серии не было — проверка пустеет`).toContain(owner ? v.player : v.home)
      expect(said, `${where}: прозвучала чужая формулировка`).not.toContain(owner ? v.home : v.player)
    }
  })
})

describe('легенда про смету: от кого прячут и кто доел (#1001)', () => {
  const HOME = 'Новую смету составили — Борис посмотрел на неё с интересом. Спрятали в сейф. На всякий случай.'
  const PLAYER = 'Новую смету составили — и сразу в сейф, от греха. Твой Борис у тебя, а смету я всё равно прячу.'
  const open = (game: Game) => game.open(LEGENDS.boris_smeta.lines).map((l) => spec(l).t)

  it('«спрятали в сейф» говорит хозяин барана; без факта — как раньше', () => {
    const atAlik = makeGame().game
    expect(open(atAlik), 'без факта реплики Алика нет').toContain(HOME)
    expect(open(atAlik), 'без факта реплика игрока не звучит').not.toContain(PLAYER)
    const atPlayer = makeGame().game
    giveBoris(atPlayer)
    expect(open(atPlayer), 'при баране у игрока реплики Алика нет').not.toContain(HOME)
    expect(open(atPlayer), 'при баране у игрока своя формулировка молчит').toContain(PLAYER)
  })

  it('вариант игрока составляет смету тем же фактом, что и вариант Алика (#586)', async () => {
    const { game } = makeGame()
    giveBoris(game)
    const p = game.linePicked('LEG_boris_smeta', LEGENDS.boris_smeta.lines)
    expect(p?.text, 'легенда сказала чужую формулировку').toBe(PLAYER)
    expect(game.S.mem[borisSmetaReady], 'реплика не поставила факт готовой сметы').toBe(true)
  })

  it('без сметы: у игрока — «смету Борис доел ещё у меня», у Алика — «а смету Борис съел»', () => {
    const atAlik = makeGame().game
    const player = makeGame().game
    giveBoris(player)
    const noSmeta = (game: Game) => open(game).filter((t) => t.startsWith('Без сметы'))
    expect(noSmeta(atAlik), 'нет реплики Алика про съеденную смету — проверка пустеет').toHaveLength(1)
    expect(noSmeta(atAlik)[0]).toContain('А смету Борис съел')
    expect(noSmeta(player)[0], 'смета съедена у игрока, а сказано как у Алика').toContain('Смету твой Борис доел ещё у меня')
  })

  it('переспросы про хранение сметы: «Борис везде» — у Алика, у игрока — про его сейф', () => {
    const pairs = (game: Game) => game.open(LEGENDS.boris_smeta.talk!).map((p) => p[1])
    const atAlik = pairs(makeGame().game)
    expect(atAlik).toContain('А где её хранить? Борис везде. Он в бухгалтерии, в прорабской, в сердце.')
    const atPlayer = (() => { const { game } = makeGame(); giveBoris(game); return pairs(game) })()
    expect(atPlayer, '«Борис везде» звучит при баране у игрока').not.toContain('А где её хранить? Борис везде. Он в бухгалтерии, в прорабской, в сердце.')
    expect(atPlayer, 'у игрока нет своей пары').toContain('В сейфе. У меня он замок съел, у тебя сейф ещё целый — береги.')
  })
})

describe('одиночные реплики про Бориса: место барана (#1001)', () => {
  /** Реплики ухода за больным бараном: «я с ним сижу» — только когда он у Алика. */
  const SICK_HOME = ['Борис кашляет. Я с ним сижу. Какие деньги, брат, тут баран болеет.', 'Борис съел градусник. Температуру теперь не узнать.', 'Борис лежит, смотрит на Арарат. Я смотрю на Бориса. Ты смотришь в телефон. Все при деле.']
  const SICK_PLAYER = ['Твой Борис болеет. Я приехал, сижу рядом. Он у тебя, а мне всё равно тревожно.', 'Он и градусник съел. Твой уже. Я свой успел спрятать.', 'Борис лежит, смотрит на Арарат. Ты на Бориса, я на телефон. Все при деле, только деньги не при деле.']

  it('ход болезни говорит за тем, у кого баран живёт', async () => {
    for (const owner of [false, true]) {
      const { game } = makeGame()
      if (owner) giveBoris(game)
      game.S.arcs.boris = { i: EPISODES.ill.ep, last: 0 }
      await game.playArc('boris') // серия болезни ставит состояние на доске барана
      expect(game.S.actors.boris.sick, 'состояние болезни не поставлено — проверка пустеет').toBe(true)
      const seen = new Set<string>()
      // Пулы болезни: по четыре реплики на владельца (три ухода + ветеринар). Собираем весь пул:
      // выбор двух «первых попавшихся» зависел от порядка розыгрыша, а не от места барана (#1420).
      for (let i = 0; i < 250 && seen.size < 4; i++) {
        game.S.stats.sent += 4 // перерыв правила — в ходах
        game.S.scene = null // сцена подняла бы порог приоритета и заглушила ходы
        const from = game.S.msgs.length
        if ((await game.fire('AlikTurn'))?.name === 'Turn_BorisSick') for (const t of alikTexts(game.S.msgs.slice(from))) seen.add(t)
      }
      const where = owner ? 'баран у игрока' : 'баран у Алика'
      expect(seen.size, `${where}: собраны не все реплики пула болезни`).toBe(4)
      expect([...seen], `${where}: ход болезни ни разу не прозвучал`).toContain('Ветеринар сказал: Борису нужен покой и твоё терпение.')
      // не пустая проверка: уход за бараном (своя формулировка) обязан прозвучать — иначе запрет ниже ничего не проверяет
      const own = owner ? SICK_PLAYER : SICK_HOME
      expect([...seen].some((t) => own.includes(t)), `${where}: ни одной реплики ухода — проверка пустеет`).toBe(true)
      for (const t of seen) {
        if (owner) expect(SICK_HOME, `${where}: «${t}» — уход у Алика`).not.toContain(t)
        else expect(SICK_PLAYER, `${where}: «${t}» — уход у игрока`).not.toContain(t)
      }
    }
  })

  it('записка о сроке: у игрока доживёт, у Алика её съест Борис', () => {
    const line = (game: Game) => game.open(PROMISE_DUE).find((t) => t.startsWith('помнишь «{t}»? Я помню'))
    const atAlik = makeGame().game
    atAlik.S.arcs.boris = { i: 1, last: 0 } // Борис в истории: пул срока про него и открыт
    expect(atAlik.facts()['has.boris']).toBe(false)
    expect(line(atAlik), 'без факта реплики про съеденную бумажку нет').toContain('Бумажку съел Борис')
    const atPlayer = makeGame().game
    atPlayer.S.arcs.boris = { i: 1, last: 0 }
    giveBoris(atPlayer)
    expect(line(atPlayer), 'при баране у игрока бумажка «съедена»').not.toContain('Бумажку съел Борис')
    expect(line(atPlayer), 'у игрока нет своей формулировки').toContain('Теперь Борис у тебя — записка доживёт')
  })

  it('удалённая реплика: «не ешь квитанции» адресовано хозяину барана', () => {
    const line = (game: Game) => game.open(DELETED).find((t) => t.startsWith('Борис, не ешь квитанции'))
    const { game: atAlik } = makeGame()
    atAlik.S.arcs.boris = { i: 3, last: 0 }
    expect(line(atAlik), 'без факта реплики про квитанции нет').toBe('Борис, не ешь квитанции')
    const { game: atPlayer } = makeGame()
    atPlayer.S.arcs.boris = { i: 3, last: 0 }
    giveBoris(atPlayer)
    expect(line(atPlayer), 'при баране у игрока реплика осталась прежней').not.toBe('Борис, не ешь квитанции')
    expect(line(atPlayer), 'у игрока нет своей формулировки').toContain('Мои уже съедены')
  })
})

describe('квитанции Бориса не зовут вещи игрока (#1193)', () => {
  const UNINTRODUCED = ['Твои тоже съел', 'проверь свои']

  it('серия называет диету барана, а не съеденные квитанции игрока', async () => {
    for (const owner of [false, true]) {
      const { game } = makeGame()
      if (owner) giveBoris(game)
      for (let i = 0; i < 3; i++) await game.playArc('boris')
      const said = alikTexts(game.S.msgs)
      const line = said.find((t) => t.includes('ест только квитанции'))
      const where = owner ? 'баран у игрока' : 'баран у Алика'
      expect(line, `${where}: серии не было — проверка пустеет`).toBeTruthy()
      for (const bit of UNINTRODUCED) expect(line, 'ссылка на не введённое').not.toContain(bit)
    }
  })
})

describe('клятва «Чтоб мой баран не проснулся»: «мой» — только пока баран у Алика (#1162)', () => {
  const OATH = 'Чтоб мой баран не проснулся'
  /** Пул клятв — тем же `eligible`, которым его тянет генератор отмазок. */
  const open = (game: Game) => game.lines.eligible('OATH', D.OATH as Entry<string>[], game.lineFacts()).map((p) => p.text)
  /** Барана назвали вслух — клятва про него открыта (тот же факт, что ставит `meet('baran')`). */
  const heardBaran = (game: Game) => game.rules.applyOps(meet('baran'), {})

  it('пока баран у Алика клятва звучит, после бартера — молчит', () => {
    const atAlik = makeGame().game
    heardBaran(atAlik)
    expect(atAlik.facts()['has.boris'], 'факт владения выставлен не тем — проверка пустеет').toBe(false)
    expect(open(atAlik), 'клятвы «мой баран» нет у самого хозяина — проверка пустеет').toContain(OATH)
    const atPlayer = makeGame().game
    heardBaran(atPlayer)
    giveBoris(atPlayer)
    expect(open(atPlayer), 'при баране у игрока клятва называет его Аликовым').not.toContain(OATH)
    expect(open(atPlayer).length, 'пул клятв опустел — проверка пустеет').toBeGreaterThan(20)
  })
})
