import { describe, expect, it } from 'vitest'
import { SAVE_VERSION, transferChannel, transferToken } from './transfer'

interface Call {
  url: string
  body: Record<string, unknown>
}

function capture(handler: () => Response | Error = () => json({ ok: true })): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
    const result = handler()
    if (result instanceof Error) throw result
    return result
  }) as typeof fetch
  return { calls, fetchImpl }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const CONFIG = { url: 'https://worker.test/', initData: 'auth_date=1&user=%7B%7D&hash=x', startParam: 'token_1234567890' }

describe('канал переноса партии (#1488)', () => {
  it('заход отправляет сохранение и признак концовки на /mini/hello', () => {
    const { calls, fetchImpl } = capture()
    transferChannel(CONFIG, { fetch: fetchImpl }).push('{"day":42}', false)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://worker.test/mini/hello')
    expect(calls[0]?.body).toEqual({
      initData: CONFIG.initData,
      version: SAVE_VERSION,
      save: '{"day":42}',
      finished: false,
    })
  })

  it('заход без партии всё равно регистрирует игрока', () => {
    const { calls, fetchImpl } = capture()
    transferChannel(CONFIG, { fetch: fetchImpl }).push(null, false)
    expect(calls[0]?.body.save).toBeNull()
  })

  it('пустой конфиг — канала нет: ни одного запроса', () => {
    const { calls, fetchImpl } = capture()
    const channel = transferChannel({ url: '', initData: '', startParam: null }, { fetch: fetchImpl })
    channel.push('{}', false)
    expect(calls).toHaveLength(0)
    expect(channel.token()).toBeNull()
  })

  it('сбой сети при отправке не ломает игру', () => {
    const { fetchImpl } = capture(() => new TypeError('offline'))
    expect(() => transferChannel(CONFIG, { fetch: fetchImpl }).push('{}', false)).not.toThrow()
  })

  it('восстановление отдаёт ровно ту строку, что вернул воркер', async () => {
    const { calls, fetchImpl } = capture(() => json({ ok: true, version: 1, save: '{"day":7}' }))
    const save = await transferChannel(CONFIG, { fetch: fetchImpl }).pull('token_1234567890')
    expect(save).toBe('{"day":7}')
    expect(calls[0]?.url).toBe('https://worker.test/mini/restore')
    expect(calls[0]?.body).toEqual({ initData: CONFIG.initData, token: 'token_1234567890' })
  })

  it('погашенный или просроченный токен — пусто, без исключения', async () => {
    const { fetchImpl } = capture(() => json({ error: 'token-invalid' }, 410))
    await expect(transferChannel(CONFIG, { fetch: fetchImpl }).pull('token_1234567890')).resolves.toBeNull()
  })

  it('сеть при восстановлении — пусто', async () => {
    const { fetchImpl } = capture(() => new TypeError('offline'))
    await expect(transferChannel(CONFIG, { fetch: fetchImpl }).pull('token_1234567890')).resolves.toBeNull()
  })

  it('ответ без строки сохранения не превращается в пустую партию', async () => {
    const { fetchImpl } = capture(() => json({ ok: true, save: 42 }))
    await expect(transferChannel(CONFIG, { fetch: fetchImpl }).pull('token_1234567890')).resolves.toBeNull()
  })
})

describe('токен из ссылки startapp', () => {
  it('принимает base64url-токен', () => {
    expect(transferToken('AbC_d-1234567890')).toBe('AbC_d-1234567890')
  })

  it('чужая строка в startapp не становится запросом', () => {
    for (const raw of ['', 'short', 'with space', 'https://evil.example', '../../etc', 'x'.repeat(200)]) {
      expect(transferToken(raw), raw).toBeNull()
    }
  })
})
