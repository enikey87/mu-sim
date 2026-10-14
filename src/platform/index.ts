import { webPlatform } from './web'
import type { Platform } from './types'

export type { Platform, PlatformId } from './types'
export { safeStorage } from './storage'
export { webPlatform } from './web'

let current: Platform | null = null

/** Подмена адаптера в тесте. Игра читает тот же объект, что и интерфейс. */
export function adoptPlatform(p: Platform): void {
  current = p
}

/** Уже выбранный адаптер. До boot — веб, чтобы интерфейс не ждал SDK. */
export function platform(): Platform {
  return current ?? (current = webPlatform())
}

export async function bootPlatform(): Promise<Platform> {
  try {
    current = await createPlatform()
    await current.init()
  } catch {
    // Чанк адаптера не доехал (сеть) или SDK упал на инициализации — уходим на веб, как при отказе
    // SDK внутри адаптера. Без этого `bootPlatform` бросает, `main.tsx` не доходит до createRoot:
    // старт витрины остаётся белым экраном без восстановления.
    current = webPlatform()
  }
  return current
}

async function createPlatform(): Promise<Platform> {
  // сравнение с константой: vite вырезает чужие ветки из веб-сборки вместе с их import()
  if (import.meta.env.VITE_PLATFORM === 'yandex') {
    const { yandexPlatform } = await import('./yandex')
    return yandexPlatform()
  }
  if (import.meta.env.VITE_PLATFORM === 'vk') {
    const { vkPlatform } = await import('./vk')
    return vkPlatform()
  }
  return webPlatform()
}
