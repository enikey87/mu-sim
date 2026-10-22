import { describe, expect, it, vi } from 'vitest'
import { SAVE_KEY, LEND50_SEEN_KEY } from '../engine/state'
import { SYNC_KEY, cloudSaves } from './cloud'
import { memStorage } from '../test/helpers'

/** Облако площадки в тесте: один объект на все устройства. */
function remoteStore(init: Record<string, string> = {}) {
  const box = { data: { ...init }, saves: 0, loads: 0 }
  return {
    box,
    load: async () => { box.loads++; return { ...box.data } },
    save: async (d: Record<string, string>) => { box.saves++; box.data = { ...d } },
  }
}

const saved = (text: string): string => JSON.stringify({ msgs: [{ text }], nextId: 1 })
const meta = (at: number, device: string): string => JSON.stringify({ at, device })

describe('облачный сейв витрины (#1240)', () => {
  it('первый запуск сборки с облаком: локальный прогресс уезжает в облако, а не ждёт хода', async () => {
    const local = memStorage({ [SAVE_KEY]: saved('старая партия') })
    const remote = remoteStore()
    const logs: string[] = []
    const cloud = cloudSaves({ local, load: remote.load, save: remote.save, now: () => 1000, log: (l) => logs.push(l) })

    await cloud.ready()
    await cloud.flush()

    expect(remote.box.data[SAVE_KEY], 'облако получило прогресс устройства').toBe(saved('старая партия'))
    expect(logs.join('\n')).toContain('облако пустое')
  })

  it('два устройства: запись на одном видна на другом', async () => {
    const remote = remoteStore()
    const a = cloudSaves({ local: memStorage(), load: remote.load, save: remote.save, now: () => 1000, device: 'A', log: () => {} })
    await a.ready()
    a.storage().setItem(SAVE_KEY, saved('партия с телефона'))
    await a.flush()

    const bLocal = memStorage()
    const b = cloudSaves({ local: bLocal, load: remote.load, save: remote.save, now: () => 2000, device: 'B', log: () => {} })
    await b.ready()

    expect(b.storage().getItem(SAVE_KEY), 'второе устройство читает облако, а не пустой localStorage').toBe(saved('партия с телефона'))
    expect(bLocal.data[SAVE_KEY], 'прочитанное облако не обязано лежать в локальной копии до первого хода').toBeUndefined()
  })

  it('обе копии есть: побеждает более новая по timestamp, проигравшая названа в журнале', async () => {
    const remote = remoteStore({ [SAVE_KEY]: saved('облачная'), [SYNC_KEY]: meta(2000, 'B') })
    const local = memStorage({ [SAVE_KEY]: saved('локальная'), [SYNC_KEY]: meta(1000, 'A') })
    const logs: string[] = []
    const cloud = cloudSaves({ local, load: remote.load, save: remote.save, now: () => 1500, log: (l) => logs.push(l) })

    await cloud.ready()

    expect(cloud.storage().getItem(SAVE_KEY)).toBe(saved('облачная'))
    expect(logs.join('\n')).toMatch(/облачная .*новее локальной/)
    expect(remote.box.saves, 'облачная копия новее — писать нечего').toBe(0)
  })

  it('локальная копия новее облачной: продолжает она и уезжает в облако', async () => {
    const remote = remoteStore({ [SAVE_KEY]: saved('облачная'), [SYNC_KEY]: meta(1000, 'B') })
    const local = memStorage({ [SAVE_KEY]: saved('локальная'), [SYNC_KEY]: meta(3000, 'A') })
    const logs: string[] = []
    const cloud = cloudSaves({ local, load: remote.load, save: remote.save, now: () => 3500, device: 'A', log: (l) => logs.push(l) })

    await cloud.ready()
    await cloud.flush()

    expect(cloud.storage().getItem(SAVE_KEY)).toBe(saved('локальная'))
    expect(logs.join('\n')).toMatch(/локальная .*новее облачной/)
    expect(remote.box.data[SAVE_KEY], 'проигравшая облачная копия заменена новой').toBe(saved('локальная'))
  })

  it('облака нет: прогресс локальный, чтение и запись партию не роняют', async () => {
    const local = memStorage({ [SAVE_KEY]: saved('локальная') })
    const logs: string[] = []
    const cloud = cloudSaves({
      local,
      load: async () => { throw new Error('мост упал') },
      save: async () => {},
      log: (l) => logs.push(l),
    })

    await expect(cloud.ready()).resolves.toBeUndefined()
    expect(cloud.storage().getItem(SAVE_KEY)).toBe(saved('локальная'))
    expect(() => cloud.storage().setItem(SAVE_KEY, saved('новая'))).not.toThrow()
    expect(local.data[SAVE_KEY]).toBe(saved('новая'))
    expect(logs.join('\n')).toContain('облака нет')
  })

  it('облако не приняло запись: прогресс остаётся локально, потеря не молчит', async () => {
    const local = memStorage()
    const logs: string[] = []
    const cloud = cloudSaves({
      local,
      load: async () => ({}),
      save: async () => { throw new Error('quota') },
      now: () => 1000,
      log: (l) => logs.push(l),
    })
    await cloud.ready()

    cloud.storage().setItem(SAVE_KEY, saved('партия'))
    await cloud.flush()
    cloud.storage().setItem(SAVE_KEY, saved('следующий ход'))
    await cloud.flush()

    expect(cloud.storage().getItem(SAVE_KEY)).toBe(saved('следующий ход'))
    expect(local.data[SAVE_KEY], 'локальная копия — страховка от отказа облака').toBe(saved('следующий ход'))
    expect(logs.filter((l) => l.includes('не приняло запись')), 'строка одна, а не на каждый ход').toHaveLength(1)
  })

  it('«Начать заново» стирает прогресс и в облаке', async () => {
    const remote = remoteStore()
    const cloud = cloudSaves({ local: memStorage(), load: remote.load, save: remote.save, now: () => 1000, log: () => {} })
    await cloud.ready()
    cloud.storage().setItem(SAVE_KEY, saved('партия'))
    await cloud.flush()
    expect(remote.box.data[SAVE_KEY]).toBe(saved('партия'))

    cloud.storage().removeItem(SAVE_KEY)
    await cloud.flush()

    expect(remote.box.data[SAVE_KEY], 'иначе стёртая партия вернулась бы с другого устройства').toBeUndefined()
    expect(cloud.storage().getItem(SAVE_KEY)).toBeNull()
  })

  it('отметки устройства между устройствами не едут', async () => {
    const local = memStorage()
    const saves: Record<string, string>[] = []
    const cloud = cloudSaves({
      local,
      load: async () => ({}),
      save: async (d) => { saves.push(d) },
      now: () => 1000,
      log: () => {},
    })
    await cloud.ready()

    cloud.storage().setItem(LEND50_SEEN_KEY, '1')
    await cloud.flush()

    expect(local.data[LEND50_SEEN_KEY]).toBe('1')
    expect(saves.flatMap((d) => Object.keys(d)), 'в облако едет только прогресс').not.toContain(LEND50_SEEN_KEY)
  })

  it('записи подряд склеиваются: в облако едет последнее состояние, а не очередь', async () => {
    const saves: Record<string, string>[] = []
    const cloud = cloudSaves({
      local: memStorage(),
      load: async () => ({}),
      save: async (d) => { saves.push(d) },
      now: () => 1000,
      log: () => {},
    })
    await cloud.ready()

    cloud.storage().setItem(SAVE_KEY, saved('первая'))
    cloud.storage().setItem(SAVE_KEY, saved('вторая'))
    await cloud.flush()

    expect(saves).toHaveLength(1)
    expect(saves[0][SAVE_KEY]).toBe(saved('вторая'))
  })

  it('запись во время отправки не теряется: уходит следующей', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const saves: Record<string, string>[] = []
    let first = true
    const cloud = cloudSaves({
      local: memStorage(),
      load: async () => ({}),
      save: async (d) => {
        saves.push(d)
        if (first) { first = false; await gate }
      },
      now: () => 1000,
      log: () => {},
    })
    await cloud.ready()

    cloud.storage().setItem(SAVE_KEY, saved('пока шла отправка'))
    await Promise.resolve()
    cloud.storage().setItem(SAVE_KEY, saved('новый ход'))
    release()
    await cloud.flush()

    expect(saves.at(-1)?.[SAVE_KEY], 'последнее состояние доехало').toBe(saved('новый ход'))
  })

  it('зависшее облако отпускает старт по таймауту', async () => {
    vi.useFakeTimers()
    const local = memStorage({ [SAVE_KEY]: saved('локальная') })
    const cloud = cloudSaves({ local, load: () => new Promise(() => {}), timeoutMs: 3000, log: () => {} })
    const done = cloud.ready()
    await vi.advanceTimersByTimeAsync(3000)
    await done
    expect(cloud.storage().getItem(SAVE_KEY)).toBe(saved('локальная'))
    vi.useRealTimers()
  })
})
