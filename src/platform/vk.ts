import bridge from '@vkontakte/vk-bridge'
import type { Platform } from './types'

/** id официального сообщества игры из `.env.vk`; пусто или не число — сообщества в этой сборке нет. */
const groupId = (): number => Number(String(import.meta.env.VITE_VK_GROUP_ID ?? '').trim())

export function vkPlatform(): Platform {
  const id = groupId()
  const platform: Platform = {
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
    // Ссылку в общей ленте VK публикует окно площадки: своего текста оно не берёт, только `link`.
    async share(_text, url) {
      try {
        await bridge.send('VKWebAppShare', { link: url })
        return true
      } catch { return false }
    },
  }
  // кнопки вступления нет, пока оператор не завёл сообщество и не дал его id: пустая кнопка хуже отсутствия
  if (Number.isInteger(id) && id > 0) {
    // Вступление опционально: отказ или отсутствие моста — `false`, игра идёт дальше (п. 2.6.1).
    platform.joinGroup = async () => {
      try {
        await bridge.send('VKWebAppJoinGroup', { group_id: id })
        return true
      } catch { return false }
    }
  }
  return platform
}
