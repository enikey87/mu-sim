import { createContext, writeOutputs, writeSummary } from './lib/cli.ts'
import { deploy, renderDeploySummary } from './lib/deploy.ts'
import { redact } from './lib/runner.ts'

const ctx = createContext()
const secrets = [ctx.env.TELEGRAM_BOT_TOKEN, ctx.env.CLOUDFLARE_API_TOKEN]

try {
  const result = await deploy(ctx)
  ctx.log(`готово: ${result.workerUrl}`)
  await writeOutputs({
    worker_url: result.workerUrl,
    invoice_url: result.invoiceUrl,
    stars_amount: String(result.amount),
  })
  await writeSummary(renderDeploySummary(result))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  const step = typeof error === 'object' && error !== null && 'step' in error ? `: ${String(error.step)}` : ''
  console.error(redact(`deploy${step}: ${message}`, secrets))
  process.exitCode = 1
}
