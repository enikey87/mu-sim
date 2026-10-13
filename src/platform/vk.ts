import bridge from '@vkontakte/vk-bridge'
import type { Platform } from './types'

export function vkPlatform(): Platform {
  return {
    id: 'vk',
    externalPay: false,
    async init() {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          bridge.send('VKWebAppInit'),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 8000) }),
        ])
      } catch { /* моста нет — партия идёт как обычно */ }
      finally { if (timer) clearTimeout(timer) }
    },
    ready() {},
    gameplayStart() {},
    gameplayStop() {},
  }
}
