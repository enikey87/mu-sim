import { platform } from '../platform'
import { cardBlob, daysWord } from './share-card'

export { daysWord }

/** Публичный адрес игры — единственный, который сборка знает. Витрины делятся тем же адресом:
 *  своих ссылок на приложение в переменных сборки нет, выдумывать их нельзя (см. PR #1485). */
export const GAME_URL = 'https://enikey87.github.io/mu-sim/'

/** Страница «О игре и приватности» (#1484): тот же адрес, что у игры, следующим файлом — `public/privacy.html`
 *  сборка кладёт в корень рядом с index.html. */
export const PRIVACY_URL = `${GAME_URL}privacy.html`

export type ShareCard = {
  id: string
  icon: string
  title: string
  /** Дней после сдачи объекта; null — концовка из отметки устройства, дня партии не осталось (#1437). */
  days: number | null
  /** Короткий путь партии: факты, которые эта партия несёт (из view.sharePath). */
  path: readonly string[]
}

/** Текст шаринга. Адрес — в каждой формулировке: без него пост не ведёт в игру. */
export const shareText = (days: number | null): string =>
  days === null
    ? `Я дошёл до финала в «Алик, где деньги?». А ты сможешь? ${GAME_URL}`
    : `Я дожал Алика за ${days} ${daysWord(days)}. А ты сможешь? ${GAME_URL}`

export const cardFile = (card: ShareCard): string => `alik-ending-${card.id}.png`

/** Есть ли чем делиться: механизм площадки или браузерный Web Share API. */
export const shareAvailable = (): boolean => !!platform().share || typeof navigator.share === 'function'

/** Скачать постер файлом — честный фолбэк везде, где окна шаринга нет. */
export async function saveEndingCard(card: ShareCard): Promise<boolean> {
  const blob = await cardBlob(card)
  if (!blob) return false
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = cardFile(card)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch {
    return false
  }
}

export type ShareResult = 'shared' | 'saved' | 'cancelled' | 'failed'

/**
 * Поделиться концовкой: сначала механизм площадки (VK, Telegram), потом браузерный Web Share
 * (текст + картинка, где он умеет файлы), иначе — скачивание постера. Отмена окна — не ошибка.
 */
export async function shareEnding(card: ShareCard): Promise<ShareResult> {
  const text = shareText(card.days)
  const p = platform()
  if (p.share) {
    try {
      if (await p.share(text, GAME_URL)) return 'shared'
    } catch { /* площадка отказала — уходим в браузерный путь или в файл */ }
  }
  if (typeof navigator.share === 'function') {
    const data: ShareData = { text, title: card.title, url: GAME_URL }
    // картинку кладём в шаринг только там, где файлы точно поддерживаются: иначе браузер отклонит окно
    if (typeof navigator.canShare === 'function') {
      const blob = await cardBlob(card)
      if (blob) {
        const file = new File([blob], cardFile(card), { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) data.files = [file]
      }
    }
    try {
      await navigator.share(data)
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }
  return (await saveEndingCard(card)) ? 'saved' : 'failed'
}
