import { cloudflareClient } from './cloudflare.ts'
import { requireEnv } from './env.ts'
import { databaseNameFrom, readWranglerConfig, writeGeneratedConfig, type InstallerContext } from './project.ts'

export class ProjectError extends Error {
  readonly step: string

  constructor(step: string, message: string) {
    super(message)
    this.name = 'ProjectError'
    this.step = step
  }
}

export interface ProjectHandle {
  workerName: string
  workerUrl: string
  webhookUrl: string
  databaseName: string
  databaseId: string
  configPath: string
  botToken: string
  cloudflareToken: string
  accountId: string
}

/**
 * Общая подготовка для status/refund: находит нашу базу по имени и пишет временную
 * конфигурацию. Новую базу не создаёт — эти режимы не должны менять установку.
 */
export async function prepareProject(ctx: InstallerContext): Promise<ProjectHandle> {
  const env = requireEnv(ctx.env, ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'TELEGRAM_BOT_TOKEN'])
  const base = await readWranglerConfig(ctx)
  const databaseName = databaseNameFrom(base)
  const cf = cloudflareClient({
    token: env.CLOUDFLARE_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    fetchImpl: ctx.fetchImpl,
  })

  const databases = await cf.listD1Databases(databaseName)
  const exact = databases.filter((database) => database.name === databaseName)
  if (exact.length > 1) {
    throw new ProjectError('d1', `нашлось ${exact.length} баз с именем ${databaseName}; выбрать одну автоматически нельзя`)
  }
  const database = exact[0]
  if (!database?.uuid) {
    throw new ProjectError('d1', `база ${databaseName} не найдена: сначала запустите deploy`)
  }

  const subdomain = await cf.workersSubdomain()
  const workerUrl = `https://${base.name}.${subdomain}.workers.dev`
  const configPath = await writeGeneratedConfig(ctx, base, database.uuid)

  return {
    workerName: base.name,
    workerUrl,
    webhookUrl: `${workerUrl}/telegram/webhook`,
    databaseName,
    databaseId: database.uuid,
    configPath,
    botToken: env.TELEGRAM_BOT_TOKEN,
    cloudflareToken: env.CLOUDFLARE_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
  }
}
