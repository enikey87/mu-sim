import { loadScript } from './script'
import type { Platform } from './types'

const SDK = '/sdk.js'
const INIT_MS = 8000

interface Ysdk {
  features?: {
    LoadingAPI?: { ready?: () => void }
    GameplayAPI?: { start?: () => void; stop?: () => void }
  }
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
    },
    ready() { markReady() },
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
