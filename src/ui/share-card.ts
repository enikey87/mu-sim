import type { ShareCard } from './share'

/** Постер «Поделиться» — квадрат 1080×1080: иконка, название, дни и короткий путь партии. Не отчёт, а афиша. */
export const CARD_SIZE = 1080

const W = CARD_SIZE
const PAD = 96
const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Разбивает строку на строки не шире `max`: постер не должен обрезать название концовки. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > max) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}

const center = (ctx: CanvasRenderingContext2D, text: string, y: number): void => {
  ctx.textAlign = 'center'
  ctx.fillText(text, W / 2, y)
}

/** «день / дня / дней» — игрок видит число словами, а не «1 дней». */
export const daysWord = (n: number): string => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return 'дней'
  if (mod10 === 1) return 'день'
  if (mod10 >= 2 && mod10 <= 4) return 'дня'
  return 'дней'
}

/** Рисует постер в готовый контекст. Отдельно от DOM, чтобы e2e видел тот же рисунок, что и игрок. */
export function drawCard(ctx: CanvasRenderingContext2D, card: ShareCard): void {
  const bg = ctx.createLinearGradient(0, 0, W, W)
  bg.addColorStop(0, '#0e1a22')
  bg.addColorStop(1, '#1d3038')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, W)

  // тихая сетка: постер остаётся постером, а PNG не сжимается в пустоту
  ctx.fillStyle = 'rgba(255, 255, 255, .05)'
  for (let x = 36; x < W; x += 48) for (let y = 36; y < W; y += 48) ctx.fillRect(x, y, 2, 2)

  ctx.strokeStyle = 'rgba(255, 214, 138, .75)'
  ctx.lineWidth = 6
  roundRect(ctx, 40, 40, W - 80, W - 80, 36)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255, 214, 138, .9)'
  ctx.font = `600 30px ${FONT}`
  center(ctx, 'АЛИК, ГДЕ ДЕНЬГИ?', 128)

  ctx.font = `160px ${EMOJI}`
  center(ctx, card.icon, 360)

  ctx.fillStyle = '#f4f7f9'
  ctx.font = `700 82px ${FONT}`
  const title = wrap(ctx, card.title, W - PAD * 2).slice(0, 2)
  title.forEach((line, i) => center(ctx, line, 500 + i * 92))

  ctx.fillStyle = '#ffd68a'
  ctx.font = `600 56px ${FONT}`
  center(ctx, card.days === null ? 'концовка из коллекции' : `${card.days} ${daysWord(card.days)} после сдачи объекта`, 500 + title.length * 92 + 46)

  ctx.fillStyle = 'rgba(232, 240, 244, .82)'
  ctx.font = `400 36px ${FONT}`
  const path = card.path.length ? card.path.join(' · ') : 'Путь — в самой игре'
  wrap(ctx, path, W - PAD * 2).slice(0, 3).forEach((line, i) => center(ctx, line, 800 + i * 48))

  ctx.fillStyle = 'rgba(255, 214, 138, .9)'
  ctx.font = `600 32px ${FONT}`
  center(ctx, 'enikey87.github.io/mu-sim/', W - 96)
}

/** Канвас с постером; `null` — canvas в этом окружении недоступен (jsdom, старый движок). */
export function cardCanvas(card: ShareCard): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = W
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawCard(ctx, card)
  return canvas
}

/** PNG-файл постера; `null` — canvas или кодировщик недоступен. */
export function cardBlob(card: ShareCard): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = cardCanvas(card)
    if (!canvas) { resolve(null); return }
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    } catch {
      resolve(null)
    }
  })
}
