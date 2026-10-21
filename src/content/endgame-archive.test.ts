// Архив дела (docs/design/endgame.md): ранние реплики эндгейма называют закрытый факт этой партии,
// каждый факт звучит на всю группу один раз, пустая партия с первой реплики говорит общим пулом.
import { describe, it, expect } from 'vitest'
import { makeGame, flush, alikTexts } from '../test/helpers'
import {
  ENDGAME_ARCH, ENDGAME_ARCH_LIE, ENDGAME_FALLBACK, ENDGAME_FORMALITIES, ENDGAME_INTRO, ENDGAME_LEAVE,
  ENDGAME_MONEY, ENDGAME_OPEN, ENDGAME_VENDETTA, LEND50_ASK, LEND50_ASK_AGAIN, LEND50_MEMORY,
  LEND50_NO, LEND50_NUNE, LEND50_SERIOUS, LEND50_SERIOUS_ELSE, LEND50_YES, ENDGAME_ALIK_BACK, ENDGAME_RETURNER_LINES,
  ARCHIVE_FRESH_DAYS,
} from './endgame'
import { ARCS } from './arcs'
import { FINALES, DEFAULT_FINALE } from './finales'
import { MEMORY } from './memory'
import { CLAIMS, claimByKey } from './lies'
import { during, set, saidText } from './fact'
import { Gated, valueOf } from '../engine/rules'
import { alikShaved, caughtAt, intro, moustacheKept, taxFrozen } from './memkeys'
import type { ClaimKey } from './ids'
import type { Game } from '../engine/game'

/** Реплика архива по slug: тест утверждает ту строку, которую объявил свой гейт. */
const archiveText = (slug: string): string => {
  const found = ENDGAME_ARCH.find((e) => valueOf(e).slug === slug)
  expect(found, slug).toBeDefined()
  return saidText(valueOf(found!).line)
}
/** Все строки значения (включая вложенные gate) — для проверки на общие куски. */
const textsOf = (v: unknown): string[] => {
  if (typeof v === 'string') return [v]
  if (v instanceof Gated) return textsOf(v.v)
  if (Array.isArray(v)) return v.flatMap(textsOf)
  if (v && typeof v === 'object') return Object.entries(v as Record<string, unknown>)
    .filter(([k]) => !['when', 'orWhen', 'remember', 'claims', 'slug', 'updates', 'fx'].includes(k))
    .flatMap(([, x]) => (x && typeof x === 'object' && 't' in (x as object) ? [String((x as { t: unknown }).t)] : textsOf(x)))
  return []
}

const alikCount = (game: Game): number => alikTexts(game.S.msgs).length
/** Новые реплики Алика после `from`. */
const since = (game: Game, from: number): string[] => alikTexts(game.S.msgs).slice(from)

/** На день после окна свежести (#832): финал в окне держится все 10 дней включительно. */
const PAST_WINDOW = ARCHIVE_FRESH_DAYS + 1

/** Реплики вступления и просьбы «займи 50»: группа ещё говорит не от себя. */
const OPENING = new Set([
  ...ENDGAME_OPEN, ...Object.values(ENDGAME_INTRO), ENDGAME_VENDETTA, ENDGAME_FALLBACK,
  ...LEND50_ASK, ...LEND50_ASK_AGAIN, valueOf(LEND50_SERIOUS), LEND50_SERIOUS_ELSE, LEND50_YES, ...LEND50_NO, LEND50_NUNE, ...LEND50_MEMORY,
])

/**
 * День выплаты закрыт и просьба отвечена — как это видит игрок. Группа сразу говорит первую
 * формальность (StoryBeat после ответа): она и есть ранняя реплика формальности.
 */
async function enterGroup(game: Game): Promise<string> {
  const from = alikCount(game)
  game.S.mem.payday = 'default'
  game.S.ending = 'payday_default'
  game.S.endings['payday_default'] = game.S.day
  await game.closeEnding()
  await flush()
  await game.send(game.choices.find((c) => c.act === 'lend50Serious')!)
  const early = since(game, from).find((t) => !OPENING.has(t))
  expect(early, 'первая формальность группы').toBeDefined()
  return early!
}
/** Ответ кнопки и всё, что группа сказала следом за ходом игрока (своя формальность). */
const act = async (game: Game, what: 'endgameMoney' | 'endgameLeave'): Promise<{ reply: string; after: string[] }> => {
  const from = alikCount(game)
  await game.send(game.choices.find((c) => c.act === what)!)
  const after = since(game, from)
  // на выходе первой слышит реплику возвращателя, а предлог говорит Алик
  const back = [...ENDGAME_ALIK_BACK, ...Object.values(ENDGAME_RETURNER_LINES).flat()]
  return { reply: after.find((t) => !back.includes(t))!, after }
}

const toLast = (game: Game, id: string) => { game.S.arcs[id] = { i: ARCS[id].eps.length - 1, last: -99 } }

/** Алик сказал две несовместимые версии — игрок поймал его кнопкой. */
const throwLie = async (game: Game, oldKey: ClaimKey, newKey: ClaimKey): Promise<void> => {
  const [a, b] = [claimByKey(oldKey)!, claimByKey(newKey)!]
  game.alikMsg({ kind: 'text', from: 'alik', text: `Значит, ${a.say}.` }, [oldKey])
  game.alikMsg({ kind: 'text', from: 'alik', text: `Точнее, ${b.say}.` }, [newKey])
  expect(game.facts().lieOpen).toBe(true)
  await game.send({ text: `Стоп. Так ${a.say} или ${b.say}?`, tone: 'neutral', act: 'catchLie' })
  expect(game.S.ledger.episodes[0].status, 'поимка кнопкой').toBe('caught')
}
/** Спасённая ставка: запись обещания и факт, который пишет исполнение ставки. */
const stakeKept = (game: Game): void => {
  game.S.promises.push({ t: 'отдам всё завтра', made: game.S.day - 1, due: game.S.day, stake: 'moustache', stakeDone: true, kept: true })
  game.rules.applyOps([set(moustacheKept, true)], {})
}

describe('архив дела: корпус', () => {
  it('у каждого значения finale.* — своя строка, и никакой лишней', () => {
    const arcs = new Set([...Object.keys(FINALES), ...Object.keys(DEFAULT_FINALE)])
    const declared = new Set(ENDGAME_ARCH.flatMap((e) => (e instanceof Gated ? e.when : []).map((c) => `${c.key}==${String(c.value)}`)))
    const slugs = ENDGAME_ARCH.map((e) => valueOf(e).slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const arc of arcs) {
      for (const value of [...(FINALES[arc] ?? []).map((f) => f.id), 'default']) {
        expect(declared, `${arc}.${value}: значения без строки`).toContain(`finale.${arc}==${value}`)
      }
    }
    // каждой ссылке финала — её собственный факт: slug и гейт не расходятся
    for (const slug of slugs.filter((s) => s.startsWith('fin.'))) {
      const [, arc, value] = slug.split('.')
      expect(declared, `${slug}: строке нужен свой факт`).toContain(`finale.${arc}==${value}`)
    }
    expect(slugs).toContain('stake.shaved')
    expect(slugs).toContain('stake.kept')
    expect(ENDGAME_ARCH_LIE.length).toBeGreaterThanOrEqual(4)
  })

  it('архив не повторяет «как там…?», финалы и память: ни одного общего куска', () => {
    const known = [
      ...Object.values(FINALES).flat().flatMap((f) => [...f.done.flatMap(textsOf), ...f.m.flatMap(textsOf), ...textsOf(f.sys)]),
      ...MEMORY.flatMap(textsOf),
      ...Object.values(DEFAULT_FINALE),
    ]
    const mine = [...ENDGAME_ARCH.map((e) => saidText(valueOf(e).line)), ...ENDGAME_ARCH_LIE]
    const where = new Map<string, Set<string>>()
    for (const [name, pool] of [['known', known], ['arch', mine]] as const) {
      for (const line of pool) for (let i = 0; i + 30 <= line.length; i++) {
        const piece = line.slice(i, i + 30)
        where.set(piece, new Set([...(where.get(piece) ?? []), name]))
      }
    }
    const shared = [...where].filter(([, names]) => names.size > 1)
    expect(shared.map(([piece, names]) => `«${piece}» — ${[...names].join('/')}`).join('\n')).toBe('')
  })
})

describe('архив дела: ранние реплики называют свою партию', () => {
  it('финал, поимка и ставка партии звучат по разу и не совпадают с другой партией', async () => {
    const partyA = makeGame().game
    partyA.S.day = 300
    partyA.S.mem['asked.boris'] = 6
    partyA.S.ach.heir = 190
    toLast(partyA, 'boris')
    await partyA.playArc('boris')
    toLast(partyA, 'grandpa')
    await partyA.playArc('grandpa')
    expect(partyA.S.mem['finale.boris']).toBe('brigadir')
    expect(partyA.S.mem['finale.grandpa']).toBe('revoke')
    await throwLie(partyA, 'money_dubai', 'money_noah')
    stakeKept(partyA)
    partyA.S.day += PAST_WINDOW // финалы старше окна: архив рассказывает их как новости группы
    const aForm = await enterGroup(partyA)
    const aMoney = await act(partyA, 'endgameMoney')
    const aLeave = await act(partyA, 'endgameLeave')

    const partyB = makeGame().game
    partyB.S.day = 300
    partyB.S.ach.saint = 190
    partyB.S.ach.wife = 190
    toLast(partyB, 'samvel')
    await partyB.playArc('samvel')
    toLast(partyB, 'rubik')
    await partyB.playArc('rubik')
    expect(partyB.S.mem['finale.samvel']).toBe('groom')
    expect(partyB.S.mem['finale.rubik']).toBe('karine')
    await throwLie(partyB, 'money_jar', 'money_wall')
    partyB.S.ach.shaved = partyB.S.day
    partyB.S.day += PAST_WINDOW // как и у partyA: финалы старше окна свежести
    const bForm = await enterGroup(partyB)
    const bMoney = await act(partyB, 'endgameMoney')
    const bLeave = await act(partyB, 'endgameLeave')

    // формальность берёт поимку — с say обеих версий этой партии
    for (const [line, oldKey, newKey] of [[aForm, 'money_dubai', 'money_noah'], [bForm, 'money_jar', 'money_wall']] as const) {
      expect(line).toContain(claimByKey(oldKey)!.say)
      expect(line).toContain(claimByKey(newKey)!.say)
    }
    // остальные факты партии занимают три поверхности — каждый один раз, и общего пула в них нет
    const aRest = [aMoney.reply, aMoney.after.at(-1)!, aLeave.reply].sort()
    const bRest = [bMoney.reply, bMoney.after.at(-1)!, bLeave.reply].sort()
    expect(aRest).toEqual([archiveText('fin.boris.brigadir'), archiveText('fin.grandpa.revoke'), archiveText('stake.kept')].sort())
    expect(bRest).toEqual([archiveText('fin.samvel.groom'), archiveText('fin.rubik.karine'), archiveText('stake.shaved')].sort())
    expect(ENDGAME_MONEY.map(valueOf).map(saidText)).not.toContain(aMoney.reply)
    expect(ENDGAME_LEAVE).not.toContain(aLeave.reply)
    // партии с разными проигранными финалами не говорят одно и то же
    expect(aRest).not.toEqual(bRest)
    expect(String(partyA.S.mem['endgame.arch']).split(',')).toHaveLength(4)
    expect(String(partyB.S.mem['endgame.arch']).split(',')).toHaveLength(4)
  })

  it('партия без финала, поимки и ставки с первой реплики говорит общим пулом', async () => {
    const { game } = makeGame()
    const form = await enterGroup(game)
    expect(ENDGAME_FORMALITIES).toContain(form)
    const money = await act(game, 'endgameMoney')
    expect(ENDGAME_MONEY.map(valueOf).map(saidText)).toContain(money.reply)
    const leave = await act(game, 'endgameLeave')
    expect(ENDGAME_LEAVE).toContain(leave.reply)
  })

  it('NC: без архива ранняя реплика снова из общего пула — проверка «называет факт партии» краснеет', async () => {
    const party = async (): Promise<Game> => {
      const game = makeGame().game
      game.S.day = 300
      game.S.mem['asked.boris'] = 6
      toLast(game, 'boris')
      await game.playArc('boris')
      game.S.day += PAST_WINDOW // финал старше окна свежести: архив имеет право рассказать его
      return game
    }
    const archived = await party()
    expect(await enterGroup(archived)).toBe(archiveText('fin.boris.brigadir'))

    const blind = await party()
    blind.archiveLine = () => null // правка снимает архив — ранняя реплика обязана вернуться к общему пулу
    expect(await enterGroup(blind)).not.toBe(archiveText('fin.boris.brigadir'))
  })
})

describe('архив дела: пойманное враньё', () => {
  it('поимка кнопкой игрока — реплика с say обеих версий', async () => {
    const { game } = makeGame()
    await throwLie(game, 'money_dubai', 'money_noah')
    // поимка старше окна свежести (#777): придержка про свежесть, а не про сам факт поимки
    game.S.day += ARCHIVE_FRESH_DAYS
    const line = await enterGroup(game)
    expect(line).toContain(CLAIMS.find((c) => c.key === 'money_dubai')!.say)
    expect(line).toContain(CLAIMS.find((c) => c.key === 'money_noah')!.say)
  })

  it('открытый эпизод реплики не даёт: только статус caught', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Значит, деньги в Дубае.' }, ['money_dubai' as ClaimKey])
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Точнее, деньги у Ноя.' }, ['money_noah' as ClaimKey])
    expect(game.S.ledger.episodes[0].status).toBe('open')
    expect(await enterGroup(game)).not.toContain(claimByKey('money_dubai')!.say)
  })
})

describe('архив дела: свежая поимка — не новость (#777)', () => {
  // Поимка за день-два до выплаты (плейтест 49: «Мешок мелочи» — поимка прямо перед Днём выплаты)
  // означала, что группа объявляла её новостью сразу после концовки. Тот же класс, что свежий финал
  // (#771): строка о вранье моложе ARCHIVE_FRESH_DAYS придерживается, её место занимает другой факт.
  /** Партия с поимкой в день `at`, группа открыта в день `open`. */
  const party = async (at: number, open: number): Promise<Game> => {
    const { game } = makeGame()
    game.S.day = at
    await throwLie(game, 'money_dubai', 'money_noah')
    expect(game.S.mem[caughtAt], 'день поимки записан самой поимкой').toBe(at)
    game.S.day = open
    return game
  }
  /** Реплика группы называет пойманное враньё этой партии. */
  const namesLie = (line: string): boolean => line.includes(claimByKey('money_dubai')!.say)

  it('поимка в окне свежести придерживается, а после окна звучит', async () => {
    const game = await party(290, 295) // поимка была днями раньше, но ближе окна
    const from = alikCount(game)
    expect(namesLie(await enterGroup(game)), 'свежая поимка придерживается').toBe(false)
    expect(since(game, from).some(namesLie), 'ни одной строки lie.*').toBe(false)
    // строка не потеряна: окно прошло — архив рассказывает поимку как прежде
    const mid = alikCount(game)
    game.S.day += ARCHIVE_FRESH_DAYS
    await game.endgameFormality()
    expect(since(game, mid).some(namesLie)).toBe(true)
  })

  it('НС: поимка старше окна группа объявляет сразу — придержка про свежесть, не про всегда', async () => {
    const game = await party(285, 300)
    expect(namesLie(await enterGroup(game))).toBe(true)
  })

  it('класс, а не одна пара: другое пойманное враньё придерживается тем же окном', async () => {
    const { game } = makeGame()
    game.S.day = 290
    await throwLie(game, 'grandpa_dead', 'grandpa_alive')
    game.S.day = 295 // внутри окна свежести
    expect(await enterGroup(game)).not.toContain(claimByKey('grandpa_dead')!.say)
  })

  it('старое сохранение без caughtAt: строку не придерживаем', async () => {
    const game = await party(290, 295)
    delete game.S.mem[caughtAt]
    expect(namesLie(await enterGroup(game))).toBe(true)
  })
})

describe('архив дела: строка против факта финала (#786)', () => {
  // Свип класса «ретроспективная реплика утверждает то, чего не было в партии»: строка архива
  // пересказывает финал этой партии — и не может claim'ить исход, которого финал не дал.
  it('финал Размика по умолчанию: архив говорит, что он слез, а не что он на кране', async () => {
    const { game } = makeGame()
    game.S.day = 300
    toLast(game, 'razmik')
    await game.playArc('razmik')
    expect(game.S.mem['finale.razmik']).toBe('default')
    game.S.day += PAST_WINDOW // финал старше окна: архив рассказывает его как новость
    const line = await enterGroup(game)
    expect(line).toBe(archiveText('fin.razmik.default'))
    expect(line, 'в финале Размик слез, а не остался на кране').not.toMatch(/на кране|выше тебя/)
    expect(line, 'архив называет исход финала: ты первый').toMatch(/первый в очереди/)
  })

  it('обычный финал похорон: архив не отменяет то, что в партии было', async () => {
    const { game } = makeGame()
    game.S.day = 300
    game.S.mem['asked.alik_death'] = 1 // иначе «Обиделся»: sulk требует asked ≤ 0
    toLast(game, 'alik_death')
    await game.playArc('alik_death')
    expect(game.S.mem['finale.alik_death']).toBe('default')
    game.S.day += PAST_WINDOW
    const line = await enterGroup(game)
    expect(line).toBe(archiveText('fin.alik_death.default'))
    expect(line, 'похороны в партии прошли — архив не отменяет их').not.toMatch(/[Пп]охороны отменились/)
    expect(line).toMatch(/хоронили/)
  })

  it('строки про заморозку счётов гейтованы самой заморозкой: легенда frozen её снимает', () => {
    for (const slug of ['fin.boris.default', 'fin.rubik.default']) {
      const e = ENDGAME_ARCH.find((x) => valueOf(x).slug === slug)
      expect(e, slug).toBeDefined()
      const keys = (e instanceof Gated ? e.when : []).map((c) => c.key)
      expect(keys, `${slug}: строка про замороженные счета живёт только под ней`).toContain(taxFrozen)
    }
  })

  it('шаблоны пойманного вранья не про места: гейт пускает и дедушку с заказчиком', () => {
    const joined = ENDGAME_ARCH_LIE.join(' ')
    expect(joined, '«места» — только для пары про деньги; гейт шире').not.toMatch(/оба места|обоих местах|не в одном/)
    expect(joined).toMatch(/Обе версии закрыты/)
    expect(joined).toMatch(/в обеих версиях/)
  })
})

describe('архив дела: ставка усами', () => {
  it('сбритая и спасённая — разные реплики, спасённая не утверждает, что усы сбриты', async () => {
    const saved = makeGame().game
    stakeKept(saved)
    const savedLine = await enterGroup(saved)

    const shaved = makeGame().game
    shaved.S.ach.shaved = shaved.S.day
    const shavedLine = await enterGroup(shaved)

    expect(savedLine).toBe(archiveText('stake.kept'))
    expect(shavedLine).toBe(archiveText('stake.shaved'))
    expect(savedLine).not.toBe(shavedLine)
    expect(savedLine).toContain('усы на месте')
    expect(shavedLine).not.toContain('усы на месте')
  })

  it('alik.shaved к эпилогу гасится, а ставка — нет: архив опирается на ачивку', async () => {
    const { game } = makeGame()
    game.rules.applyOps([during(alikShaved, 40)], {}) // факт живёт ~40 дней
    game.S.day += 60
    game.rules.settle()
    expect(game.S.mem[alikShaved]).toBeUndefined()
    game.S.ach.shaved = game.S.day
    expect(await enterGroup(game)).toBe(archiveText('stake.shaved'))
  })
})

describe('архив дела: свежий финал — не новость (#771)', () => {
  // Финал прозвучал в чате днями раньше — группа, объявляющая то же событие новостью, звучит
  // вторым известием (раунд 48: финал Гарика 22 марта, архив 1 апреля — 9 дней). Строка о финале
  // моложе ARCHIVE_FRESH_DAYS придерживается: её место занимает другой факт партии.
  const garikFinale = async (at: number, open: number): Promise<Game> => {
    const { game } = makeGame()
    game.S.day = at
    game.S.mem[intro('garik')] = true // иначе строке архива не хватит знакомства (WORLD.garik)
    toLast(game, 'garik')
    await game.playArc('garik')
    expect(game.S.mem['finale.garik']).toBe('default')
    game.S.day = open
    return game
  }

  it('класс, а не одна строка: у Рубика тот же повтор — и та же придержка', async () => {
    const { game } = makeGame()
    game.S.day = 290
    toLast(game, 'rubik')
    await game.playArc('rubik')
    expect(game.S.mem['finale.rubik']).toBe('default')
    game.S.day = 295 // как у Гарика: внутри окна свежести
    const from = alikCount(game)
    await enterGroup(game)
    expect(since(game, from), 'свежий финал Рубика придерживается').not.toContain(archiveText('fin.rubik.default'))
  })

  it('финал, прозвучавший днями раньше, группа новостью не объявляет', async () => {
    const game = await garikFinale(290, 295) // до выплаты прошли дни, но меньше окна
    const from = alikCount(game)
    await enterGroup(game)
    expect(since(game, from), 'свежий финал придерживается').not.toContain(archiveText('fin.garik.default'))
    // строка не потеряна: окно прошло — архив рассказывает факт как прежде
    const mid = alikCount(game)
    game.S.day += ARCHIVE_FRESH_DAYS
    await game.endgameFormality()
    expect(since(game, mid)).toContain(archiveText('fin.garik.default'))
  })

  it('НС: финал старше окна группа объявляет — придержка про свежесть, не про всегда', async () => {
    const game = await garikFinale(285, 300) // с финала прошло больше окна
    const from = alikCount(game)
    await enterGroup(game)
    expect(since(game, from)).toContain(archiveText('fin.garik.default'))
  })

  // #832: партия 131117 — вскрытие 31 мая, строка архива 10 июня: ровно 10-й день оказался
  // за границей (>=) и прозвучал новостью. Окно держит все 10 дней включительно, релиз — на 11-й.
  it('ровно 10-й день — ещё окно: строка придерживается, на 11-й звучит', async () => {
    const game = await garikFinale(290, 290)
    await enterGroup(game) // вход в группу двигает день — дальше формальности зовём напрямую
    game.S.day = 290 + ARCHIVE_FRESH_DAYS // ровно 10-й день с финала
    const from = alikCount(game)
    await game.endgameFormality()
    expect(since(game, from), 'финал в окне (10-й день включительно) — не новость группы').not.toContain(archiveText('fin.garik.default'))
    game.S.day += 1 // 11-й день: окно прошло
    const mid = alikCount(game)
    await game.endgameFormality()
    expect(since(game, mid), 'после окна строка звучит как прежде').toContain(archiveText('fin.garik.default'))
  })
})

describe('архив дела: строка старше окна — воспоминание, а не новость (#832)', () => {
  // Строка fin.* легальна только старше окна свежести — к этому моменту событие не новость,
  // и строка обязана читать как воспоминание (партия 131117: «Гарика достали из фундамента…»
  // 17 июня и «Грант вскрыл угол…» 10 июня звучали телеграфной новостью).
  const oldParty = async (): Promise<Game> => {
    const { game } = makeGame()
    game.S.day = 270
    game.S.mem[intro('garik')] = true
    game.S.mem[intro('grant')] = true // строке бетона нужно знакомство с Грантом (WORLD.grant)
    await game.playFinale('beton', FINALES.beton.find((f) => f.id === 'opened')!)
    expect(game.S.mem['finale.beton']).toBe('opened')
    toLast(game, 'garik')
    await game.playArc('garik')
    expect(game.S.mem['finale.garik']).toBe('default')
    game.S.day += PAST_WINDOW
    return game
  }
  it('вскрытие и Гарик подаются за окном — обе строки в форме воспоминания', async () => {
    const game = await oldParty()
    await enterGroup(game)
    await game.endgameFormality()
    const said = alikTexts(game.S.msgs)
    expect(said.some((t) => t.includes(archiveText('fin.beton.opened'))), 'строка вскрытия прозвучала').toBe(true)
    expect(said.some((t) => t.includes(archiveText('fin.garik.default'))), 'строка Гарика прозвучала').toBe(true)
    expect(archiveText('fin.beton.opened'), 'вскрытие — воспоминание').toMatch(/Помнишь, как Грант/)
    expect(archiveText('fin.garik.default'), 'Гарик — воспоминание').toMatch(/Помнишь, как Гарика/)
  })
})

describe('архив дела: тамада — назначение, а не прошедшая свадьба (#784)', () => {
  it('строка называет приглашение Самвела, а не свершившееся тамадство', async () => {
    const { game } = makeGame()
    game.S.day = 300
    game.S.mem['intro.samvel'] = true
    game.S.ach.toast = game.S.day
    toLast(game, 'samvel')
    await game.playArc('samvel')
    expect(game.S.mem['finale.samvel']).toBe('tamada')
    game.S.day += PAST_WINDOW // финал старше окна: архив рассказывает его как новость
    const line = await enterGroup(game)
    expect(line).toBe(archiveText('fin.samvel.tamada'))
    expect(line, 'архив утверждает свершившуюся свадьбу').not.toMatch(/был[аи]? тамадой|тамадой на свадьбе Самвела/i)
    expect(line, 'строка не говорит о приглашении').toMatch(/записал тебя тамадой/)
  })
})

describe('возвращатель группы: предлог не противоречит интро (#771)', () => {
  // Интро партии: «объект принят, заказчик доволен» / «сдали» (STARTS, quests.ts) — конфликт партии
  // про деньги за сданный объект. Возвращатель Гранта утверждал «объект не сдан» — против фактов.
  it('Грант не утверждает «объект не сдан»: предлог говорит про оплату', () => {
    const lines = Object.values(ENDGAME_RETURNER_LINES).flat()
    expect(lines.filter((l) => /объект не сдан/i.test(l))).toEqual([])
    expect(lines).toContain('По договору вы в группе до оплаты объекта. Объект сдан, оплата — нет. Вы в группе.')
  })
})
