export const DEFAULT_API_BASE = 'https://api.telegram.org'
export const GAME_URL_DEFAULT = 'https://t.me/alik_where_money_bot/game?mode=compact'
export const SUPPORT_URL_DEFAULT = 'https://github.com/enikey87'
export const BOT_USERNAME_DEFAULT = 'alik_where_money_bot'

/**
 * Откуда Mini App зовёт `/mini/*`. Подпись initData — единственная защита данных,
 * origin нужен только браузеру: чужой странице браузер не даст прочитать ответ.
 */
export const CLIENT_ORIGINS_DEFAULT = 'https://enikey87.github.io'

/** Сохранение игры больше платёжного update: 150 сообщений партии не влезают в 16 КБ webhook. */
export const SAVE_MAX_BYTES_DEFAULT = 512 * 1024

/** Одноразовая ссылка переноса живёт час (условие задачи), дальше — только новый /load. */
export const TRANSFER_TTL_MS = 60 * 60 * 1000

/** initData живёт вместе с открытым Mini App: сутки — предел доверия к подписи. */
export const INIT_DATA_TTL_MS = 24 * 60 * 60 * 1000

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

export function saveMaxBytesFrom(raw: string | undefined): number {
  return intFrom(raw, SAVE_MAX_BYTES_DEFAULT, 1024, 1024 * 1024)
}

/** Список origin'ов через запятую; пустой ввод — значение по умолчанию, а не «пускать всех». */
export function originsFrom(raw: string | undefined): string[] {
  const list = String(raw ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return list.length > 0 ? list : CLIENT_ORIGINS_DEFAULT.split(',')
}

/**
 * Имя бота для ссылки `t.me/<бот>?startapp=<токен>`. Берётся из явной настройки,
 * иначе — из GAME_URL: у установщика уже есть одно имя, второго источника правды не заводим.
 */
export function botUsernameFrom(gameUrl: string, raw: string | undefined): string {
  const explicit = String(raw ?? '').trim().replace(/^@/, '')
  if (explicit) return explicit
  try {
    const url = new URL(gameUrl)
    const name = url.pathname.split('/').filter(Boolean)[0] ?? ''
    if (url.host === 't.me' && /^[a-z0-9_]{4,32}$/i.test(name)) return name
  } catch { /* нераспознанная ссылка — имя по умолчанию */ }
  return BOT_USERNAME_DEFAULT
}

export function apiBaseFrom(raw: string | undefined): string {
  const base = String(raw ?? '').trim() || DEFAULT_API_BASE
  return base.replace(/\/+$/, '')
}

/** Сборка строки состояния из привязок: пустые значения остаются пустыми, а не «undefined». */
export function nonEmpty(value: string | undefined): string {
  return String(value ?? '').trim()
}
