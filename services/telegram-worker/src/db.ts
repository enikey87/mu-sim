import { PRODUCT_ID, type Catalog } from './config.ts'

interface CatalogRow {
  product_id: string
  version: number
  title: string
  description: string
  currency: string
  amount: number
}

/** Активная строка каталога. Её отсутствие — «платёж недоступен», а не «любая цена подойдёт». */
export async function loadActiveCatalog(db: D1Database): Promise<Catalog | null> {
  const row = await db
    .prepare('SELECT product_id, version, title, description, currency, amount FROM catalog WHERE product_id = ? AND active = 1')
    .bind(PRODUCT_ID)
    .first<CatalogRow>()
  if (!row) return null
  return {
    productId: row.product_id,
    version: row.version,
    title: row.title,
    description: row.description,
    currency: row.currency,
    amount: row.amount,
  }
}

export interface NewPayment {
  chargeId: string
  telegramUserId: number
  invoicePayload: string
  currency: string
  amount: number
  updateId: number | null
  receivedAt: string
  productId: string | null
  catalogVersion: number | null
  /** Причина, по которой платёж не совпал с текущим каталогом и требует разбора. */
  review: string | null
}

export type RecordOutcome = 'inserted' | 'duplicate' | 'conflict'

interface ExistingPayment {
  telegram_user_id: number
  invoice_payload: string
  currency: string
  amount: number
}

/**
 * Атомарная запись платежа. Уникальность держит PRIMARY KEY в D1: два конкурентных
 * уведомления с одним charge ID дают одну строку, а не SELECT → INSERT.
 * Повтор с другими реквизитами не перезаписывает журнал — расхождение уходит в конфликты.
 */
export async function recordPayment(db: D1Database, payment: NewPayment): Promise<RecordOutcome> {
  const inserted = await db
    .prepare(
      `INSERT INTO payments
         (charge_id, telegram_user_id, invoice_payload, currency, amount, product_id, catalog_version, received_at, update_id, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?)
       ON CONFLICT(charge_id) DO NOTHING`,
    )
    .bind(
      payment.chargeId,
      payment.telegramUserId,
      payment.invoicePayload,
      payment.currency,
      payment.amount,
      payment.productId,
      payment.catalogVersion,
      payment.receivedAt,
      payment.updateId,
      payment.review,
    )
    .run()

  if ((inserted.meta.changes ?? 0) > 0) return 'inserted'

  const existing = await db
    .prepare('SELECT telegram_user_id, invoice_payload, currency, amount FROM payments WHERE charge_id = ?')
    .bind(payment.chargeId)
    .first<ExistingPayment>()

  if (existing && samePayment(existing, payment)) return 'duplicate'

  await db
    .prepare('INSERT INTO payment_conflicts (charge_id, kind, detail, created_at) VALUES (?, ?, ?, ?)')
    .bind(
      payment.chargeId,
      'details-mismatch',
      JSON.stringify({ existing: existing ?? null, delivered: publicFields(payment) }),
      payment.receivedAt,
    )
    .run()
  return 'conflict'
}

function samePayment(existing: ExistingPayment, payment: NewPayment): boolean {
  return (
    existing.telegram_user_id === payment.telegramUserId &&
    existing.invoice_payload === payment.invoicePayload &&
    existing.currency === payment.currency &&
    existing.amount === payment.amount
  )
}

function publicFields(payment: NewPayment): Record<string, unknown> {
  return {
    telegram_user_id: payment.telegramUserId,
    invoice_payload: payment.invoicePayload,
    currency: payment.currency,
    amount: payment.amount,
  }
}

export type RefundOutcome = 'refunded' | 'already' | 'unknown'

/** Состояние возврата пишется после подтверждения API; повтор уведомления ничего не ломает. */
export async function markRefunded(db: D1Database, chargeId: string, refundedAt: string): Promise<RefundOutcome> {
  const updated = await db
    .prepare("UPDATE payments SET status = 'refunded', refunded_at = ? WHERE charge_id = ? AND status = 'paid'")
    .bind(refundedAt, chargeId)
    .run()
  if ((updated.meta.changes ?? 0) > 0) return 'refunded'

  const row = await db.prepare('SELECT status FROM payments WHERE charge_id = ?').bind(chargeId).first<{ status: string }>()
  return row ? 'already' : 'unknown'
}
