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
}
