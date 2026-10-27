import { PRODUCT_ID, payloadMatchesCatalog, CURRENCY, type Catalog } from './config.ts'
import type { RuntimeConfig, WorkerEnv } from './env.ts'
import { loadActiveCatalog, markRefunded, recordPayment } from './db.ts'
import { isObject, validatePreCheckout } from './precheckout.ts'
import { callTelegram } from './telegram.ts'

/** Итог обработки update: статус ответа Telegram'у и признак «повторить доставку». */
export interface UpdateOutcome {
  status: number
  retryable: boolean
}

export interface HandlerDeps {
  fetchImpl?: typeof fetch
  now?: () => string
}

/**
 * Обработка одного update. Критическая запись в D1 выполняется до ответа 2xx;
 * провал записи превращается в retryable-ошибку, чтобы Telegram прислал update снова.
 */
export async function handleUpdate(
  env: WorkerEnv,
  config: RuntimeConfig,
  update: Record<string, unknown>,
  deps: HandlerDeps = {},
): Promise<UpdateOutcome> {
  const now = deps.now ?? (() => new Date().toISOString())
  let catalog: Catalog | null
  try {
    catalog = await loadActiveCatalog(env.DB)
  } catch {
    return { status: 503, retryable: true }
  }

  if (isObject(update.pre_checkout_query)) {
    return handlePreCheckout(config, update.pre_checkout_query, catalog, deps)
  }

  const message = update.message
  if (!isObject(message)) return { status: 200, retryable: false }

  if (isObject(message.successful_payment)) {
    const updateId = typeof update.update_id === 'number' ? update.update_id : null
    return handleSuccessfulPayment(env, config, message, message.successful_payment, catalog, updateId, now(), deps)
  }
  if (isObject(message.refunded_payment)) {
    return handleRefundedPayment(env, message, message.refunded_payment, now())
  }
  if (typeof message.text === 'string') {
    return handleCommand(config, message, message.text, deps)
  }
  return { status: 200, retryable: false }
}

async function handlePreCheckout(
  config: RuntimeConfig,
  raw: Record<string, unknown>,
  catalog: Catalog | null,
  deps: HandlerDeps,
): Promise<UpdateOutcome> {
  const verdict = validatePreCheckout(raw, catalog)
  const queryId = typeof raw.id === 'string' ? raw.id : ''

  // Некорректный запрос без id ответить нельзя — подтверждаем доставку, платежа не будет.
  if (!queryId) return { status: 200, retryable: false }

  const payload = verdict.ok
    ? { pre_checkout_query_id: queryId, ok: true }
    : { pre_checkout_query_id: queryId, ok: false, error_message: verdict.reason }

  try {
    await callTelegram(config.botToken, 'answerPreCheckoutQuery', payload, {
      fetchImpl: deps.fetchImpl,
      apiBase: config.apiBase,
      // бюджет меньше 10 секунд Telegram: медленный аудит не должен съесть ответ
      timeoutMs: config.precheckoutBudgetMs,
    })
  } catch {
    // Отказ сети не выдаём за подтверждение: пусть Telegram доставит запрос снова.
    return { status: 503, retryable: true }
  }
  return { status: 200, retryable: false }
}

async function handleSuccessfulPayment(
  env: WorkerEnv,
  config: RuntimeConfig,
  message: Record<string, unknown>,
  payment: Record<string, unknown>,
  catalog: Catalog | null,
  updateId: number | null,
  receivedAt: string,
  deps: HandlerDeps,
): Promise<UpdateOutcome> {
  const chargeId = typeof payment.telegram_payment_charge_id === 'string' ? payment.telegram_payment_charge_id.trim() : ''
  const currency = typeof payment.currency === 'string' ? payment.currency : ''
  const amount = typeof payment.total_amount === 'number' ? payment.total_amount : NaN
  const payload = typeof payment.invoice_payload === 'string' ? payment.invoice_payload : ''
  const from = isObject(message.from) ? message.from : null
  const telegramUserId = from && typeof from.id === 'number' ? from.id : NaN

  const unparsable =
    !chargeId || !currency || !Number.isInteger(amount) || amount <= 0 || !Number.isInteger(telegramUserId) || telegramUserId <= 0 || !payload
  if (unparsable) {
    // Деньги уже списаны, но ключа дедупликации нет — записывать нечего, и повтор не поможет.
    return { status: 200, retryable: false }
  }

  const review = reviewReason(catalog, { currency, amount, payload })

  try {
    await recordPayment(env.DB, {
      chargeId,
      telegramUserId,
      invoicePayload: payload,
      currency,
      amount,
      updateId,
      receivedAt,
      productId: review ? null : PRODUCT_ID,
      catalogVersion: review ? null : (catalog?.version ?? null),
      review,
    })
  } catch {
    // Не подтверждаем успешную оплату, пока журнал не записан: Telegram повторит доставку.
    return { status: 503, retryable: true }
  }

  if (!review) await thankPayer(config, message, deps)
  return { status: 200, retryable: false }
}

function reviewReason(
  catalog: Catalog | null,
  payment: { currency: string; amount: number; payload: string },
): string | null {
  if (!catalog) return 'review: catalog missing'
  if (payment.currency !== CURRENCY) return 'review: currency mismatch'
  if (payment.amount !== catalog.amount) return 'review: amount mismatch'
  if (!payloadMatchesCatalog(catalog, payment.payload)) return 'review: payload mismatch'
  return null
}

async function thankPayer(config: RuntimeConfig, message: Record<string, unknown>, deps: HandlerDeps): Promise<void> {
  const chatId = isObject(message.chat) && typeof message.chat.id === 'number' ? message.chat.id : null
  if (chatId === null) return
  try {
    await callTelegram(
      config.botToken,
      'sendMessage',
      {
        chat_id: chatId,
        text: 'Спасибо за поддержку! «Чашка хаша для Алика» оплачена, звёзды дошли до Алика.',
        disable_web_page_preview: true,
      },
      { fetchImpl: deps.fetchImpl, apiBase: config.apiBase, timeoutMs: config.timeoutMs },
    )
  } catch {
    // Уже записанный платёж не теряется из-за неотправленного «спасибо».
  }
}

async function handleRefundedPayment(
  env: WorkerEnv,
  message: Record<string, unknown>,
  refunded: Record<string, unknown>,
  now: string,
): Promise<UpdateOutcome> {
  const chargeId = typeof refunded.telegram_payment_charge_id === 'string' ? refunded.telegram_payment_charge_id.trim() : ''
  if (!chargeId) return { status: 200, retryable: false }
  try {
    const outcome = await markRefunded(env.DB, chargeId, now)
    if (outcome === 'unknown') {
      // Возврат по платежу, которого нет в журнале: видимая запись для сверки, без падения.
      await env.DB.prepare('INSERT INTO payment_conflicts (charge_id, kind, detail, created_at) VALUES (?, ?, ?, ?)')
        .bind(chargeId, 'refund-unknown', JSON.stringify({ message_id: message.message_id ?? null }), now)
        .run()
    }
  } catch {
    return { status: 503, retryable: true }
  }
  return { status: 200, retryable: false }
}

async function handleCommand(
  config: RuntimeConfig,
  message: Record<string, unknown>,
  text: string,
  deps: HandlerDeps,
): Promise<UpdateOutcome> {
  const command = text.trim().split(/\s+/)[0]?.split('@')[0] ?? ''
  const reply = command === '/start'
    ? `«Алик, Где Деньги?» — переписка с подрядчиком, который не платит.\n\nИграть: ${config.gameUrl}\n\nПомощь по платежам: /paysupport`
    : command === '/paysupport'
      ? `Поддержка по платежам: ${config.supportUrl}\n\nНапишите дату и сумму платежа. Не присылайте номер карты, коды и другие платёжные данные.`
      : null
  if (!reply) return { status: 200, retryable: false }

  const chatId = isObject(message.chat) && typeof message.chat.id === 'number' ? message.chat.id : null
  if (chatId === null) return { status: 200, retryable: false }

  try {
    await callTelegram(
      config.botToken,
      'sendMessage',
      { chat_id: chatId, text: reply, disable_web_page_preview: true },
      { fetchImpl: deps.fetchImpl, apiBase: config.apiBase, timeoutMs: config.timeoutMs },
    )
  } catch {
    // Ответ на команду не критичен: платёжный журнал он не меняет.
  }
  return { status: 200, retryable: false }
}
