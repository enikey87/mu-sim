import { describe, expect, it } from 'vitest'
import { DeployError, deploy, renderDeploySummary } from '../../scripts/lib/deploy.ts'
import { MissingEnvError } from '../../scripts/lib/env.ts'
import { deriveWebhookSecret } from '../../src/webhook-secret.ts'
import { BASE_ENV, createHarness, INVOICE_URL, WEBHOOK_URL, WORKER_URL } from './harness.ts'

const BOT_TOKEN = BASE_ENV.TELEGRAM_BOT_TOKEN

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('ожидалась ошибка, но операция завершилась успешно')
}

describe('установка: чистая и повторная', () => {
  it('чистый deploy создаёт базу, применяет миграции, поднимает Worker, ставит секреты и webhook', async () => {
    const harness = createHarness({ databases: [] })
    const result = await deploy(harness.ctx)

    expect(result.createdDatabase).toBe(true)
    expect(result.databaseId).toBe('db-created-1')
    expect(result.workerUrl).toBe(WORKER_URL)
    expect(result.amount).toBe(25)
    expect(result.botUsername).toBe('alik_where_money_bot')

    const order = harness.wranglerCalls
    const migrations = order.findIndex((call) => call.includes('d1 migrations apply'))
    const deployIndex = order.findIndex((call) => call.startsWith('wrangler deploy'))
    expect(migrations).toBeGreaterThanOrEqual(0)
    expect(deployIndex).toBeGreaterThan(migrations)

    expect(harness.secretWrites).toEqual([
      { name: 'BOT_TOKEN', value: BOT_TOKEN },
      { name: 'WEBHOOK_SECRET', value: await deriveWebhookSecret(BOT_TOKEN) },
    ])
    for (const call of harness.wranglerCalls) expect(call).not.toContain(BOT_TOKEN)

    const setWebhook = harness.telegram.find((call) => call.method === 'setWebhook')
    expect(setWebhook?.payload).toEqual({
      url: WEBHOOK_URL,
      secret_token: await deriveWebhookSecret(BOT_TOKEN),
      allowed_updates: ['pre_checkout_query', 'message'],
    })
    expect(setWebhook?.payload).not.toHaveProperty('drop_pending_updates')

    const invoice = harness.telegram.find((call) => call.method === 'createInvoiceLink')
    expect(invoice?.payload).toEqual({
      title: 'Чашка хаша для Алика',
      description: 'Добровольная поддержка автора игры «Алик, Где Деньги?»',
      payload: 'v1:hash-cup:25',
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Чашка хаша для Алика', amount: 25 }],
    })
    expect(result.invoiceUrl).toBe(INVOICE_URL)
    expect(result.reusedInvoice).toBe(false)
  })

  it('генератор конфигурации подставляет database ID и не коммитит его в wrangler.json', async () => {
    const harness = createHarness({ databases: [] })
    await deploy(harness.ctx)

    const generated = JSON.parse(harness.files.get('/project/wrangler.generated.json') ?? '{}') as {
      main?: string
      d1_databases?: Array<{ database_id?: string; migrations_dir?: string }>
    }
    expect(generated.main).toBe('/project/src/index.ts')
    expect(generated.d1_databases?.[0]?.database_id).toBe('db-created-1')
    expect(generated.d1_databases?.[0]?.migrations_dir).toBe('/project/migrations')
    expect(harness.files.get('/project/wrangler.json')).not.toContain('db-created-1')
  })

  it('повторный deploy не создаёт базу и переиспользует инвойс', async () => {
    const harness = createHarness()
    const first = await deploy(harness.ctx)
    const second = await deploy(harness.ctx)

    expect(first.createdDatabase).toBe(false)
    expect(second.createdDatabase).toBe(false)
    expect(second.databaseId).toBe('db-uuid-1')
    expect(harness.telegram.filter((call) => call.method === 'createInvoiceLink')).toHaveLength(1)
    expect(second.reusedInvoice).toBe(true)
    expect(second.invoiceUrl).toBe(INVOICE_URL)
    expect(second.catalogVersion).toBe(1)
  })

  it('смена суммы поднимает версию каталога и выпускает новый инвойс', async () => {
    const harness = createHarness()
    await deploy(harness.ctx)

    harness.ctx.env = { ...harness.ctx.env, STARS_AMOUNT: '30' }
    const second = await deploy(harness.ctx)

    expect(second.catalogVersion).toBe(2)
    expect(harness.d1.catalog?.amount).toBe(30)
    const invoices = harness.telegram.filter((call) => call.method === 'createInvoiceLink')
    expect(invoices).toHaveLength(2)
    expect(invoices[1]?.payload.payload).toBe('v2:hash-cup:30')
    expect(invoices[1]?.payload.prices).toEqual([{ label: 'Чашка хаша для Алика', amount: 30 }])
    expect(second.reusedInvoice).toBe(false)
  })

  it('summary содержит публичные значения и ни одного секрета', async () => {
    const harness = createHarness()
    const result = await deploy(harness.ctx)
    const summary = renderDeploySummary(result)

    expect(summary).toContain(WORKER_URL)
    expect(summary).toContain(INVOICE_URL)
    expect(summary).toContain('25 Stars')
    expect(summary).not.toContain(BOT_TOKEN)
    expect(summary).not.toContain(BASE_ENV.CLOUDFLARE_API_TOKEN)
    expect(summary).not.toContain(await deriveWebhookSecret(BOT_TOKEN))
    expect(harness.logs.join('\n')).not.toContain(BOT_TOKEN)
  })
})

describe('установка: отказы останавливают шаг, а не маскируются', () => {
  it('нет обязательных настроек: ошибка с именами, без единого действия', async () => {
    const harness = createHarness({ env: { TELEGRAM_BOT_TOKEN: '' } })
    const error = await failure(deploy(harness.ctx))
    expect(error).toBeInstanceOf(MissingEnvError)
    expect((error as MissingEnvError).names).toEqual(['TELEGRAM_BOT_TOKEN'])
    expect(harness.wranglerCalls).toHaveLength(0)
    expect(harness.telegram).toHaveLength(0)
  })

  it('некорректная сумма Stars отбраковывается', async () => {
    for (const amount of ['0', '-5', '2.5', 'дорого']) {
      const harness = createHarness({ env: { STARS_AMOUNT: amount } })
      const error = await failure(deploy(harness.ctx))
      expect(error.message).toContain('stars_amount')
      expect(harness.wranglerCalls).toHaveLength(0)
    }
  })

  it('чужой бот: стоп до регистрации webhook', async () => {
    const harness = createHarness({ botUsername: 'some_other_bot' })
    const error = await failure(deploy(harness.ctx))
    expect(error).toBeInstanceOf(DeployError)
    expect((error as DeployError).step).toBe('getMe')
    expect(error.message).toContain('@alik_where_money_bot')
    expect(harness.wranglerCalls).toHaveLength(0)
    expect(harness.telegram.some((call) => call.method === 'setWebhook')).toBe(false)
  })

  it('посторонний webhook не затирается молча', async () => {
    const harness = createHarness({ webhookUrl: 'https://other.example/telegram/webhook' })
    const error = await failure(deploy(harness.ctx))
    expect((error as DeployError).step).toBe('getWebhookInfo')
    expect(error.message).toContain('replace_webhook_confirmed=true')
    expect(harness.wranglerCalls).toHaveLength(0)
    expect(harness.telegram.some((call) => call.method === 'setWebhook')).toBe(false)
  })

  it('замена webhook только по явному подтверждению', async () => {
    const harness = createHarness({
      webhookUrl: 'https://other.example/telegram/webhook',
      env: { CONFIRM_REPLACE_WEBHOOK: 'true' },
    })
    const result = await deploy(harness.ctx)
    expect(result.replacedWebhook).toBe(true)
    expect(harness.telegram.find((call) => call.method === 'setWebhook')?.payload.url).toBe(WEBHOOK_URL)
  })

  it('сбой deploy: ошибка шага, секреты и webhook не трогаются', async () => {
    const harness = createHarness({ wranglerFailureSubstring: 'deploy' })
    const error = await failure(deploy(harness.ctx))
    expect((error as DeployError).step).toBe('deploy')
    expect(harness.secretWrites).toHaveLength(0)
    expect(harness.telegram.some((call) => call.method === 'setWebhook')).toBe(false)
    expect(harness.telegram.some((call) => call.method === 'createInvoiceLink')).toBe(false)
  })

  it('отказ Cloudflare API: ошибка без токена в тексте', async () => {
    const harness = createHarness({ cloudflareFailure: true })
    const error = await failure(deploy(harness.ctx))
    expect((error as DeployError).step).toBe('cloudflare')
    expect(error.message).not.toContain(BASE_ENV.CLOUDFLARE_API_TOKEN)
    expect(error.message).toContain('403')
  })

  it('две базы с нашим именем: явная ошибка вместо выбора первой', async () => {
    const harness = createHarness({
      databases: [
        { uuid: 'db-a', name: 'alik-stars' },
        { uuid: 'db-b', name: 'alik-stars' },
      ],
    })
    const error = await failure(deploy(harness.ctx))
    expect((error as DeployError).step).toBe('d1')
    expect(error.message).toContain('2')
    expect(harness.wranglerCalls).toHaveLength(0)
  })

  it('нездоровый Worker: ошибка health, webhook не регистрируется', async () => {
    const harness = createHarness({ healthStatuses: [503, 503, 503, 503, 503, 503] })
    const error = await failure(deploy(harness.ctx))
    expect((error as DeployError).step).toBe('health')
    expect(harness.telegram.some((call) => call.method === 'setWebhook')).toBe(false)
  })
})
