export const DEFAULT_API_BASE = 'https://api.telegram.org'
export const GAME_URL_DEFAULT = 'https://t.me/alik_where_money_bot/game?mode=compact'
export const SUPPORT_URL_DEFAULT = 'https://github.com/enikey87'

/** Товар один: «Чашка хаша для Алика» — добровольная поддержка, без цифровых обещаний. */
export const PRODUCT_ID = 'hash-cup'
export const PRODUCT_TITLE = 'Чашка хаша для Алика'
export const PRODUCT_DESCRIPTION = 'Добровольная поддержка автора игры «Алик, Где Деньги?»'
export const CURRENCY = 'XTR'

export const MAX_BODY_BYTES_DEFAULT = 16 * 1024
export const TELEGRAM_TIMEOUT_MS_DEFAULT = 5000
/** Telegram ждёт `answerPreCheckoutQuery` 10 секунд; внутренний бюджет заведомо меньше. */
export const PRECHECKOUT_BUDGET_MS_DEFAULT = 3000

/** Строка каталога из D1 — цена и версия, которым Worker доверяет вместо суммы из браузера. */
export interface Catalog {
  productId: string
  version: number
  title: string
  description: string
  currency: string
  amount: number
}

/**
 * Payload инвойса — версия каталога, товар и сумма: старый счёт называет свою цену,
 * поэтому pre-checkout может отклонить его, а успешное списание старого счёта видно как разбор.
 */
export function invoicePayload(catalog: Pick<Catalog, 'version' | 'productId' | 'amount'>): string {
  return `v${catalog.version}:${catalog.productId}:${catalog.amount}`
}

export interface ParsedPayload {
  version: number
  productId: string
  amount: number
}

export function parseInvoicePayload(payload: string): ParsedPayload | null {
  const match = /^v([1-9][0-9]{0,8}):([a-z0-9-]{1,32}):([1-9][0-9]{0,8})$/.exec(payload)
  if (!match) return null
  return { version: Number(match[1]), productId: match[2], amount: Number(match[3]) }
}

/** Payload и текущий каталог совпадают полностью: версия, товар, сумма. */
export function payloadMatchesCatalog(catalog: Catalog, payload: string): boolean {
  const parsed = parseInvoicePayload(payload)
  if (!parsed) return false
  return parsed.version === catalog.version && parsed.productId === catalog.productId && parsed.amount === catalog.amount
}

function intFrom(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) return fallback
  return value
}

export function timeoutMsFrom(raw: string | undefined): number {
  return intFrom(raw, TELEGRAM_TIMEOUT_MS_DEFAULT, 100, 30_000)
}

export function precheckoutBudgetMsFrom(raw: string | undefined): number {
  return intFrom(raw, PRECHECKOUT_BUDGET_MS_DEFAULT, 200, 8000)
}

export function maxBodyBytesFrom(raw: string | undefined): number {
  return intFrom(raw, MAX_BODY_BYTES_DEFAULT, 1024, 1024 * 1024)
}

export function apiBaseFrom(raw: string | undefined): string {
  const base = String(raw ?? '').trim() || DEFAULT_API_BASE
  return base.replace(/\/+$/, '')
}

/** Сборка строки состояния из привязок: пустые значения остаются пустыми, а не «undefined». */
export function nonEmpty(value: string | undefined): string {
  return String(value ?? '').trim()
}
