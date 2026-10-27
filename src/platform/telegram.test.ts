// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { telegramPlatform } from './telegram'

/** `window.Telegram.WebApp` — мок клиента Mini App. */
const tg = (app: Record<string, unknown>) => {
  (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: app }
}

afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.platform
  vi.useRealTimers()
})

describe('адаптер Telegram Mini App (#1234)', () => {
  it('помечает Telegram для безопасного layout даже без доступного SDK', async () => {
    expect(document.documentElement.dataset.platform).toBeUndefined()
    let platformDuringLoad: string | undefined
    const load = vi.fn(async () => {
      platformDuringLoad = document.documentElement.dataset.platform
      throw new Error('SDK unavailable')
    })
    await telegramPlatform({ load }).init()
    expect(load).toHaveBeenCalledOnce()
    expect(platformDuringLoad).toBe('telegram')
    expect(document.documentElement.dataset.platform).toBe('telegram')
  })

  it('init грузит официальный скрипт и просит ready/expand/свайпы/фуллскрин', async () => {
    const ready = vi.fn()
    const expand = vi.fn()
    const disableVerticalSwipes = vi.fn()
    const requestFullscreen = vi.fn()
    // скрипт, доехав, сам ставит window.Telegram.WebApp — до загрузки клиента нет
    const load = vi.fn(async (_src: string) => { tg({ colorScheme: 'dark', ready, expand, disableVerticalSwipes, requestFullscreen }) })
    const p = telegramPlatform({ load })

    await p.init()

    expect(load, 'скрипт Mini App — только свой').toHaveBeenCalledOnce()
    expect(load.mock.calls[0][0]).toContain('telegram.org/js/telegram-web-app.js')
    expect(ready).toHaveBeenCalledOnce()
    expect(expand).toHaveBeenCalledOnce()
    expect(disableVerticalSwipes, 'свайп вниз не должен закрывать игру посреди хода').toHaveBeenCalledOnce()
    expect(requestFullscreen).toHaveBeenCalledOnce()
    expect(p.id).toBe('telegram')
    expect(p.externalPay, 'внешняя платёжная ссылка в Telegram запрещена').toBe(false)
  })

  it('WebApp уже есть — скрипт не грузится вовсе', async () => {
    tg({})
    const load = vi.fn(async (_src: string) => {})
    await telegramPlatform({ load }).init()
    expect(load).not.toHaveBeenCalled()
  })

  it('тема клиента главнее системной: colorScheme ставит палитру игры', async () => {
    tg({ colorScheme: 'dark' })
    await telegramPlatform({ load: async () => {} }).init()
    expect(document.documentElement.dataset.theme, 'тёмная тема Telegram при светлой теме WebView').toBe('dark')

    delete document.documentElement.dataset.theme
    tg({ colorScheme: 'light' })
    await telegramPlatform({ load: async () => {} }).init()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('старый клиент без colorScheme: палитру решает фон themeParams', async () => {
    tg({ themeParams: { bg_color: '#17212b' } })
    await telegramPlatform({ load: async () => {} }).init()
    expect(document.documentElement.dataset.theme, 'тёмный фон клиента — тёмная палитра').toBe('dark')

    delete document.documentElement.dataset.theme
    tg({ themeParams: { bg_color: '#ffffff' } })
    await telegramPlatform({ load: async () => {} }).init()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('смена темы в клиенте на ходу переносит палитру', async () => {
    const listeners: Array<() => void> = []
    const app: Record<string, unknown> = {
      colorScheme: 'light',
      onEvent: (event: string, cb: () => void) => { if (event === 'themeChanged') listeners.push(cb) },
    }
    tg(app)
    await telegramPlatform({ load: async () => {} }).init()
    expect(document.documentElement.dataset.theme).toBe('light')

    app.colorScheme = 'dark'
    for (const cb of listeners) cb()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('скрипт не доехал или клиент старый — старт не падает и внешней ссылки не возвращает', async () => {
    const p = telegramPlatform({ load: async () => { throw new Error('blocked by network') } })
    await expect(p.init(), 'блокировщик не оставляет белый экран').resolves.toBeUndefined()
    expect(() => { p.ready(); p.gameplayStart(); p.gameplayStop() }).not.toThrow()
    expect(p.id).toBe('telegram')
    expect(p.externalPay).toBe(false)

    // клиент без новых методов (Bot API < 7.7): необязательные вызовы не бросают
    tg({ colorScheme: 'dark', ready: () => { throw new Error('closed') } })
    await expect(telegramPlatform({ load: async () => {} }).init()).resolves.toBeUndefined()
  })

  it('зависшая загрузка скрипта отпускает старт по таймауту', async () => {
    vi.useFakeTimers()
    const p = telegramPlatform({ load: () => new Promise<void>(() => {}), timeoutMs: 8000 })
    const done = p.init()
    await vi.advanceTimersByTimeAsync(8000)
    await expect(done).resolves.toBeUndefined()
    expect(p.externalPay).toBe(false)
  })

  it('уже фуллскрин — второй раз не просим', async () => {
    const requestFullscreen = vi.fn()
    tg({ isFullscreen: true, requestFullscreen })
    await telegramPlatform({ load: async () => {} }).init()
    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('VITE_PLATFORM=telegram выбирает сборку Mini App', async () => {
    tg({ colorScheme: 'dark' })
    vi.resetModules()
    vi.stubEnv('VITE_PLATFORM', 'telegram')
    try {
      const fresh = await import('./index')
      const p = await fresh.bootPlatform()
      expect(p.id).toBe('telegram')
      expect(fresh.platform().id).toBe('telegram')
      expect(p.externalPay).toBe(false)
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
