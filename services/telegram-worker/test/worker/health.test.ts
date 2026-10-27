import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { callWorker, mockTelegram, seedCatalog, TEST_SECRET, TEST_TOKEN } from './helpers.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('health', () => {
  it('готовый Worker: 200 и никаких внешних запросов', async () => {
    const { calls } = mockTelegram()
    const response = await callWorker('/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(calls).toHaveLength(0)
  })

  it('HEAD отдаёт тот же статус без тела', async () => {
    mockTelegram()
    const response = await callWorker('/health', { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('без BOT_TOKEN: 503 и категория отказа', async () => {
    mockTelegram()
    const response = await callWorker('/health', {}, { BOT_TOKEN: '' })
    expect(response.status).toBe(503)
    const body = (await response.json()) as { status: string; failed: string[] }
    expect(body.status).toBe('degraded')
    expect(body.failed).toContain('bot-token')
  })

  it('без WEBHOOK_SECRET: 503', async () => {
    mockTelegram()
    const response = await callWorker('/health', {}, { WEBHOOK_SECRET: '' })
    expect(response.status).toBe(503)
    const body = (await response.json()) as { failed: string[] }
    expect(body.failed).toContain('webhook-secret')
  })

  it('без активного каталога: 503 с категорией catalog', async () => {
    mockTelegram()
    await seedCatalog(env.DB, { active: false })
    const response = await callWorker('/health')
    expect(response.status).toBe(503)
    const body = (await response.json()) as { failed: string[] }
    expect(body.failed).toContain('catalog')
  })

  it('битая схема D1: 503 с категорией d1', async () => {
    mockTelegram()
    await env.DB.prepare('ALTER TABLE payments RENAME TO payments_renamed').run()
    try {
      const response = await callWorker('/health')
      expect(response.status).toBe(503)
      const body = (await response.json()) as { failed: string[] }
      expect(body.failed).toContain('d1')
    } finally {
      await env.DB.prepare('ALTER TABLE payments_renamed RENAME TO payments').run()
    }
  })

  it('ответ не содержит секретов и идентификаторов плательщиков', async () => {
    mockTelegram()
    const response = await callWorker('/health')
    const text = await response.text()
    expect(text).not.toContain(TEST_TOKEN)
    expect(text).not.toContain(TEST_SECRET)
    expect(text).not.toContain('777001')
  })
})
