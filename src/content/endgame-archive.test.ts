// Архив дела (docs/design/endgame.md): ранние реплики эндгейма называют закрытый факт этой партии,
// каждый факт звучит на всю группу один раз, пустая партия с первой реплики говорит общим пулом.
import { describe, it, expect } from 'vitest'
import { makeGame, flush, alikTexts } from '../test/helpers'
import {
  ENDGAME_ARCH, ENDGAME_ARCH_LIE, ENDGAME_FALLBACK, ENDGAME_FORMALITIES, ENDGAME_INTRO, ENDGAME_LEAVE,
  ENDGAME_MONEY, ENDGAME_OPEN, ENDGAME_VENDETTA, LEND50_ASK, LEND50_ASK_AGAIN, LEND50_MEMORY,
  LEND50_NO, LEND50_NUNE, LEND50_SERIOUS, LEND50_YES, ENDGAME_ALIK_BACK, ENDGAME_RETURNER_LINES,
} from './endgame'
import { ARCS } from './arcs'
import { FINALES, DEFAULT_FINALE } from './finales'
import { MEMORY } from './memory'
import { CLAIMS, claimByKey } from './lies'
import { during, set, saidText } from './fact'
import { Gated, valueOf } from '../engine/rules'
import { alikShaved, moustacheKept } from './memkeys'
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

/** Реплики вступления и просьбы «займи 50»: группа ещё говорит не от себя. */
const OPENING = new Set([
  ...ENDGAME_OPEN, ...Object.values(ENDGAME_INTRO), ENDGAME_VENDETTA, ENDGAME_FALLBACK,
  ...LEND50_ASK, ...LEND50_ASK_AGAIN, LEND50_SERIOUS, LEND50_YES, ...LEND50_NO, LEND50_NUNE, ...LEND50_MEMORY,
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
