import { cloudSaves, type Cloud } from './cloud'
import { loadScript } from './script'
import type { Platform } from './types'

const SDK = '/sdk.js'
const INIT_MS = 8000

/** ID товара «Чашка хаша для Алика» из `.env.yandex`; пусто — покупки в сборке нет (её заводят не раньше договора). */
const productId = (): string => String(import.meta.env.VITE_YANDEX_PRODUCT_ID ?? '').trim()

interface YPlayer {
  getData?(keys?: string[]): Promise<Record<string, unknown>>
  setData?(data: Record<string, string>, flush?: boolean): Promise<void>
}

/** Покупка в ответе SDK (plain-режим: проверка подписи — отдельное решение при накрутках). */
interface YPurchase {
  productID: string
  purchaseToken: string
}

/** Товар каталога; `price` — готовая строка «49 YAN», её и показываем (п. 1.13.4). */
interface YProduct {
  id: string
  price?: string
}

interface YPayments {
  purchase?(opts: { id: string }): Promise<YPurchase>
  /** Документация отдаёт массив; встречающаяся форма `{ purchases }` тоже принимается. */
  getPurchases?(): Promise<YPurchase[] | { purchases?: YPurchase[] }>
  /** Документация отдаёт массив; встречающаяся форма `{ products }` тоже принимается. */
  getCatalog?(): Promise<YProduct[] | { products?: YProduct[] }>
  /** Обязательное консумирование покупки (п. 1.13.1): без него модерацию не пройти. */
  consumePurchase?(token: string): Promise<void>
}

interface Ysdk {
  features?: {
    LoadingAPI?: { ready?: () => void }
    GameplayAPI?: { start?: () => void; stop?: () => void }
  }
  /** Данные игрока на сервере площадки: прогресс доступен с другого устройства (п. 1.13.3). */
  getPlayer?(opts?: { scopes?: boolean }): Promise<YPlayer>
  /** Покупки площадки: инап — единственный легальный путь денег на витрине (п. 1.4, п. 1.13). */
  getPayments?(): Promise<YPayments>
  /** Устройство: `tv` — инап-покупки на ТВ запрещены (п. 1.6.3.4). */
  deviceInfo?: { type?: string }
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
  const payId = productId()
  let ysdk: Ysdk | null = null
  let initDone = false
  let wantReady = false
  let readied = false
  let playing = false
  /** Цена из каталога площадки: без неё кнопки покупки нет (п. 1.13.4). */
  let price: string | null = null
  /** Товар заведён, каталог отдал цену, устройство не ТВ — можно продавать. */
  let sellable = false
  /** Незакрытая покупка закрыта при старте, спонсорский итог ещё не выдан партии (п. 1.13.1). */
  let sponsor = false

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

  // Платежи могут быть не включены площадке (нет договора) — отказ getPayments не роняет старт.
  const payments = async (): Promise<YPayments | null> => {
    const get = ysdk?.getPayments
    if (!get) return null
    try { return await get.call(ysdk) } catch { return null }
  }

  /** Консумирование обязательно (п. 1.13.1): незакрытая покупка иначе блокирует модерацию. */
  const consume = async (pay: YPayments, p: YPurchase): Promise<boolean> => {
    if (!pay.consumePurchase) return false
    try { await pay.consumePurchase(p.purchaseToken); return true } catch { return false }
  }

  const purchases = async (pay: YPayments): Promise<YPurchase[]> => {
    if (!pay.getPurchases) return []
    try {
      const res = await pay.getPurchases()
      return Array.isArray(res) ? res : res?.purchases ?? []
    } catch { return [] }
  }

  const catalogPrice = async (pay: YPayments): Promise<string | null> => {
    if (!pay.getCatalog) return null
    try {
      const res = await pay.getCatalog()
      const products = Array.isArray(res) ? res : res?.products ?? []
      return products.find((x) => x.id === payId)?.price ?? null
    } catch { return null }
  }

  /** Покупка lend50 (п. 1.13): незакрытые закрываем при каждом старте, цену берём из каталога площадки. */
  const shopping = async (): Promise<void> => {
    if (!payId) return
    const pay = await payments()
    if (!pay) return
    for (const p of await purchases(pay)) {
      if (p.productID !== payId) continue // чужой товар — не наш платёж
      if (await consume(pay, p)) sponsor = true
    }
    // на ТВ инап-покупки запрещены (п. 1.6.3.4): кнопки нет; закрытие платежей выше от устройства не зависит
    if (ysdk?.deviceInfo?.type === 'tv') return
    if (!pay.purchase) return
    price = await catalogPrice(pay)
    sellable = !!price
  }

  const platform: Platform = {
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
      await shopping()
      // покупка появляется только после init: до него неизвестны ни товар с ценой, ни устройство (ТВ)
      if (sellable) {
        platform.price50 = () => price
        platform.pay50 = async () => {
          const pay = await payments()
          if (!pay?.purchase) return 'closed'
          try {
            const p = await pay.purchase({ id: payId })
            // Деньги списаны — итог выдаём даже если консумирование сорвалось: покупка останется
            // незакрытой и будет закрыта на следующем старте (п. 1.13.1), повторно платить не нужно.
            await consume(pay, p)
            return 'paid'
          } catch { return 'closed' } // окно закрыто, ошибка оплаты — партия не меняется
        }
      }
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

  platform.takeSponsor = () => {
    const found = sponsor
    sponsor = false
    return found
  }

  return platform
}
