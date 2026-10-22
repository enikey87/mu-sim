import { loadScript } from './script'
import type { Platform } from './types'

/** Официальный скрипт Mini App. Грузится только telegram-сборкой: веб и витрины его не знают. */
const SCRIPT = 'https://telegram.org/js/telegram-web-app.js'
const INIT_MS = 8000

/**
 * Клиент Mini App (`window.Telegram.WebApp`). Все методы необязательны: версия клиента у игрока
 * неизвестна, старый клиент просто не имеет новых вызовов (Bot API 7.7 — свайпы, 8.0 — фуллскрин).
 */
interface TgWebApp {
  ready?(): void
  expand?(): void
  disableVerticalSwipes?(): void
  requestFullscreen?(): void | Promise<unknown>
  isFullscreen?: boolean
  /** `light` | `dark` — тема клиента Telegram, а не системная тема WebView. */
  colorScheme?: string
  /** Палитра клиента (`#rrggbb`): нужна, когда `colorScheme` старый клиент не прислал. */
  themeParams?: Record<string, string>
  onEvent?(event: string, listener: () => void): void
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

  const fullscreen = (app: TgWebApp) => {
    if (app.isFullscreen || !app.requestFullscreen) return
    try {
      // Bot API 8.0 отвечает промисом: отказ (старый клиент, запрет) не должен всплыть необработанным
      void Promise.resolve(app.requestFullscreen()).catch(() => {})
    } catch { /* синхронный отказ клиента — остаёмся в обычном режиме */ }
  }

  const platform: Platform = {
    id: 'telegram',
    // цифровые товары в Telegram продаются только за Stars: внешней ссылки на DonationAlerts здесь нет
    externalPay: false,
    async init() {
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
      call(() => client.expand?.())
      call(() => client.disableVerticalSwipes?.())
      fullscreen(client)
      // смена темы в клиенте на ходу: палитра игры следует за Telegram, а не за WebView
      call(() => client.onEvent?.('themeChanged', () => applyTheme(client)))
    },
    ready() {},
    gameplayStart() {},
    gameplayStop() {},
  }
  return platform
}
