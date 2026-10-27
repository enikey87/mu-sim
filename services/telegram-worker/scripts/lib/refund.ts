import { CURRENCY } from '../../src/config.ts'
import { requireEnv } from './env.ts'
import { prepareProject } from './prepare.ts'
import { d1Query, sqlString, telegram, type InstallerContext } from './project.ts'

const CHARGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export class RefundError extends Error {
  readonly step: string

  constructor(step: string, message: string) {
    super(message)
    this.name = 'RefundError'
    this.step = step
  }
}

export interface RefundResult {
  chargeId: string
  status: 'refunded' | 'already'
  amount: number
  currency: string
  workerUrl: string
}

interface PaymentRow {
  telegram_user_id?: unknown
  status?: unknown
  amount?: unknown
  currency?: unknown
}

/**
 * Ручной возврат Stars. charge ID и user ID берутся из журнала D1, а не из запроса
 * снаружи; без точного подтверждения (`refund_confirm === charge_id`) ничего не возвращается.
 */
export async function refund(ctx: InstallerContext): Promise<RefundResult> {
  const env = requireEnv(ctx.env, ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'TELEGRAM_BOT_TOKEN', 'CHARGE_ID', 'REFUND_CONFIRM'])
  const chargeId = env.CHARGE_ID.trim()
  if (!CHARGE_ID_PATTERN.test(chargeId)) {
    throw new RefundError('charge', 'charge_id должен состоять из букв, цифр, _ и - (до 128 символов)')
  }
  if (env.REFUND_CONFIRM.trim() !== chargeId) {
    throw new RefundError('charge', 'подтверждение не совпадает с charge_id: возврат не запущен')
  }

  const project = await prepareProject(ctx)
  const rows = await d1Query(
    ctx,
    project.configPath,
    project.databaseName,
    `SELECT telegram_user_id, status, amount, currency FROM payments WHERE charge_id = ${sqlString(chargeId)}`,
  )
  const payment = rows[0] as PaymentRow | undefined
  if (!payment) throw new RefundError('journal', `платёж ${chargeId} не найден в журнале`)

  const userId = Number(payment.telegram_user_id)
  const amount = Number(payment.amount)
  const currency = String(payment.currency ?? '')
  if (!Number.isInteger(userId) || userId <= 0) throw new RefundError('journal', 'в записи платежа нет корректного user id')
  if (currency !== CURRENCY) throw new RefundError('journal', `возврат Stars возможен только для ${CURRENCY}, в записи ${currency}`)

  if (String(payment.status) === 'refunded') {
    return { chargeId, status: 'already', amount, currency, workerUrl: project.workerUrl }
  }

  try {
    await telegram(ctx, project.botToken, 'refundStarPayment', {
      user_id: userId,
      telegram_payment_charge_id: chargeId,
    })
  } catch (error) {
    throw new RefundError('refundStarPayment', error instanceof Error ? error.message : String(error))
  }

  const at = ctx.now().toISOString()
  try {
    await d1Query(
      ctx,
      project.configPath,
      project.databaseName,
      `UPDATE payments SET status = 'refunded', refunded_at = ${sqlString(at)}
       WHERE charge_id = ${sqlString(chargeId)} AND status = 'paid'`,
    )
  } catch (error) {
    // Возврат уже прошёл в Telegram: молча продолжать нельзя, нужна ручная сверка.
    throw new RefundError(
      'journal',
      `Telegram вернул Stars, но запись в D1 не обновилась: ${error instanceof Error ? error.message : String(error)}. ` +
        `Сверьте платёж ${chargeId} вручную и повторите обновление статуса, повторный refund не запускайте`,
    )
  }

  const check = await d1Query(
    ctx,
    project.configPath,
    project.databaseName,
    `SELECT status FROM payments WHERE charge_id = ${sqlString(chargeId)}`,
  )
  if (String(check[0]?.status) !== 'refunded') {
    throw new RefundError('journal', 'статус возврата не подтвердился в журнале: нужна ручная сверка')
  }

  return { chargeId, status: 'refunded', amount, currency, workerUrl: project.workerUrl }
}

export function renderRefundSummary(result: RefundResult): string {
  const action = result.status === 'already' ? 'уже возвращён ранее, повторной операции не было' : 'возвращён'
  return [
    '## Telegram Stars Worker: refund',
    '',
    `- Платёж \`${result.chargeId}\` ${action}`,
    `- Сумма: ${result.amount} ${result.currency}`,
    `- Worker: ${result.workerUrl}`,
    '',
    'Журнал платежей не удаляется: строка остаётся с состоянием `refunded` и временем возврата.',
  ].join('\n')
}
