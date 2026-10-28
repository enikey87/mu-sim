import { CURRENCY, PRODUCT_DESCRIPTION, PRODUCT_ID, PRODUCT_TITLE, invoicePayload } from '../../src/config.ts'
import { deriveWebhookSecret } from '../../src/webhook-secret.ts'
import { cloudflareClient } from './cloudflare.ts'
import { parseStarsAmount, requireEnv } from './env.ts'
import {
  databaseNameFrom,
  d1Query,
  readWranglerConfig,
  sqlString,
  telegram,
  wrangler,
  writeGeneratedConfig,
  type InstallerContext,
} from './project.ts'
import { lastLines } from './runner.ts'

const EXPECTED_BOT_DEFAULT = 'alik_where_money_bot'
const HEALTH_ATTEMPTS = 6
const HEALTH_DELAY_MS = 2000

export class DeployError extends Error {
  readonly step: string

  constructor(step: string, message: string) {
    super(message)
    this.name = 'DeployError'
    this.step = step
  }
}

export interface DeployResult {
  workerUrl: string
  webhookUrl: string
  invoiceUrl: string
  amount: number
  catalogVersion: number
  databaseId: string
  createdDatabase: boolean
  reusedInvoice: boolean
  replacedWebhook: boolean
  botUsername: string
}

/**
 * Полная установка: проверки → бот → webhook-конфликт → D1 и миграции → каталог →
 * Worker и секреты → готовность → webhook → инвойс. Частичный сбой возвращает ошибку
 * с шагом, а не «зелёное готово»: повторный запуск продолжает с того же места.
 */
export async function deploy(ctx: InstallerContext): Promise<DeployResult> {
  const env = requireEnv(ctx.env, ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'TELEGRAM_BOT_TOKEN'])
  const amount = parseStarsAmount(ctx.env.STARS_AMOUNT)
  const botToken = env.TELEGRAM_BOT_TOKEN
  const expectedBot = (ctx.env.EXPECTED_BOT_USERNAME ?? EXPECTED_BOT_DEFAULT).trim()
  const confirmReplace = (ctx.env.CONFIRM_REPLACE_WEBHOOK ?? '').trim().toLowerCase() === 'true'

  // 1. Тот ли это бот: ошибка останавливает установку до регистрации webhook.
  const me = (await step('getMe', () => telegram(ctx, botToken, 'getMe', {}))) as { username?: string } | null
  const botUsername = (me?.username ?? '').trim()
  if (botUsername !== expectedBot) {
    throw new DeployError(
      'getMe',
      `ожидался бот @${expectedBot}, ответил @${botUsername || 'неизвестный'}. Установка остановлена до регистрации webhook`,
    )
  }
  ctx.log(`бот подтверждён: @${botUsername}`)

  const base = await readWranglerConfig(ctx)
  const databaseName = databaseNameFrom(base)
  const cf = cloudflareClient({
    token: env.CLOUDFLARE_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    fetchImpl: ctx.fetchImpl,
  })

  const subdomain = await step('cloudflare', () => cf.workersSubdomain())
  const workerUrl = `https://${base.name}.${subdomain}.workers.dev`
  const webhookUrl = `${workerUrl}/telegram/webhook`

  // 2. Чужой webhook не затираем молча: у него может быть живой обработчик.
  const info = (await step('getWebhookInfo', () => telegram(ctx, botToken, 'getWebhookInfo', {}))) as { url?: string } | null
  const currentWebhook = (info?.url ?? '').trim()
  const replacedWebhook = currentWebhook !== '' && currentWebhook !== webhookUrl
  if (replacedWebhook && !confirmReplace) {
    throw new DeployError(
      'getWebhookInfo',
      `у бота уже стоит другой webhook: ${currentWebhook}. Он не перезаписывается молча. ` +
        'Если он больше не нужен, запустите deploy с replace_webhook_confirmed=true',
    )
  }

  // 3. Наша база: ровно по имени, без «первого попавшегося» ресурса.
  const databases = await step('d1', () => cf.listD1Databases(databaseName))
  const exact = databases.filter((database) => database.name === databaseName)
  if (exact.length > 1) {
    throw new DeployError('d1', `нашлось ${exact.length} баз с именем ${databaseName}; выбрать одну автоматически нельзя`)
  }
  let database = exact[0]
  let createdDatabase = false
  if (!database) {
    database = await step('d1', () => cf.createD1Database(databaseName))
    createdDatabase = true
  }
  const databaseId = (database?.uuid ?? '').trim()
  if (!databaseId) throw new DeployError('d1', 'Cloudflare не вернул идентификатор базы')

  const configPath = await writeGeneratedConfig(ctx, base, databaseId)

  await step('migrations', async () => {
    const result = await wrangler(ctx, configPath, ['d1', 'migrations', 'apply', databaseName, '--remote'])
    if (result.code !== 0) throw new Error(`wrangler завершился с кодом ${result.code}: ${lastLines(result.stderr || result.stdout)}`)
  })

  // Каталог — серверный источник правды: цена и версия пишутся до выкладки Worker'а.
  const catalogVersion = await step('catalog', () => upsertCatalog(ctx, configPath, databaseName, amount))
  ctx.log(`каталог: ${amount} Stars, версия ${catalogVersion}`)

  await step('deploy', async () => {
    const result = await wrangler(ctx, configPath, ['deploy'])
    if (result.code !== 0) throw new Error(`wrangler завершился с кодом ${result.code}: ${lastLines(result.stderr || result.stdout)}`)
  })

  // 4. Секреты: webhook-секрет выводится из токена детерминированно, поэтому повторный
  // deploy не рассинхронизирует setWebhook и проверку заголовка.
  const webhookSecret = await step('webhook-secret', () => deriveWebhookSecret(botToken))
  await step('secrets', () => putSecret(ctx, configPath, 'BOT_TOKEN', botToken))
  await step('secrets', () => putSecret(ctx, configPath, 'WEBHOOK_SECRET', webhookSecret))

  await step('health', () => waitForHealth(ctx, workerUrl))

  // 5. Webhook: без drop_pending_updates, только нужные типы обновлений.
  await step('setWebhook', () =>
    telegram(ctx, botToken, 'setWebhook', {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['pre_checkout_query', 'message', 'callback_query'],
    }),
  )
  const verified = (await step('getWebhookInfo', () => telegram(ctx, botToken, 'getWebhookInfo', {}))) as { url?: string } | null
  if ((verified?.url ?? '').trim() !== webhookUrl) {
    throw new DeployError('getWebhookInfo', 'после setWebhook Telegram не подтвердил наш адрес')
  }

  const invoice = await step('invoice', () => ensureInvoice(ctx, configPath, databaseName, botToken, amount, catalogVersion))

  return {
    workerUrl,
    webhookUrl,
    invoiceUrl: invoice.url,
    amount,
    catalogVersion,
    databaseId,
    createdDatabase,
    reusedInvoice: invoice.reused,
    replacedWebhook,
    botUsername,
  }
}

async function step<T>(name: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof DeployError) throw error
    throw new DeployError(name, error instanceof Error ? error.message : String(error))
  }
}

async function putSecret(ctx: InstallerContext, configPath: string, name: string, value: string): Promise<void> {
  const result = await wrangler(ctx, configPath, ['secret', 'put', name], { stdin: value })
  if (result.code !== 0) throw new Error(`wrangler secret put ${name} завершился с кодом ${result.code}`)
}

interface CatalogRow {
  version?: unknown
  title?: unknown
  description?: unknown
  currency?: unknown
  amount?: unknown
}

async function upsertCatalog(
  ctx: InstallerContext,
  configPath: string,
  databaseName: string,
  amount: number,
): Promise<number> {
  const existing = (
    await d1Query(
      ctx,
      configPath,
      databaseName,
      `SELECT version, title, description, currency, amount FROM catalog WHERE product_id = ${sqlString(PRODUCT_ID)}`,
    )
  )[0] as CatalogRow | undefined

  const unchanged =
    existing !== undefined &&
    Number(existing.amount) === amount &&
    String(existing.title) === PRODUCT_TITLE &&
    String(existing.description) === PRODUCT_DESCRIPTION &&
    String(existing.currency) === CURRENCY
  const version = existing ? (unchanged ? Number(existing.version) : Number(existing.version) + 1) : 1
  const at = ctx.now().toISOString()

  await d1Query(
    ctx,
    configPath,
    databaseName,
    `INSERT INTO catalog (product_id, version, title, description, currency, amount, active, updated_at)
     VALUES (${sqlString(PRODUCT_ID)}, ${version}, ${sqlString(PRODUCT_TITLE)}, ${sqlString(PRODUCT_DESCRIPTION)}, ${sqlString(CURRENCY)}, ${amount}, 1, ${sqlString(at)})
     ON CONFLICT(product_id) DO UPDATE SET
       version = excluded.version,
       title = excluded.title,
       description = excluded.description,
       currency = excluded.currency,
       amount = excluded.amount,
       active = excluded.active,
       updated_at = excluded.updated_at`,
  )
  return version
}

async function waitForHealth(ctx: InstallerContext, workerUrl: string): Promise<void> {
  for (let attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1) {
    try {
      const response = await ctx.fetchImpl(`${workerUrl}/health`)
      if (response.ok) {
        const body = (await response.json()) as { status?: string }
        if (body?.status === 'ok') return
      }
    } catch {
      // Worker ещё поднимается после выкладки — повторяем попытку.
    }
    if (attempt < HEALTH_ATTEMPTS) await ctx.sleep(HEALTH_DELAY_MS)
  }
  throw new DeployError('health', `${workerUrl}/health не подтвердил готовность за ${HEALTH_ATTEMPTS} попыток`)
}

interface InvoiceResult {
  url: string
  reused: boolean
}

async function ensureInvoice(
  ctx: InstallerContext,
  configPath: string,
  databaseName: string,
  botToken: string,
  amount: number,
  version: number,
): Promise<InvoiceResult> {
  const rows = await d1Query(
    ctx,
    configPath,
    databaseName,
    "SELECT key, value FROM settings WHERE key IN ('invoice_link', 'invoice_amount', 'invoice_version')",
  )
  const settings = new Map(rows.map((row) => [String(row.key), String(row.value ?? '')]))
  const existing = settings.get('invoice_link') ?? ''
  if (existing && Number(settings.get('invoice_amount')) === amount && Number(settings.get('invoice_version')) === version) {
    return { url: existing, reused: true }
  }

  const created = await telegram(ctx, botToken, 'createInvoiceLink', {
    title: PRODUCT_TITLE,
    description: PRODUCT_DESCRIPTION,
    payload: invoicePayload({ version, productId: PRODUCT_ID, amount }),
    provider_token: '',
    currency: CURRENCY,
    prices: [{ label: PRODUCT_TITLE, amount }],
  })
  if (typeof created !== 'string' || !created.startsWith('https://')) {
    throw new DeployError('invoice', 'createInvoiceLink не вернул ссылку https://')
  }

  const at = ctx.now().toISOString()
  await d1Query(
    ctx,
    configPath,
    databaseName,
    `INSERT INTO settings (key, value, updated_at) VALUES
       ('invoice_link', ${sqlString(created)}, ${sqlString(at)}),
       ('invoice_amount', '${amount}', ${sqlString(at)}),
       ('invoice_version', '${version}', ${sqlString(at)})
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
  return { url: created, reused: false }
}

/** Summary workflow'а: только публичные значения, без секретов и персональных данных. */
export function renderDeploySummary(result: DeployResult): string {
  return [
    '## Telegram Stars Worker: deploy готов',
    '',
    `- Worker: ${result.workerUrl}`,
    `- Webhook: ${result.webhookUrl} (установлен и подтверждён getWebhookInfo)`,
    `- Бот: @${result.botUsername}`,
    `- Сумма: ${result.amount} Stars (это не рубли)`,
    `- Инвойс: ${result.invoiceUrl}`,
    `- D1: база ${result.createdDatabase ? 'создана этим запуском' : 'существующая, данные сохранены'}`,
    `- Каталог: версия ${result.catalogVersion}; инвойс ${result.reusedInvoice ? 'переиспользован' : 'создан'}`,
    result.replacedWebhook ? '- Webhook заменён по явному подтверждению оператора' : '',
    '',
    'Следующий шаг: скопируйте ссылку инвойса в Settings → Secrets and variables → Actions → Variables.',
    'Переменная: `VITE_TELEGRAM_INVOICE_URL`. После неё запустите CI & Pages — фронтенд читает ссылку при сборке.',
    '',
    `Проверка готовности: ${result.workerUrl}/health`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}
