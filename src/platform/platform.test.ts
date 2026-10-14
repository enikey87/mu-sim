import { describe, expect, it, vi } from 'vitest'
import { bootPlatform, platform } from './index'
import { yandexPlatform } from './yandex'
import { vkPlatform } from './vk'
import { safeStorage } from './storage'
import { makeGame } from '../test/helpers'

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
