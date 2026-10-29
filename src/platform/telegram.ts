import { loadScript } from './script'
import { transferChannel, type TransferChannel } from './transfer'
import type { Platform } from './types'

/** Официальный скрипт Mini App. Грузится только telegram-сборкой: веб и витрины его не знают. */
const SCRIPT = 'https://telegram.org/js/telegram-web-app.js'
const INIT_MS = 8000

/**
 * Последний известный боевой Stars-инвойс «Чашка хаша для Алика» (25 Stars, воркер
 * alik-stars-worker.gorecode.workers.dev). Рабочий источник ссылки — `VITE_TELEGRAM_INVOICE_URL`:
 * смена цены → re-deploy воркера → новая ссылка → переменная репо. Константа — страховка от
 * пустой переменной, а заодно тот же боевой инвойс; при смене цены обновляется тем же PR (#1534).
 */
const FALLBACK_INVOICE_URL = 'https://t.me/$jIaNPQkrGUtzFQAAE6CCLTqkr0Y'

/**
 * Ссылка на Stars-инвойс «Чашка хаша для Алика»: переменная сборки (первоисточник) главнее,
 * пустая — фолбэк-константа, чтобы карточка не пропадала (#1534).
 */
const invoiceUrl = (): string =>
  String(import.meta.env.VITE_TELEGRAM_INVOICE_URL ?? '').trim() || FALLBACK_INVOICE_URL

/**
 * Адрес воркера бота с `/mini/*` (#1488): сохранение и перенос партии. Пусто — переноса нет,
 * как у пустого инвойса: сборка работает, Cloudflare не нужен.
 */
const workerUrl = (): string => String(import.meta.env.VITE_TELEGRAM_WORKER_URL ?? '').trim()

/**
 * Клиент Mini App (`window.Telegram.WebApp`). Все методы необязательны: версия клиента у игрока
 * неизвестна, старый клиент просто не имеет новых вызовов (Bot API 7.7 — свайпы, 8.0 — фуллскрин).
 */
interface TgWebApp {
  platform?: string
  ready?(): void
  expand?(): void
  disableVerticalSwipes?(): void
  requestFullscreen?(): void | Promise<unknown>
  exitFullscreen?(): void | Promise<unknown>
  isFullscreen?: boolean
  /** `light` | `dark` — тема клиента Telegram, а не системная тема WebView. */
  colorScheme?: string
  /** Палитра клиента (`#rrggbb`): нужна, когда `colorScheme` старый клиент не прислал. */
  themeParams?: Record<string, string>
  /**
   * Stars-инвойс (Bot API 6.1): окно оплаты поверх Mini App. Статус приходит в колбэк —
   * `paid` | `cancelled` | `failed` | `pending`; у старого клиента метода нет.
   */
  openInvoice?(url: string, callback?: (status: string) => void): unknown
  /** Открыть внешнюю ссылку силами клиента (Bot API 6.1): санкционированный вход с подтверждением. */
  openLink?(url: string): void
  /** Открыть t.me-ссылку силами клиента (Bot API 6.1): окно шаринга не уводит из Mini App. */
  openTelegramLink?(url: string): void
  onEvent?(event: string, listener: () => void): void
  /** Подпись захода (Bot API 6.0): воркер проверяет её и не верит телу запроса. */
  initData?: string
  /** Разобранный `start_param`: сюда Telegram кладёт токен из `?startapp=…`. */
  initDataUnsafe?: { start_param?: string }
}

type Scheme = 'dark' | 'light'

interface TelegramDeps {
  load?: (src: string) => Promise<void>
  timeoutMs?: number
}

/**
 * Тема игры — две палитры в `styles.css`. `colorScheme` клиента главнее системной темы WebView:
 * у игрока может быть светлая тема телефона и тёмная тема Telegram (и наоборот).
 */
export function schemeOf(app: TgWebApp): Scheme | null {
  if (app.colorScheme === 'dark' || app.colorScheme === 'light') return app.colorScheme
  const bg = String(app.themeParams?.bg_color ?? '').replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(bg)) return null
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16))
  // яркость sRGB (Rec. 601): тёмный фон клиента — тёмная палитра, как у системы
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? 'dark' : 'light'
}

export function telegramPlatform(deps: TelegramDeps = {}): Platform {
  const load = deps.load ?? loadScript
  const timeoutMs = deps.timeoutMs ?? INIT_MS
  const tg = (): TgWebApp | undefined => (window as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp

  /** Клиент отказал (или версии не хватает метода) — партия идёт дальше, старт не падает. */
  const call = (fn: () => unknown) => {
    try { void fn() } catch { /* отказ клиента не должен ломать старт */ }
  }

  const applyTheme = (app: TgWebApp) => {
    const scheme = schemeOf(app)
    // палитру выбирает CSS по атрибуту: media-запрос про системную тему, а тут тема клиента
    if (scheme) document.documentElement.dataset.theme = scheme
  }

  const configureViewport = (app: TgWebApp) => {
    const mobile = app.platform === 'android' || app.platform === 'android_x' || app.platform === 'ios'
    if (mobile) call(() => app.expand?.())
    const change = mobile
      ? (app.isFullscreen ? undefined : app.requestFullscreen)
      : (app.isFullscreen ? app.exitFullscreen : undefined)
    if (!change) return
    try {
      void Promise.resolve(change.call(app)).catch(() => {})
    } catch { /* отказ клиента не должен ломать старт */ }
  }

  /**
   * Stars-инвойс (#1235): `openInvoice` открывает окно оплаты, итог приходит в колбэк.
   * `paid` — деньги списаны; `cancelled`/`failed`/`pending`, старый клиент без метода и отказ
   * клиента — `closed`: партия не меняется, а об оплате карточка не врёт.
   */
  const payStars = (url: string): Promise<'paid' | 'closed'> => new Promise((resolve) => {
    const app = tg()
    const open = app?.openInvoice
    if (!app || !open) { resolve('closed'); return }
    let settled = false
    const done = (status: string) => {
      if (settled) return // клиент может позвать колбэк дважды — итог один
      settled = true
      resolve(status === 'paid' ? 'paid' : 'closed')
    }
    try {
      open.call(app, url, done)
    } catch { done('failed') }
  })

  /**
   * Внешняя ссылка (донат DonationAlerts, #1533): `openLink` — санкционированный вход клиента с окном
   * подтверждения, в Mini App обычный переход по ссылке не открывается. Нет метода, старый клиент или
   * отказ клиента — `false`: интерфейс откроет окно браузера сам.
   */
  const openExternal = (url: string): boolean => {
    const app = tg()
    const open = app?.openLink
    if (!app || !open) return false
    try {
      open.call(app, url)
      return true
    } catch { return false }
  }

  const platform: Platform = {
    id: 'telegram',
    // Внешняя ссылка DonationAlerts разрешена решением оператора 29.10 (#1533): риск политики Mini App
    // («цифровые товары только за Stars») ограничен ботом, ущерб принят. Stars-путь остаётся рядом —
    // для iOS и не-RU, где Stars покупаются.
    externalPay: true,
    openLink: openExternal,
    /**
     * Перенос партии: нужны и адрес воркера, и подпись захода. Пустой конфиг — `null`,
     * и интерфейс даже не спрашивает про восстановление.
     */
    transfer(): TransferChannel | null {
      const app = tg()
      const url = workerUrl()
      const initData = String(app?.initData ?? '').trim()
      if (!url || !initData) return null
      return transferChannel({ url, initData, startParam: app?.initDataUnsafe?.start_param ?? null })
    },
    async init() {
      document.documentElement.dataset.platform = 'telegram'
      let app = tg()
      if (!app) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            load(SCRIPT),
            new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs) }),
          ])
        } catch {
          // скрипт не доехал (блокировщик, нет сети) — старт не ждёт: игра идёт без вызовов клиента
        } finally { if (timer) clearTimeout(timer) }
        app = tg()
      }
      if (!app) return
      const client = app
      applyTheme(client)
      call(() => client.ready?.())
      call(() => client.disableVerticalSwipes?.())
      configureViewport(client)
      // смена темы в клиенте на ходу: палитра игры следует за Telegram, а не за WebView
      call(() => client.onEvent?.('themeChanged', () => applyTheme(client)))
    },
    ready() {},
    gameplayStart() {},
    gameplayStop() {},
  }
  // ссылка есть всегда: пустая переменная сборки уходит в константу-фолбэк (#1534)
  platform.pay50 = () => payStars(invoiceUrl())
  // Шаринг Telegram — t.me/share/url; клиент открывает ссылку сам, иначе окно браузера.
  platform.share = async (text, url) => {
    const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    try {
      const app = tg()
      if (app?.openTelegramLink) { app.openTelegramLink(link); return true }
      return window.open(link, '_blank', 'noopener') !== null
    } catch { return false }
  }
  return platform
}
