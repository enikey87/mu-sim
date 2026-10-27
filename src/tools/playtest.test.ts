// Плейтест: партия воспроизводится по seed и по записи действий.
// Прогон для разбора: PLAYTEST_OUT=<папка> PLAYTEST_SEEDS=1-8 [PLAYTEST_TURNS=300] [PLAYTEST_PROFILE=agreeable|rude] npm run playtest
import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { is, missing, gte } from '../engine/rules'
import { playtest, transcript, worldDump, deathGated, requiresKey, attachSpeechAttribution, notifFails, pickChoice, pickShout, seedJson, type PlayProfile, type Act } from './playtest'
import type { Choice } from '../engine/state'
import type { Rng } from '../engine/rng'
import { RUDE_SHOUTS } from './shouts'
import { loanTaken } from '../content/credit'
import { setMoney } from '../test/helpers'
import { alikDead } from '../content/memkeys'
import type { Game } from '../engine/game'
import type { Rule } from '../engine/rules'

describe('фон-мычание в расшифровке (#876)', () => {
  it('каждое мычание партии — строкой в расшифровке, и выше кнопки «Му…», которую оно породило', async () => {
    // юнит-драйвер: ищем партию, где бот слышал «Мууу» (сид 146117 из находки не воспроизводится — розыгрыш сдвинут)
    let p: Awaited<ReturnType<typeof playtest>> | null = null
    for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
      const played = await playtest(seed, 150)
      if (played.game.S.stats.moo > 0) { p = played; break }
    }
    expect(p, 'ни в одной партии не мычали — проверка пустеет').toBeTruthy()
    const t = transcript(p!)
    const asides = t.match(/\(на фоне кто-то протяжно/g)?.length ?? 0
    // мычания приходят и из фоллоу-апов правил: замер вокруг runTimers их не видел (#876)
    expect(asides, 'фон-строчек столько же, сколько мычаний партии').toBe(p!.game.S.stats.moo)
    const btn = t.indexOf('Му. (Это значит')
    if (btn >= 0) expect(t.lastIndexOf('(на фоне кто-то протяжно', btn), 'мычание выше кнопки «Му…»').toBeGreaterThan(-1)
  }, 180_000)
})

describe('плейтест', () => {
  it('тот же seed — та же партия; запись действий проигрывается в ту же переписку', async () => {
    const a = await playtest(4, 80)
    const b = await playtest(4, 80)
    expect(transcript(b)).toBe(transcript(a))
    expect(a.acts.some((x) => x.kind === 'send')).toBe(true)
    const r = await playtest(4, 0, a.acts)
    expect(transcript(r)).toBe(transcript(a))
    expect(a.world.length).toBe(a.acts.length)
    expect(worldDump(a)).toEqual(expect.objectContaining({ seed: 4, frames: expect.any(Array) }))
  }, 60_000)
  // #778: замер весов сцен должен быть в самом дампе, а не одноразовым зондом: счётчик PickScene по кадрам
  it('дамп считает выпавшие сцены: ключи Scene_*, сумма равна числу выборов сцены в кадрах', async () => {
    // #789: перерыв кнопки упрёка сдвинул розыгрыш выборок, и естественная партия на 4 сидах может не
    // дойти ни до одной сцены (Turn_Scene выигрывает ход Алика примерно в 11% случаев) — проверка
    // агрегатора стала бы пустой. Правило-страховка даёт сцены: тест про дамп, не про частоту сцен.
    const p = await playtest(4, 80, undefined, (g: Game) => {
      g.rules.add({
        name: 'Scene_Probe_Open', event: 'AlikTurn', when: [gte('sent', 3)], specificity: 10_000,
        respond: ({ game }) => game.startScene(),
      })
    })
    const scenes = (worldDump(p) as { scenes: Record<string, number> }).scenes
    expect(Object.keys(scenes).length, 'ни одна сцена не выпала — проверка была бы пустой').toBeGreaterThan(0)
    expect(Object.keys(scenes).every((n) => n.startsWith('Scene_'))).toBe(true)
    const chosen = p.world.flatMap((f) => f.fired).filter((h) => h.event === 'PickScene').flatMap((h) => h.chosen).filter((n) => n.startsWith('Scene_'))
    expect(Object.values(scenes).reduce((a, b) => a + b, 0)).toBe(chosen.length)
    // счётчик не приписывает сцены другим событиям: ход Алика в кадре — не выбор сцены
    expect(Object.values(scenes).reduce((a, b) => a + b, 0)).toBeLessThan(p.world.flatMap((f) => f.fired).length)
  }, 60_000)
  it('расхождение с записью — ошибка, а не другая партия', async () => {
    const a = await playtest(4, 10)
    const acts = a.acts.map((x) => (x.kind === 'send' ? { ...x, offered: ['не то'] } : x))
    await expect(playtest(4, 0, acts)).rejects.toThrow(/replay/)
  })
  it('речь после молчащего Quiet_* (respond → undefined) не приписывается ему', async () => {
    const p = await playtest(9, 40, undefined, (g: Game) => { g.S.mem[alikDead] = true })
    const quietSaid = p.world.flatMap((f) => f.said).filter((s) => s.r != null && /^Quiet_Dead_/.test(s.r))
    expect(quietSaid).toEqual([])
    const p2 = await playtest(9, 8, undefined, (g: Game) => {
      g.S.mem[alikDead] = true
      g.rules.add({
        name: 'Quiet_Probe_Silent', event: 'AlikTurn', when: [is(alikDead)], specificity: 10_000,
        respond: () => false,
      })
    })
    expect(p2.world.flatMap((f) => f.said).filter((s) => s.r === 'Quiet_Probe_Silent')).toEqual([])
  }, 90_000)
  it('пустой Quiet не удерживает атрибуцию на push после fire — обёртка из playtest', async () => {
    const { makeGame } = await import('../test/helpers')
    const { game } = makeGame()
    const { ruleOf } = attachSpeechAttribution(game)
    game.S.mem[alikDead] = true
    const chosen = await game.fire('StoryBeat')
    expect(chosen?.name).toMatch(/^Quiet_Dead_/)
    const after = game.push({ kind: 'text', from: 'alik', text: 'речь движка после тихого правила' })
    expect(ruleOf.get(after.id)).toBeNull()
  })
  it('вложенный fire восстанавливает атрибуцию родителя (Turn_Quest → PickQuest → excuse)', async () => {
    const { makeGame } = await import('../test/helpers')
    const { game } = makeGame()
    const { ruleOf } = attachSpeechAttribution(game)
    // свой event — иначе живые Quest_* перехватят вложенный fire
    game.rules.add({
      name: 'Nest_Child', event: 'NestProbe', when: [], specificity: 10_000,
      respond: () => false, // молчит
    })
    game.rules.add({
      name: 'Nest_Parent', event: 'AlikTurn', when: [], specificity: 10_000,
      respond: async ({ game: g }) => {
        const nested = await g.rules.fire(g, { event: 'NestProbe' }, g.facts, { floor: g.floor() })
        if (!nested) await g.say(['речь родителя после вложенного fire'])
      },
    })
    await game.fire('AlikTurn')
    const mine = [...ruleOf.entries()].map(([, r]) => r).filter((r) => r === 'Nest_Parent')
    expect(mine.length).toBeGreaterThan(0)
  })
  // #304: не функция, а сама партия — playtest() обязан вешать ту же атрибуцию (раньше тест видел только обёртку)
  it('playtest(): речь после вложенного fire атрибутирована родителю в кадрах партии', async () => {
    const p = await playtest(5, 12, undefined, (g) => {
      g.rules.add({ name: 'Nest_Child', event: 'NestProbe', when: [], specificity: 10_000, respond: () => false })
      g.rules.add({
        name: 'Nest_Parent', event: 'AlikTurn', when: [], specificity: 10_000,
        respond: async ({ game: gg }) => {
          const nested = await gg.rules.fire(gg, { event: 'NestProbe' }, gg.facts, { floor: gg.floor() })
          if (!nested) await gg.say(['речь родителя после вложенного fire'])
        },
      })
    })
    const said = p.world.flatMap((f) => f.said)
    expect(p.game.S.msgs.some((m) => m.kind === 'text' && m.text === 'речь родителя после вложенного fire'), 'родитель ни разу не говорил — проверка пуста').toBe(true)
    expect(said.filter((s) => s.r === 'Nest_Parent').length).toBeGreaterThan(0)
  }, 60_000)
  it('каждое уведомление партии выгружено с событием — оракул судит повтор по нему (#304)', async () => {
    const p = await playtest(80001, 200)
    const notif = p.world.flatMap((f) => f.notif)
    expect(notif.length, 'уведомлений нет — проверка пуста').toBeGreaterThan(20)
    expect(notif.filter((n) => !n.event)).toEqual([])
    expect(new Set(notif.map((n) => n.event)).size).toBeGreaterThan(2)
  }, 60_000)
  it('requiresKey: missing(alik_dead) — не гейт смерти; is(alik_dead) — гейт', () => {
    expect(requiresKey(missing(alikDead), alikDead)).toBe(false)
    expect(requiresKey(is(alikDead), alikDead)).toBe(true)
    const liveOnly = [{ name: 'Live', event: 'X', when: [missing(alikDead)] }] as Rule<Game>[]
    const deadGate = [{ name: 'Dead', event: 'X', when: [is(alikDead)] }] as Rule<Game>[]
    expect(deathGated(liveOnly)).toEqual([])
    expect(deathGated(deadGate)).toEqual(['Dead'])
  })
  it('notifFails: выселение через randomNotif чисто; донор без крови — fails; remember до notify — ложь (#339)', async () => {
    const { makeGame, setMoney } = await import('../test/helpers')
    const { NOTIF } = await import('../content/life')
    const eviction = NOTIF.find((n) => /Выселяю/.test(n.t))!
    const donor = NOTIF.find((n) => n.app === 'Донорский центр')!

    // настоящее нарушение
    const cold = makeGame().game
    expect(notifFails(cold, donor.app, donor.t)).toEqual(['blood.given'])
    cold.S.mem['blood.given'] = true
    expect(notifFails(cold, donor.app, donor.t)).toEqual([])

    // выселение: remember после notify — fails пуст
    const { game } = makeGame()
    setMoney(game, 0)
    game.chargeBill('rent')
    game.chargeBill('rent')
    game.chargeBill('rent')
    const pick = game.lines.pick.bind(game.lines)
    game.lines.pick = (key, pool, facts, opts) =>
      key === 'NOTIF' ? pick(key, [eviction], facts, opts) : pick(key, pool, facts, opts)
    let seen: string[] | null = null
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text, card) => {
      const ok = notify(icon, app, text, card)
      if (ok && app === eviction.app) seen = notifFails(game, app, text)
      return ok
    }
    game.randomNotif()
    expect(seen).toEqual([])
    expect(game.S.mem.evicted).toBe(true)

    // NC: remember до notify (как linePicked) → ложное нарушение
    const early = makeGame().game
    setMoney(early, 0)
    early.chargeBill('rent')
    early.chargeBill('rent')
    early.chargeBill('rent')
    const hit = early.linePicked('NOTIF_EVICT_NC', [eviction])
    expect(hit?.text).toMatch(/Выселяю/)
    expect(notifFails(early, eviction.app, hit!.text)).toContain('evicted')
  })
  it('иногда отвечает на допработу зеркалом, когда оно открыто (#328)', async () => {
    let mirrored = 0
    for (let seed = 1; seed <= 80; seed++) {
      const p = await playtest(seed, 1, undefined, async (g) => {
        g.S.arcs.boris = { i: 2, last: 0 }
        g.S.actors.boris = { sick: true }
        await g.job()
        expect(g.canMirror()).toBe(true)
      })
      if (p.acts.some((a) => a.kind === 'job' && a.yes === 'mirror')) mirrored++
    }
    expect(mirrored).toBeGreaterThan(5)
    expect(mirrored).toBeLessThan(60)
  }, 60_000)
})

/** Согласник: в блоке, где есть принятие, берёт его; блок без согласия играет как нейтральный. */
describe('PLAYTEST_PROFILE=agreeable', () => {
  const biased = (): Rng => {
    const xs = [0.1, 0]
    let i = 0
    return { random: () => xs[i++] ?? 0 }
  }
  it('в блоке с согласием берёт его; партия на сиде 5 доходит до барана, нейтральная — нет', async () => {
    const offer: Choice[] = [
      { text: 'Нет, мне нужны деньги', tone: 'neutral', scene: 'barter', go: 'refuse' },
      { text: 'Беру!', tone: 'polite', scene: 'barter', go: 'take' },
      { text: 'А сколько это в рублях?', tone: 'neutral', scene: 'barter', go: 'price' },
    ]
    const intern: Choice[] = [
      { text: 'Алик, отказываюсь. У меня клиент Алик: он не платит и не уходит.', tone: 'neutral', act: 'internOffer' },
      { text: 'Алик, согласен. Все долги — по памяти, чай — по ведомости.', tone: 'neutral', act: 'internOffer' },
    ]
    const chosen = [
      offer[pickChoice(biased(), 'curious', offer, 'agreeable')].text,
      intern[pickChoice(biased(), 'curious', intern, 'agreeable')].text,
    ]
    expect(chosen, 'согласие не выбирается').toEqual([
      'Беру!',
      'Алик, согласен. Все долги — по памяти, чай — по ведомости.',
    ])
    const plain: Choice[] = [
      { text: 'Держите дальше', tone: 'neutral' },
      { text: 'Давайте лавашом', tone: 'neutral' },
    ]
    expect(pickChoice(biased(), 'curious', plain, 'agreeable'), 'нейтральный блок сменил выбор').toBe(pickChoice(biased(), 'curious', plain, 'neutral'))

    const job = await playtest(1, 1, undefined, async (g) => {
      g.S.arcs.boris = { i: 2, last: 0 }
      g.S.actors.boris = { sick: true }
      await g.job()
    }, 'agreeable')
    expect(job.acts[0]).toMatchObject({ kind: 'job', yes: true })

    const loan = await playtest(2, 1, undefined, (g) => {
      setMoney(g, 1000)
      g.maybeCreditOffer()
    }, 'agreeable')
    expect(loan.game.S.mem[loanTaken('consumer')]).toBe(true)

    const facts = (g: Awaited<ReturnType<typeof playtest>>['game']): string[] => [
      g.facts()['has.boris'] === true ? 'has.boris' : '',
      g.S.mem[loanTaken('micro')] === true ? 'credit.micro.taken' : '',
    ].filter((k) => k !== '')
    // #1222 (окно финала квеста-тамады) сдвинул розыгрыш — замер 1–30: согласие глубже нейтральной партии
    // только на 10, 23 и 28 (на 19 баран есть обеим); берём наименьший — 10.
    // #1270 (кнопки-действия окон событий без хвостов) сдвинул розыгрыш — замер 1–30: согласие глубже
    // нейтральной партии только на 4, 6, 19, 23 и 28 (на 16 наоборот); берём наименьший — 4.
    // Маска пересборки вариантов (баги оператора 23.10: карточка и «Мууу» без прыжка) сдвинула
    // розыгрыш — замер 1–16: баран только у согласника на 1, 7 и 10, но на 1 согласник вдобавок
    // единственно берёт микрозайм; берём 7.
    // #1292 (окна карточки Серёги, «не тот чат» Гранта, вопроса «ты обиделся?» и ответ-нить вакансии)
    // сдвинул розыгрыш — замер 1–30: баран только у согласника на 2; берём 2.
    const neutral = await playtest(2, 300)
    const agree = await playtest(2, 300, undefined, undefined, 'agreeable')
    const deeper = facts(agree.game).filter((k) => !facts(neutral.game).includes(k))
    expect(deeper).toEqual(['has.boris'])
  }, 60_000)
})

/** Грубый профиль: крик каждый ход, извинений нет — лестница S0–S3, вендетта и ранний финал «Кровный враг» (#1432). */
describe('PLAYTEST_PROFILE=rude', () => {
  const cold = (): Rng => ({ random: () => 0 })
  it('пикер берёт крик, а извинение — никогда; нет крика в кнопках — свободный текст, а не смягчение', () => {
    const block: Choice[] = [
      { text: 'Алик, извини, я сорвался', tone: 'rude' },
      { text: 'Давайте по-хорошему', tone: 'neutral' },
      { text: 'АЛИК, ГДЕ ДЕНЬГИ?!', tone: 'rude' },
    ]
    expect(pickChoice(cold(), 'curious', block, 'rude'), 'выбран не крик: извинение под грубой кнопкой или вежливый вариант').toBe(2)
    const calm: Choice[] = [
      { text: 'Извините за беспокойство', tone: 'polite', act: 'sorry' },
      { text: 'Спасибо за ответ', tone: 'polite' },
    ]
    expect(pickChoice(cold(), 'curious', calm, 'rude'), 'грубиян пошёл на попятную').toBe(-1)
    expect(pickChoice(cold(), 'curious', calm, 'neutral'), 'нейтральный профиль перестал выбирать кнопку').toBeGreaterThanOrEqual(0)
  })
  it('пул кричалок держит окно повтора: 15 сказанных не звучат снова, пока есть свежие', () => {
    const said = RUDE_SHOUTS.slice(0, 15)
    expect(pickShout(cold(), said), 'повторил строку из окна').toBe(RUDE_SHOUTS[15])
    // пул исчерпан — кричать нечем, кроме уже сказанного: ход не пропускается
    expect(pickShout(cold(), [...RUDE_SHOUTS, RUDE_SHOUTS[0]])).toBe(RUDE_SHOUTS[0])
  })
  it('партия на фиксированном сиде: 14+ криков без извинений — лестница, вендетта и ранний финал (#1425)', async () => {
    const p = await playtest(1, 160, undefined, undefined, 'rude')
    const sends = p.acts.filter((a): a is Extract<Act, { kind: 'send' }> => a.kind === 'send')
    expect(sends.length, 'бот почти не писал').toBeGreaterThan(100)
    const texts = sends.map((a) => a.free ?? a.offered[a.i])
    expect(texts.filter((t) => /извин|прости/i.test(t)), 'грубиян извинился').toEqual([])
    expect(Number(p.game.S.mem['count.sorry'] ?? 0), 'извинение записано в партии').toBe(0)
    expect(sends.some((a) => a.free !== undefined), 'свободный крик ни разу не задействован — пул не проверился').toBe(true)
    expect(p.game.S.stats.sent, 'сообщения игрока считаются').toBe(sends.length)
    expect(Number(p.game.S.mem['count.rude'] ?? 0), 'криков меньше порога вендетты').toBeGreaterThanOrEqual(14)
    expect(Number(p.game.S.mem['count.block'] ?? 0), 'блок-цикл (S3) не дошёл').toBeGreaterThan(0)
    expect(p.game.S.mem.vendetta, '15-й крик не объявил вендетту').toBe(true)
    const t = transcript(p)
    expect(t, 'стикер вендетты не звучал').toContain('стикер 🗡️ Вендетта')
    expect(t, 'ранний финал «Кровный враг» не достигнут').toContain('экран концовки: «Кровный враг»')
    expect(t.split('\n')[0], 'профиль не помечен в заголовке расшифровки').toContain('профиль: rude')
    expect(JSON.parse(seedJson(p)).profile, 'профиль не попал в json').toBe('rude')
    expect(JSON.parse(seedJson(await playtest(1, 1))).profile, 'нейтральная партия помечена профилем').toBeUndefined()
  }, 120_000)
  it('допработу не берёт: job no вместо согласия (#1432)', async () => {
    const p = await playtest(1, 1, undefined, async (g) => {
      g.S.arcs.boris = { i: 2, last: 0 }
      g.S.actors.boris = { sick: true }
      await g.job()
    }, 'rude')
    expect(p.acts[0]).toMatchObject({ kind: 'job', yes: false })
  }, 60_000)
})

/** Сиды из PLAYTEST_SEEDS: «1-4», «1,3,5», одиночный. Диапазон с концом меньше начала или не-число — ошибка:
 *  пустой прогон выглядел бы зелёным разбором («370001-37008» — раунд 37 аудита, техаудит P3-11). */
const seeds = (s: string): number[] => s.split(',').flatMap((p) => {
  const [a, b] = p.split('-').map(Number)
  if (!Number.isFinite(a) || (p.includes('-') && (!Number.isFinite(b) || b < a))) {
    throw new Error(`PLAYTEST_SEEDS: не понимаю «${p}» — ждём «1-4» (начало ≤ конец), «1,3,5» или один сид`)
  }
  return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]
})

describe('PLAYTEST_SEEDS: диапазон и список сидов', () => {
  it('форматы прежние: диапазон, список, одиночный', () => {
    expect(seeds('1-4')).toEqual([1, 2, 3, 4])
    expect(seeds('1,3')).toEqual([1, 3])
    expect(seeds('370001')).toEqual([370001])
  })
  it('опечатка диапазона — громкая ошибка, а не пустой зелёный прогон', () => {
    // «370001-37008» (конец меньше начала) молча давал 0 партий — раунд 37 аудита, техаудит P3-11
    expect(() => seeds('370001-37008')).toThrow(/PLAYTEST_SEEDS.*370001-37008/)
    expect(() => seeds('2-1')).toThrow(/PLAYTEST_SEEDS/)
    expect(() => seeds('x')).toThrow(/PLAYTEST_SEEDS/)
    expect(() => seeds('1-')).toThrow(/PLAYTEST_SEEDS/)
  })
})

describe.runIf(process.env.PLAYTEST_OUT)('прогон для разбора', () => {
  it('пишет переписки и записи действий', async () => {
    const out = process.env.PLAYTEST_OUT!
    mkdirSync(out, { recursive: true })
    const env = process.env.PLAYTEST_PROFILE
    const profile: PlayProfile = env === 'agreeable' || env === 'rude' ? env : 'neutral'
    for (const seed of seeds(process.env.PLAYTEST_SEEDS ?? '1-4')) {
      const p = await playtest(seed, Number(process.env.PLAYTEST_TURNS ?? 300), undefined, undefined, profile)
      writeFileSync(join(out, `seed-${seed}.txt`), transcript(p))
      writeFileSync(join(out, `seed-${seed}.json`), seedJson(p))
      writeFileSync(join(out, `seed-${seed}.world.json`), JSON.stringify(worldDump(p)))
    }
  }, 1_800_000)
})
