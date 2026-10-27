import { CURRENCY, payloadMatchesCatalog, type Catalog } from './config.ts'

export interface PreCheckoutQuery {
  id: string
  currency: string
  totalAmount: number
  invoicePayload: string
  telegramUserId: number
}

export type PreCheckoutVerdict = { ok: true; query: PreCheckoutQuery } | { ok: false; reason: string }

const STALE = 'Счёт устарел: изменилась цена или товар. Откройте игру и повторите покупку.'

/**
 * Разбор `pre_checkout_query`: доверяем только серверному каталогу из D1.
 * Сумма, валюта и payload проверяются отдельными осями, чтобы каждая ошибка
 * отклонялась своей причиной, а не «не подошло».
 */
export function validatePreCheckout(raw: unknown, catalog: Catalog | null): PreCheckoutVerdict {
  const query = readQuery(raw)
  if (!query) return { ok: false, reason: 'Некорректный запрос оплаты.' }
  if (!catalog) return { ok: false, reason: 'Оплата временно недоступна. Попробуйте позже.' }
  if (query.currency !== CURRENCY) return { ok: false, reason: 'Оплата этой покупки возможна только звёздами Telegram.' }
  if (!Number.isInteger(query.totalAmount) || query.totalAmount <= 0) return { ok: false, reason: 'Некорректная сумма счёта.' }
  if (query.totalAmount !== catalog.amount) return { ok: false, reason: STALE }
  if (!payloadMatchesCatalog(catalog, query.invoicePayload)) return { ok: false, reason: STALE }
  return { ok: true, query }
}

function readQuery(raw: unknown): PreCheckoutQuery | null {
  if (!isObject(raw)) return null
  const id = raw.id
  const currency = raw.currency
  const totalAmount = raw.total_amount
  const invoicePayload = raw.invoice_payload
  const from = raw.from
  if (typeof id !== 'string' || !id) return null
  if (typeof currency !== 'string' || !currency) return null
  if (typeof totalAmount !== 'number') return null
  if (typeof invoicePayload !== 'string' || !invoicePayload) return null
  if (!isObject(from) || typeof from.id !== 'number' || !Number.isInteger(from.id) || from.id <= 0) return null
  return { id, currency, totalAmount, invoicePayload, telegramUserId: from.id }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
