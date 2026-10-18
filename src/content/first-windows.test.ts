// Линтер реестра окна первого сообщения (#994): каждый пишущий участник — запись или исключение;
// запись полна (факт-ход — ключ памяти, пул зарегистрирован, оффер существует). Новый участник
// без записи — красный сюит, а не находка рецензента через раунд плейтеста.
import { describe, it, expect } from 'vitest'
import { FIRST_WINDOWS, EXEMPT, DEBUT_SLOT, EVENT_SOURCES } from './first-windows'
import { SPEAKS, speaks } from './world'
import { MEM_KEYS } from './memkeys'
import { playerPool } from './player-pools'
import { allRules } from './rules'

describe('реестр окна первого сообщения (#994)', () => {
  it('каждый пишущий участник (SPEAKS) — в реестре или в исключениях с причиной', () => {
    const covered = new Set([...FIRST_WINDOWS.map((w) => w.who), ...EXEMPT.map((e) => e.who)])
    const missing = Object.keys(SPEAKS).filter((w) => !covered.has(w))
    expect(missing, `участники без записи: ${missing.join(', ')}`).toEqual([])
    expect(FIRST_WINDOWS.length, 'реестр пуст — проверка пустеет').toBeGreaterThanOrEqual(6)
  })

  it('исключения не протухли: участник пишет сам и в реестре его нет', () => {
    for (const { who, why } of EXEMPT) {
      expect(speaks(who), `${who}: исключение на участника вне SPEAKS (${why})`).toBeDefined()
      expect(FIRST_WINDOWS.some((w) => w.who === who), `${who}: и в реестре, и в исключениях (${why})`).toBe(false)
    }
  })

  it('записи полны: факт-ход — настоящий ключ памяти, пул зарегистрирован и не пуст, оффер существует', () => {
    const offers = new Set(allRules.map((r) => r.name))
    for (const w of FIRST_WINDOWS) {
      if (w.at !== null && w.at !== DEBUT_SLOT) expect(MEM_KEYS.has(w.at), `${w.who}: факта ${w.at} нет в memkeys`).toBe(true)
      const pool = playerPool(w.pool)
      expect(pool, `${w.who}: пул ${w.pool} не в реестре кнопок`).toBeDefined()
      expect(pool!.length, `${w.who}: пул ${w.pool} пуст`).toBeGreaterThan(0)
      expect(offers.has(`Opt_${w.offer}`), `${w.who}: оффера Opt_${w.offer} нет в правилах`).toBe(true)
    }
  })

  it('источники-события полны: факт-ход — ключ памяти, пул зарегистрирован и не пуст, оффер существует (#1013)', () => {
    // системная строка не участник: в FIRST_WINDOWS ей места нет, но заказ окна тот же — сверяем полноту
    const offers = new Set(allRules.map((r) => r.name))
    expect(EVENT_SOURCES.length, 'реестр источников пуст — проверка пустеет').toBeGreaterThan(0)
    for (const e of EVENT_SOURCES) {
      expect(MEM_KEYS.has(e.at), `${e.source}: факта ${e.at} нет в memkeys`).toBe(true)
      const pool = playerPool(e.pool)
      expect(pool, `${e.source}: пул ${e.pool} не в реестре кнопок`).toBeDefined()
      expect(pool!.length, `${e.source}: пул ${e.pool} пуст`).toBeGreaterThan(0)
      expect(offers.has(`Opt_${e.offer}`), `${e.source}: оффера Opt_${e.offer} нет в правилах`).toBe(true)
    }
  })

  it('общий дебютный слот, на который ссылается реестр, живёт в движке', async () => {
    // слот #973: первое сообщение участника штампует debutWho/debutAt — без него записи DEBUT_SLOT мертвы
    const { makeGame } = await import('../test/helpers')
    const { game } = makeGame()
    await game.say([{ w: 'samvel', t: 'Проба слота.' }])
    expect(game.S.mem['debut.who'], 'общий слот дебюта не штампует первое сообщение').toBe('samvel')
    expect(Number(game.S.mem['debut.at']), 'слот не штампует ход').toBe(game.S.stats.sent)
  })
})
