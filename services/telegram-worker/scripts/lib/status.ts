import { d1Query, telegram, type InstallerContext } from './project.ts'
import { prepareProject } from './prepare.ts'

export interface StatusResult {
  botUsername: string
  workerUrl: string
  webhookUrl: string
  webhookPending: number
  webhookError: string | null
  health: 'ok' | 'degraded' | 'unreachable'
  catalog: { amount: number; version: number; currency: string } | null
  payments: { paid: number; refunded: number; review: number }
  conflicts: number
  lastPaymentAt: string | null
  invoiceUrl: string | null
}

/** Диагностика без секретов: конфигурация Telegram, готовность Worker и сводка журнала. */
export async function status(ctx: InstallerContext): Promise<StatusResult> {
  const project = await prepareProject(ctx)

  const me = (await telegram(ctx, project.botToken, 'getMe', {})) as { username?: string } | null
  const info = (await telegram(ctx, project.botToken, 'getWebhookInfo', {})) as
    | { url?: string; pending_update_count?: number; last_error_message?: string }
    | null

  let health: StatusResult['health'] = 'unreachable'
  try {
    const response = await ctx.fetchImpl(`${project.workerUrl}/health`)
    const body = (await response.json()) as { status?: string }
    health = response.ok && body.status === 'ok' ? 'ok' : 'degraded'
  } catch {
    health = 'unreachable'
  }

  const catalogRows = await d1Query(
    ctx,
    project.configPath,
    project.databaseName,
    'SELECT amount, version, currency FROM catalog WHERE active = 1',
  )
  const catalogRow = catalogRows[0]
  const catalog = catalogRow
    ? { amount: Number(catalogRow.amount), version: Number(catalogRow.version), currency: String(catalogRow.currency) }
    : null

  const paymentRows = await d1Query(
    ctx,
    project.configPath,
    project.databaseName,
    "SELECT status, COUNT(*) AS total, SUM(CASE WHEN note LIKE 'review:%' THEN 1 ELSE 0 END) AS review FROM payments GROUP BY status",
  )
  const payments = { paid: 0, refunded: 0, review: 0 }
  for (const row of paymentRows) {
    const total = Number(row.total ?? 0)
    if (String(row.status) === 'paid') payments.paid += total
    if (String(row.status) === 'refunded') payments.refunded += total
    payments.review += Number(row.review ?? 0)
  }

  const conflictRows = await d1Query(
    ctx,
    project.configPath,
    project.databaseName,
    'SELECT COUNT(*) AS total FROM payment_conflicts',
  )
  const lastRows = await d1Query(
    ctx,
    project.configPath,
    project.databaseName,
    'SELECT received_at FROM payments ORDER BY received_at DESC LIMIT 1',
  )
  const invoiceRows = await d1Query(
    ctx,
    project.configPath,
    project.databaseName,
    "SELECT value FROM settings WHERE key = 'invoice_link'",
  )

  return {
    botUsername: (me?.username ?? '').trim(),
    workerUrl: project.workerUrl,
    webhookUrl: (info?.url ?? '').trim(),
    webhookPending: Number(info?.pending_update_count ?? 0),
    webhookError: info?.last_error_message ? String(info.last_error_message) : null,
    health,
    catalog,
    payments,
    conflicts: Number(conflictRows[0]?.total ?? 0),
    lastPaymentAt: lastRows[0]?.received_at ? String(lastRows[0].received_at) : null,
    invoiceUrl: invoiceRows[0]?.value ? String(invoiceRows[0].value) : null,
  }
}

export function renderStatusSummary(result: StatusResult): string {
  return [
    '## Telegram Stars Worker: status',
    '',
    `- Бот: @${result.botUsername || 'неизвестный'}`,
    `- Worker: ${result.workerUrl}`,
    `- Готовность: ${result.health}`,
    `- Webhook: ${result.webhookUrl || 'не установлен'}; в очереди ${result.webhookPending}`,
    result.webhookError ? `- Последняя ошибка доставки: ${result.webhookError}` : '- Ошибок доставки нет',
    result.catalog
      ? `- Каталог: ${result.catalog.amount} Stars, версия ${result.catalog.version}`
      : '- Каталог: строка не найдена (нужен deploy)',
    `- Платежи: оплачено ${result.payments.paid}, возвращено ${result.payments.refunded}, требуют разбора ${result.payments.review}`,
    `- Конфликты доставки: ${result.conflicts}`,
    `- Последний платёж: ${result.lastPaymentAt ?? 'нет'}`,
    `- Инвойс: ${result.invoiceUrl ?? 'ещё не создан'}`,
    '',
    'Персональные данные плательщиков в summary не выводятся; отдельные записи смотрите в D1 по charge ID.',
  ].join('\n')
}
