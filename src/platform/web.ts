import type { Platform } from './types'

export function webPlatform(): Platform {
  return {
    id: 'web',
    externalPay: true,
    async init() {},
    ready() {},
    gameplayStart() {},
    gameplayStop() {},
  }
}
