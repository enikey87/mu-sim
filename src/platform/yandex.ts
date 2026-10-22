import { cloudSaves, type Cloud } from './cloud'
import { loadScript } from './script'
import type { Platform } from './types'

const SDK = '/sdk.js'
const INIT_MS = 8000

interface YPlayer {
  getData?(keys?: string[]): Promise<Record<string, unknown>>
  setData?(data: Record<string, string>, flush?: boolean): Promise<void>
}

interface Ysdk {
  features?: {
    LoadingAPI?: { ready?: () => void }
    GameplayAPI?: { start?: () => void; stop?: () => void }
  }
  /** Данные игрока на сервере площадки: прогресс доступен с другого устройства (п. 1.13.3). */
  getPlayer?(opts?: { scopes?: boolean }): Promise<YPlayer>
}

type Loader = (src: string) => Promise<void>

interface YandexDeps {
  load?: Loader
  timeoutMs?: number
  ya?: () => { init?: () => Promise<Ysdk> } | undefined
}

export function yandexPlatform(deps: YandexDeps = {}): Platform {
  const load = deps.load ?? loadScript
  const timeoutMs = deps.timeoutMs ?? INIT_MS
  const ya = deps.ya ?? (() => (window as { YaGames?: { init?: () => Promise<Ysdk> } }).YaGames)
  let ysdk: Ysdk | null = null
  let initDone = false
  let wantReady = false
  let readied = false
  let playing = false

  // Данные игрока нужны обеим сторонам облака; отказ SDK или отсутствие авторизации — облака нет,
  // прогресс остаётся локальным (у неавторизованного игрока player data и так живёт на устройстве).
  const player = async (): Promise<YPlayer | null> => {
    const get = ysdk?.getPlayer
    if (!get) return null
    try { return await get.call(ysdk, { scopes: false }) } catch { return null }
  }

  const cloud: Cloud = cloudSaves({
    load: async () => {
      const p = await player()
      if (!p?.getData) throw new Error('player data нет')
      return await p.getData()
    },
    save: async (data) => {
      const p = await player()
      if (!p?.setData) throw new Error('player data нет')
      await p.setData(data, true) // flush: запись уходит на сервер сразу, а не с пачкой
    },
  })

  const flush = () => {
    if (wantReady) markReady()
    if (playing) call(() => ysdk?.features?.GameplayAPI?.start?.())
  }
  const markReady = () => {
    if (!initDone) { wantReady = true; return }
    if (readied) return
    readied = true
    call(() => ysdk?.features?.LoadingAPI?.ready?.())
  }
  const call = (fn: () => void) => { try { fn() } catch { /* SDK ответил отказом — партия не падает */ } }

  return {
    id: 'yandex',
    externalPay: false,
    async init() {
      let timer: ReturnType<typeof setTimeout> | undefined
      let dropped = false
      try {
        await Promise.race([
          (async () => {
            await load(SDK)
            if (dropped) return
            const init = ya()?.init
            if (init) ysdk = await init()
          })(),
          new Promise<void>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
          }),
        ])
      } catch {
        dropped = true
        ysdk = null
      } finally {
        if (timer) clearTimeout(timer)
      }
      initDone = true
      flush()
      // прогресс с другого устройства читаем до того, как игра создастся: иначе новый ход перезапишет облако
      await cloud.ready()
    },
    ready() { markReady() },
    storage() { return cloud.storage() },
    gameplayStart() {
      if (playing) return
      playing = true
      if (initDone) call(() => ysdk?.features?.GameplayAPI?.start?.())
    },
    gameplayStop() {
      if (!playing) return
      playing = false
      if (initDone) call(() => ysdk?.features?.GameplayAPI?.stop?.())
    },
  }
}
