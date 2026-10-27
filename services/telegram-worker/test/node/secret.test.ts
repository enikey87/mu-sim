import { describe, expect, it } from 'vitest'
import { botIdFromToken, deriveWebhookSecret, secretMatches } from '../../src/webhook-secret.ts'

const TOKEN = '123456789:AAH-super-secret-part'

describe('секрет webhook — производная токена, а не случайная строка', () => {
  it('одинаковый токен даёт одинаковый секрет', async () => {
    expect(await deriveWebhookSecret(TOKEN)).toBe(await deriveWebhookSecret(TOKEN))
  })

  it('другой бот даёт другой секрет', async () => {
    const other = await deriveWebhookSecret('987654321:AAH-super-secret-part')
    expect(other).not.toBe(await deriveWebhookSecret(TOKEN))
  })

  it('секрет состоит только из допустимых Telegram символов', async () => {
    const secret = await deriveWebhookSecret(TOKEN)
    expect(secret).toMatch(/^[A-Za-z0-9_-]{20,256}$/)
  })

  it('секрет не содержит токен и его секретную часть', async () => {
    const secret = await deriveWebhookSecret(TOKEN)
    expect(secret).not.toContain(TOKEN)
    expect(secret).not.toContain('AAH-super-secret-part')
    expect(secret).not.toContain('123456789')
  })

  it('токен без числового id отбраковывается', async () => {
    await expect(deriveWebhookSecret('not-a-token')).rejects.toThrow()
    expect(() => botIdFromToken(':abc')).toThrow()
  })
})

describe('сравнение заголовка', () => {
  it('совпадение', () => {
    expect(secretMatches('secret-value', 'secret-value')).toBe(true)
  })

  it('разное значение', () => {
    expect(secretMatches('secret-valuX', 'secret-value')).toBe(false)
  })

  it('разная длина', () => {
    expect(secretMatches('secret', 'secret-value')).toBe(false)
  })

  it('пустой ожидаемый секрет — всегда отказ', () => {
    expect(secretMatches('', '')).toBe(false)
    expect(secretMatches('anything', '')).toBe(false)
  })

  it('отсутствующий заголовок — отказ', () => {
    expect(secretMatches(null, 'secret-value')).toBe(false)
  })
})
