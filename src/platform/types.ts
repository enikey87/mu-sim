import type { Storage } from '../engine/state'

export type PlatformId = 'web' | 'yandex' | 'vk'

/** Адаптер витрины. Веб — нулевой: ни SDK, ни запрета внешних ссылок. */
export interface Platform {
  id: PlatformId
  /** Карточка с внешней платёжной ссылкой. На витринах платформ её нет. */
  externalPay: boolean
  init(): Promise<void>
  ready(): void
  gameplayStart(): void
  gameplayStop(): void
  /**
   * Вступить в официальное сообщество игры (VK, бонус за вступление — п. 2.6.2 правил площадки).
   * `true` — вступление подтверждено, `false` — отказ или моста нет. Нет метода — площадка такого действия не умеет.
   */
  joinGroup?(): Promise<boolean>
  /**
   * Хранилище прогресса витрины (облако площадки). Нет метода или `null` — прогресс в localStorage.
   * После `init()`: облачная копия уже прочитана, запись уходит в облако в фоне.
   */
  storage?(): Storage | null
}
