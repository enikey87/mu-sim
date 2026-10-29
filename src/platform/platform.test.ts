// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { bootPlatform, platform } from './index'
import { yandexPlatform } from './yandex'
import { telegramPlatform } from './telegram'
import { webPlatform } from './web'
import { vkPlatform } from './vk'
import { safeStorage } from './storage'
import { makeGame, flush } from '../test/helpers'
import { SAVE_KEY } from '../engine/state'
import { SYNC_KEY } from './cloud'

const send = vi.hoisted(() => vi.fn())
vi.mock('@vkontakte/vk-bridge', () => ({ default: { send } }))

describe('адаптер витрины (#688)', () => {
  it('без VITE_PLATFORM скрипт SDK не грузится', async () => {
    expect(import.meta.env.VITE_PLATFORM).toBeUndefined()
    const srcs: string[] = []
    const orig = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = orig(tag, options)
      if (tag === 'script') {
        const proto = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')
        Object.defineProperty(el, 'src', {
          configurable: true,
          get: () => proto?.get?.call(el),
          set: (v: string) => { srcs.push(v); proto?.set?.call(el, v) },
        })
      }
      return el
    })
    await bootPlatform()
    spy.mockRestore()
    expect(srcs).toEqual([])
    expect(platform().id).toBe('web')
    expect(platform().externalPay).toBe(true)
  })

  it('яндекс: /sdk.js, ready после init, GameplayAPI по границам и без повтора', async () => {
    const api = { ready: vi.fn(), start: vi.fn(), stop: vi.fn() }
    const loaded: string[] = []
    const p = yandexPlatform({
      load: async (src) => { loaded.push(src) },
      ya: () => ({
        init: async () => ({ features: { LoadingAPI: { ready: api.ready }, GameplayAPI: { start: api.start, stop: api.stop } } }),
      }),
    })
    p.ready()
    p.gameplayStart()
    expect(api.ready).not.toHaveBeenCalled()
    expect(api.start).not.toHaveBeenCalled()
    await p.init()
    expect(loaded).toEqual(['/sdk.js'])
    expect(api.ready).toHaveBeenCalledOnce()
    expect(api.start).toHaveBeenCalledOnce()
    p.ready()
    p.gameplayStart()
    expect(api.ready).toHaveBeenCalledOnce()
    expect(api.start).toHaveBeenCalledOnce()
    p.gameplayStop()
    p.gameplayStop()
    expect(api.stop).toHaveBeenCalledOnce()
  })

  it('яндекс: скрипт не грузится — init заканчивается, ready не бросает', async () => {
    const p = yandexPlatform({ load: async () => { throw new Error('blocked') } })
    await expect(p.init()).resolves.toBeUndefined()
    expect(() => { p.ready(); p.gameplayStart(); p.gameplayStop() }).not.toThrow()
    expect(p.externalPay).toBe(false)
  })

  it('яндекс: зависший SDK отпускает старт по таймауту', async () => {
    vi.useFakeTimers()
    const p = yandexPlatform({ load: () => new Promise(() => {}), timeoutMs: 8000 })
    const done = p.init()
    await vi.advanceTimersByTimeAsync(8000)
    await done
    expect(() => p.ready()).not.toThrow()
    vi.useRealTimers()
  })

  it('VKWebAppInit уходит при старте; отказ моста не бросает', async () => {
    send.mockResolvedValue({})
    await vkPlatform().init()
    expect(send).toHaveBeenCalledWith('VKWebAppInit')
    send.mockRejectedValue(new Error('no parent'))
    await expect(vkPlatform().init()).resolves.toBeUndefined()
  })

  it('VK: вступление в сообщество уходит мостом с group_id из конфига (#1239)', async () => {
    vi.stubEnv('VITE_VK_GROUP_ID', '215848333')
    send.mockClear()
    try {
      send.mockResolvedValue({ access: 1 })
      await expect(vkPlatform().joinGroup?.()).resolves.toBe(true)
      expect(send, 'group_id — числом: мост не принимает строку').toHaveBeenCalledWith('VKWebAppJoinGroup', { group_id: 215848333 })

      send.mockRejectedValue(new Error('User denied'))
      await expect(vkPlatform().joinGroup?.()).resolves.toBe(false)
    } finally { vi.unstubAllEnvs() }
    expect(webPlatform().joinGroup, 'у веба карточка остаётся ссылкой').toBeUndefined()
  })

  it('VK: без group_id вступления в сборке нет и мост молчит (#1239)', async () => {
    vi.stubEnv('VITE_VK_GROUP_ID', '')
    try {
      send.mockClear()
      expect(vkPlatform().joinGroup, 'пустой id — карточки-кнопки на VK нет').toBeUndefined()
      expect(send).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })

  it('яндекс: покупка lend50 по ID из конфига, консумирование на успехе, цена из каталога (#1241)', async () => {
    vi.stubEnv('VITE_YANDEX_PRODUCT_ID', 'hash-cup')
    try {
      const consumePurchase = vi.fn(async (_token: string) => {})
      const purchase = vi.fn(async (_opts: { id: string }) => ({ productID: 'hash-cup', purchaseToken: 'tok-1' }))
      const p = yandexPlatform({
        load: async () => {},
        ya: () => ({ init: async () => ({
          deviceInfo: { type: 'desktop' },
          getPayments: async () => ({
            purchase,
            consumePurchase,
            getPurchases: async () => [],
            getCatalog: async () => [{ id: 'hash-cup', price: '49 YAN' }],
          }),
        }) }),
      })
      await p.init()
      expect(p.takeSponsor?.(), 'покупок не было — итога нет').toBe(false)
      expect(p.price50?.(), 'цена — из каталога площадки в портальной валюте (п. 1.13.4)').toBe('49 YAN')
      await expect(p.pay50?.()).resolves.toBe('paid')
      expect(purchase, 'ID товара — из конфига, не из кода').toHaveBeenCalledWith({ id: 'hash-cup' })
      expect(consumePurchase, 'успешная покупка закрывается консумированием (п. 1.13.1)').toHaveBeenCalledWith('tok-1')

      purchase.mockRejectedValueOnce(new Error('closed by player'))
      await expect(p.pay50?.(), 'окно закрыто — партия ничего не получает').resolves.toBe('closed')
    } finally { vi.unstubAllEnvs() }
  })

  it('яндекс: незакрытая покупка закрывается при старте и даёт спонсорский итог один раз (#1241, п. 1.13.1)', async () => {
    vi.stubEnv('VITE_YANDEX_PRODUCT_ID', 'hash-cup')
    try {
      const consumePurchase = vi.fn(async (_token: string) => {})
      const p = yandexPlatform({
        load: async () => {},
        ya: () => ({ init: async () => ({
          deviceInfo: { type: 'desktop' },
          getPayments: async () => ({
            purchase: async () => ({ productID: 'hash-cup', purchaseToken: 'new' }),
            consumePurchase,
            getPurchases: async () => [
              { productID: 'hash-cup', purchaseToken: 'tok-open' },
              { productID: 'other-game-item', purchaseToken: 'tok-foreign' },
            ],
            getCatalog: async () => [{ id: 'hash-cup', price: '49 YAN' }],
          }),
        }) }),
      })
      await p.init()
      expect(consumePurchase, 'незакрытый платёж закрыт при старте').toHaveBeenCalledWith('tok-open')
      expect(consumePurchase, 'чужой товар — не наш платёж').not.toHaveBeenCalledWith('tok-foreign')
      expect(p.takeSponsor?.(), 'первая партия после покупки получает итог').toBe(true)
      expect(p.takeSponsor?.(), 'итог выдаётся один раз').toBe(false)
    } finally { vi.unstubAllEnvs() }
  })

  it('яндекс: консумирование сорвалось — итог не выдаём, платёж остаётся на следующий старт (#1241)', async () => {
    vi.stubEnv('VITE_YANDEX_PRODUCT_ID', 'hash-cup')
    try {
      const p = yandexPlatform({
        load: async () => {},
        ya: () => ({ init: async () => ({
          getPayments: async () => ({
            purchase: async () => ({ productID: 'hash-cup', purchaseToken: 'x' }),
            consumePurchase: async () => { throw new Error('PAYMENT_FAILURE') },
            getPurchases: async () => [{ productID: 'hash-cup', purchaseToken: 'tok-open' }],
            getCatalog: async () => [{ id: 'hash-cup', price: '49 YAN' }],
          }),
        }) }),
      })
      await expect(p.init()).resolves.toBeUndefined()
      expect(p.takeSponsor?.(), 'платёж не закрыт — итог не засчитан').toBe(false)
    } finally { vi.unstubAllEnvs() }
  })

  it('яндекс: на ТВ покупки нет, незакрытый платёж всё равно закрывается (#1241, п. 1.6.3.4)', async () => {
    vi.stubEnv('VITE_YANDEX_PRODUCT_ID', 'hash-cup')
    try {
      const consumePurchase = vi.fn(async (_token: string) => {})
      const p = yandexPlatform({
        load: async () => {},
        ya: () => ({ init: async () => ({
          deviceInfo: { type: 'tv' },
          getPayments: async () => ({
            purchase: async () => ({ productID: 'hash-cup', purchaseToken: 'x' }),
            consumePurchase,
            getPurchases: async () => [{ productID: 'hash-cup', purchaseToken: 'tv-open' }],
            getCatalog: async () => [{ id: 'hash-cup', price: '49 YAN' }],
          }),
        }) }),
      })
      await p.init()
      expect(p.pay50, 'инап-покупки на ТВ запрещены — кнопки нет').toBeUndefined()
      expect(p.price50, 'цены без кнопки не показываем').toBeUndefined()
      expect(consumePurchase, 'закрытие платежа от устройства не зависит').toHaveBeenCalledWith('tv-open')
    } finally { vi.unstubAllEnvs() }
  })

  it('яндекс: без ID товара и без SDK платежей покупки в сборке нет (#1241)', async () => {
    vi.stubEnv('VITE_YANDEX_PRODUCT_ID', '')
    try {
      const getPayments = vi.fn(async () => ({ purchase: vi.fn(), getCatalog: vi.fn(async () => []) }))
      const p = yandexPlatform({ load: async () => {}, ya: () => ({ init: async () => ({ getPayments }) }) })
      await p.init()
      expect(getPayments, 'товара нет — платежи не трогаем').not.toHaveBeenCalled()
      expect(p.pay50).toBeUndefined()
    } finally { vi.unstubAllEnvs() }

    vi.stubEnv('VITE_YANDEX_PRODUCT_ID', 'hash-cup')
    try {
      const p = yandexPlatform({
        load: async () => {},
        ya: () => ({ init: async () => ({ getPayments: async () => { throw new Error('PAYMENT_FAILURE') } }) }),
      })
      await expect(p.init(), 'отказ платежей не роняет старт').resolves.toBeUndefined()
      expect(p.pay50).toBeUndefined()
    } finally { vi.unstubAllEnvs() }
  })

  it('Telegram: Stars-инвойс из конфига, статус клиента решает оплату (#1235)', async () => {
    vi.stubEnv('VITE_TELEGRAM_INVOICE_URL', 'https://t.me/$hash-cup')
    const status = (s: string) => (_url: string, cb?: (status: string) => void) => { cb?.(s) }
    try {
      const openInvoice = vi.fn(status('paid'))
      ;(window as unknown as { Telegram?: unknown }).Telegram = { WebApp: { openInvoice } }
      const p = telegramPlatform({ load: async () => {} })
      await p.init()
      expect(p.externalPay, 'внешняя ссылка DonationAlerts — решение оператора 29.10 (#1533)').toBe(true)
      await expect(p.pay50?.(), 'paid — деньги списаны').resolves.toBe('paid')
      expect(openInvoice, 'ссылка инвойса — из конфига, не из кода').toHaveBeenCalledWith('https://t.me/$hash-cup', expect.any(Function))

      // окно закрыто, платёж не прошёл, статус ещё висит — партия ничего не получает
      for (const s of ['cancelled', 'failed', 'pending']) {
        ;(window as unknown as { Telegram?: unknown }).Telegram = { WebApp: { openInvoice: vi.fn(status(s)) } }
        await expect(telegramPlatform({ load: async () => {} }).pay50?.()).resolves.toBe('closed')
      }

      // клиент отказал на вызове — отказ не всплывает и не превращается в оплату
      ;(window as unknown as { Telegram?: unknown }).Telegram = { WebApp: { openInvoice: () => { throw new Error('closed by client') } } }
      await expect(telegramPlatform({ load: async () => {} }).pay50?.()).resolves.toBe('closed')
    } finally {
      delete (window as unknown as { Telegram?: unknown }).Telegram
      vi.unstubAllEnvs()
    }
  })

  it('Telegram: пустая переменная сборки — карточка платит по константе-фолбэку (#1534)', async () => {
    const openInvoice = vi.fn((_url: string, cb?: (status: string) => void) => { cb?.('paid') })
    ;(window as unknown as { Telegram?: unknown }).Telegram = { WebApp: { openInvoice } }
    try {
      for (const empty of ['', '   ']) {
        vi.stubEnv('VITE_TELEGRAM_INVOICE_URL', empty)
        const p = telegramPlatform({ load: async () => {} })
        expect(p.pay50, 'пустая переменная не убирает покупку из сборки').toBeTypeOf('function')
        await expect(p.pay50?.(), 'фолбэк-инвойс живой — оплата идёт как обычно').resolves.toBe('paid')
        expect(openInvoice).toHaveBeenLastCalledWith('https://t.me/$jIaNPQkrGUtzFQAAE6CCLTqkr0Y', expect.any(Function))
      }

      // непустая переменная главнее фолбэка: она первоисточник ссылки
      vi.stubEnv('VITE_TELEGRAM_INVOICE_URL', 'https://t.me/$hash-cup')
      await expect(telegramPlatform({ load: async () => {} }).pay50?.(), 'переменная выигрывает у константы').resolves.toBe('paid')
      expect(openInvoice).toHaveBeenLastCalledWith('https://t.me/$hash-cup', expect.any(Function))
    } finally {
      delete (window as unknown as { Telegram?: unknown }).Telegram
      vi.unstubAllEnvs()
    }
  })

  it('Telegram: старый клиент без openInvoice — карточка есть, окно не открывается (#1235)', async () => {
    ;(window as unknown as { Telegram?: unknown }).Telegram = { WebApp: {} }
    try {
      const p = telegramPlatform({ load: async () => {} })
      await p.init()
      await expect(p.pay50?.(), 'клиент без openInvoice — оплаты нет, партия не меняется').resolves.toBe('closed')
    } finally {
      delete (window as unknown as { Telegram?: unknown }).Telegram
      vi.unstubAllEnvs()
    }
  })

  // #710: чанк адаптера грузится динамическим import — его сбой уносил рендер корня (белый экран).
  // Фолбэк молчаливый, как у отказа SDK внутри адаптера.
  it('недогруз чанка адаптера — игра всё равно стартует, на веб-адаптере', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_PLATFORM', 'vk')
    vi.doMock('./vk', () => { throw new Error('Loading chunk failed') })
    const fresh = await import('./index')
    const p = await fresh.bootPlatform() // не бросает
    expect(p.id).toBe('web')
    expect(fresh.platform().id).toBe('web')
    expect(fresh.platform().externalPay).toBe(true)
    vi.doUnmock('./vk')
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('падение на инициализации адаптера — тот же молчаливый фолбэк на веб', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_PLATFORM', 'yandex')
    vi.doMock('./yandex', () => ({
      yandexPlatform: () => ({ id: 'yandex', externalPay: false, init: async () => { throw new Error('sdk died') }, ready() {}, gameplayStart() {}, gameplayStop() {} }),
    }))
    const fresh = await import('./index')
    await expect(fresh.bootPlatform()).resolves.toMatchObject({ id: 'web' })
    expect(fresh.platform().id).toBe('web')
    vi.doUnmock('./yandex')
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('яндекс: прогресс читается из player data и уходит туда же (#1240)', async () => {
    const setData = vi.fn(async () => {})
    const getPlayer = vi.fn(async () => ({
      getData: async () => ({ [SAVE_KEY]: '{"msgs":[{"text":"с телефона"}]}', [SYNC_KEY]: JSON.stringify({ at: 1000, device: 'phone' }) }),
      setData,
    }))
    const p = yandexPlatform({ load: async () => {}, ya: () => ({ init: async () => ({ getPlayer }) }) })
    await p.init()
    const store = p.storage?.()
    if (!store) throw new Error('у витрины нет хранилища прогресса')

    expect(getPlayer, 'player data без профиля: у неавторизованного игрока она живёт на устройстве').toHaveBeenCalledWith({ scopes: false })
    expect(store.getItem(SAVE_KEY), 'прогресс с другого устройства виден до первого хода').toContain('с телефона')

    store.setItem(SAVE_KEY, '{"msgs":[{"text":"с ноутбука"}]}')
    await flush()
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({ [SAVE_KEY]: '{"msgs":[{"text":"с ноутбука"}]}' }), true)
  })

  it('яндекс: без player data хранилище локальное, партия идёт', async () => {
    const p = yandexPlatform({ load: async () => {}, ya: () => ({ init: async () => ({}) }) })
    await p.init()
    const store = p.storage?.()
    if (!store) throw new Error('у витрины нет хранилища прогресса')
    localStorage.setItem(SAVE_KEY, '{"msgs":[{"text":"локальная"}]}')

    expect(store.getItem(SAVE_KEY)).toContain('локальная')
    store.setItem(SAVE_KEY, '{"msgs":[{"text":"новая"}]}')
    expect(localStorage.getItem(SAVE_KEY), 'локальная копия пишется всегда').toContain('новая')
    localStorage.clear()
  })

  it('бросающий storage не роняет старт партии', () => {
    const raw = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('SecurityError') },
      removeItem: () => { throw new Error('SecurityError') },
    }
    expect(() => raw.getItem()).toThrow()
    const storage = safeStorage(raw)
    expect(storage?.getItem('alik-save-v4')).toBeNull()
    expect(() => storage?.setItem('k', 'v')).not.toThrow()
    const { game } = makeGame({ storage })
    expect(game.S.msgs.length).toBeGreaterThan(0)
  })
})

describe('шаринг концовки средствами площадки (#1485)', () => {
  it('VK: ссылка уходит в окно площадки, отказ моста — false', async () => {
    send.mockClear()
    send.mockResolvedValueOnce({})
    await expect(vkPlatform().share?.('текст', 'https://enikey87.github.io/mu-sim/')).resolves.toBe(true)
    expect(send).toHaveBeenCalledWith('VKWebAppShare', { link: 'https://enikey87.github.io/mu-sim/' })

    send.mockRejectedValueOnce(new Error('no parent'))
    await expect(vkPlatform().share?.('текст', 'https://enikey87.github.io/mu-sim/')).resolves.toBe(false)
  })

  it('Telegram: t.me/share/url открывает клиент, без клиента — окно браузера', async () => {
    const open = vi.fn()
    ;(window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } } }).Telegram = { WebApp: { openTelegramLink: open } }
    try {
      await expect(telegramPlatform({ load: async () => {} }).share?.('Я дожал Алика', 'https://enikey87.github.io/mu-sim/')).resolves.toBe(true)
      expect(open).toHaveBeenCalledWith(
        'https://t.me/share/url?url=https%3A%2F%2Fenikey87.github.io%2Fmu-sim%2F&text=%D0%AF%20%D0%B4%D0%BE%D0%B6%D0%B0%D0%BB%20%D0%90%D0%BB%D0%B8%D0%BA%D0%B0',
      )
    } finally {
      delete (window as unknown as { Telegram?: unknown }).Telegram
    }

    const win = vi.fn(() => ({}))
    vi.stubGlobal('open', win)
    try {
      await expect(telegramPlatform({ load: async () => {} }).share?.('текст', 'https://enikey87.github.io/mu-sim/')).resolves.toBe(true)
      expect(win).toHaveBeenCalledWith(expect.stringContaining('https://t.me/share/url'), '_blank', 'noopener')
    } finally { vi.unstubAllGlobals() }
  })

  it('Яндекс и веб: своего механизма нет — интерфейс уходит в браузерный фолбэк', () => {
    expect(yandexPlatform({ load: async () => {} }).share).toBeUndefined()
    expect(webPlatform().share).toBeUndefined()
  })
})
