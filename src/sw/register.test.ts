// @vitest-environment jsdom
// Регистрация воркера (#1446) и её отказы: у витрин API может не быть, регистрация может отвергнуть,
// у контейнера может бросить геттер — во всех случаях вход страницы продолжается.
// Что воркер после регистрации действительно кэширует и отдаёт офлайн — tests/e2e/sw.spec.ts.
import { describe, expect, it, vi } from 'vitest'
import { armServiceWorker, registerServiceWorker } from './register'

/** Подставной контейнер: только `register`, его поведение задаёт тест. */
const container = (register: () => Promise<unknown>): ServiceWorkerContainer =>
  ({ register } as unknown as ServiceWorkerContainer)

const navWith = (serviceWorker: ServiceWorkerContainer | undefined): Navigator =>
  ({ serviceWorker } as unknown as Navigator)

describe('регистрация воркера', () => {
  it('регистрирует ./sw.js модулем и отдаёт регистрацию', async () => {
    const registration = { scope: 'https://host/mu-sim/' }
    const register = vi.fn().mockResolvedValue(registration)
    await expect(registerServiceWorker(navWith(container(register)))).resolves.toBe(registration)
    expect(register).toHaveBeenCalledWith('./sw.js', { type: 'module' })
  })

  it('без API (WebView витрины) — молча ничего', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(registerServiceWorker(navWith(undefined))).resolves.toBeNull()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('отказ регистрации не всплывает: игра идёт как раньше', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const register = vi.fn().mockRejectedValue(new Error('module worker не поддержан'))
    await expect(registerServiceWorker(navWith(container(register)))).resolves.toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('бросивший геттер контейнера тоже не роняет вход', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const nav = {} as Navigator
    Object.defineProperty(nav, 'serviceWorker', {
      get: () => {
        throw new Error('песочница')
      },
    })
    await expect(registerServiceWorker(nav)).resolves.toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('регистрация по load', () => {
  const readyState = (value: DocumentReadyState): void => {
    Object.defineProperty(document, 'readyState', { value, configurable: true })
  }

  it('load уже прошёл — регистрирует сразу', () => {
    readyState('complete')
    const register = vi.fn().mockResolvedValue(null)
    armServiceWorker(window, register)
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith(window.navigator)
  })

  it('load ещё впереди — ждёт его и регистрирует один раз', () => {
    readyState('loading')
    const register = vi.fn().mockResolvedValue(null)
    armServiceWorker(window, register)
    expect(register).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('load'))
    window.dispatchEvent(new Event('load'))
    expect(register).toHaveBeenCalledTimes(1)
    readyState('complete')
  })

  it('отказ регистрации не оставляет необработанного промиса', async () => {
    readyState('complete')
    const register = vi.fn().mockRejectedValue(new Error('нет'))
    armServiceWorker(window, register)
    await expect(Promise.resolve()).resolves.toBeUndefined()
    expect(register).toHaveBeenCalledTimes(1)
  })
})
