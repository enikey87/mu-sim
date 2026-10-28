import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import {
  callWorker,
  lastSend,
  miniCall,
  mockTelegram,
  nextId,
  playerRows,
  runScheduled,
  saveRows,
  seedPlayer,
  sendWebhook,
  signedInitData,
  TEST_TOKEN,
  transferTokenOf,
} from './helpers.ts'
import { verifyInitData } from '../../src/initdata.ts'

const GAME_ORIGIN = 'https://enikey87.github.io'

afterEach(() => {
  vi.unstubAllGlobals()
})

function commandUpdate(text: string, userId = 777001): Record<string, unknown> {
  return {
    update_id: nextId(),
    message: {
      message_id: nextId(),
      from: { id: userId, is_bot: false, first_name: 'Игрок' },
      chat: { id: userId, type: 'private' },
      text,
    },
  }
}

const savePayload = JSON.stringify({ msgs: [{ kind: 'text', from: 'alik', text: 'где деньги' }], day: 42, mem: { 'arc.x': 3 } })

describe('подпись initData', () => {
  // Вектор посчитан отдельно (node:crypto) по алгоритму Telegram: он проверяет,
  // что воркер считает ту же подпись, а не «согласованную сама с собой».
  const FIXTURE =
    'auth_date=1770000000&query_id=AAH-test-query&user=%7B%22id%22%3A777001%2C%22first_name%22%3A%22%D0%98%D0%B3%D1%80%D0%BE%D0%BA%22%7D&hash=f7988624b16554e3cd1b4e354a30488194df701a85811480bb7916cdf0fa5013'
  const NOW = 1770000100_000

  it('принимает подпись, посчитанную по алгоритму Telegram', async () => {
    const verdict = await verifyInitData(FIXTURE, TEST_TOKEN, NOW, 24 * 60 * 60 * 1000)
    expect(verdict).toEqual({ ok: true, userId: 777001, authDate: 1770000000 })
  })

  it('правка одного байта подписи — отказ', async () => {
    const tampered = FIXTURE.replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`)
    await expect(verifyInitData(tampered, TEST_TOKEN, NOW, 24 * 60 * 60 * 1000)).resolves.toMatchObject({ ok: false, reason: 'signature' })
  })

  it('чужой токен бота подпись не подтверждает', async () => {
    await expect(verifyInitData(FIXTURE, '999:other-token', NOW, 24 * 60 * 60 * 1000)).resolves.toMatchObject({ ok: false, reason: 'signature' })
  })
})

describe('/mini/hello: заход и серверная копия партии', () => {
  it('подписанный заход регистрирует игрока в D1', async () => {
    const initData = await signedInitData(777001)
    const response = await miniCall('/mini/hello', { initData, version: 1 })
    expect(response.status).toBe(200)
    const players = await playerRows()
    expect(players).toHaveLength(1)
    expect(players[0]).toMatchObject({ telegram_user_id: 777001, chat_id: 777001, finished: 0, reminder_count: 0, opt_out: 0 })
    expect(String(players[0]?.last_seen_at ?? '')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('подделанная подпись: 401 и ни одной строки в базе', async () => {
    const initData = (await signedInitData(777001)).replace(/hash=[0-9a-f]+/, 'hash='.padEnd(70, 'a'))
    const response = await miniCall('/mini/hello', { initData, version: 1 })
    expect(response.status).toBe(401)
    expect(await playerRows()).toHaveLength(0)
  })

  it('подпись чужим ботом: 401', async () => {
    const initData = await signedInitData(777001, { token: '999:other-token' })
    const response = await miniCall('/mini/hello', { initData, version: 1 })
    expect(response.status).toBe(401)
  })

  it('старая подпись (сутки — предел): 401', async () => {
    const initData = await signedInitData(777001, { authDate: Math.floor(Date.now() / 1000) - 25 * 60 * 60 })
    const response = await miniCall('/mini/hello', { initData, version: 1 })
    expect(response.status).toBe(401)
  })

  it('партия ложится в D1 байт в байт', async () => {
    const initData = await signedInitData(777001)
    const response = await miniCall('/mini/hello', { initData, version: 1, save: savePayload, finished: false })
    expect(response.status).toBe(200)
    const saves = await saveRows()
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({ telegram_user_id: 777001, version: 1, payload: savePayload })
  })

  it('заход без партии не создаёт сохранение', async () => {
    const initData = await signedInitData(777001)
    await miniCall('/mini/hello', { initData, version: 1 })
    expect(await saveRows()).toHaveLength(0)
  })

  it('заход сбрасывает серию напоминаний, но не снимает «не напоминать»', async () => {
    await seedPlayer({ userId: 777001, reminderCount: 2, lastReminderAt: new Date(Date.now() - 86_400_000).toISOString(), optOut: true })
    const initData = await signedInitData(777001)
    await miniCall('/mini/hello', { initData, version: 1 })
    const players = await playerRows()
    expect(players[0]).toMatchObject({ reminder_count: 0, opt_out: 1 })
  })

  it('концовка на экране уходит в строку игрока', async () => {
    const initData = await signedInitData(777001)
    await miniCall('/mini/hello', { initData, version: 1, finished: true })
    expect(await playerRows()).toMatchObject([{ telegram_user_id: 777001, finished: 1 }])
  })

  it('CORS: разрешённый origin получает заголовок, чужой — нет', async () => {
    const initData = await signedInitData(777001)
    const allowed = await miniCall('/mini/hello', { initData, version: 1 }, { origin: GAME_ORIGIN })
    expect(allowed.headers.get('access-control-allow-origin')).toBe(GAME_ORIGIN)
    const foreign = await miniCall('/mini/hello', { initData, version: 1 }, { origin: 'https://evil.example' })
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('предзапрос CORS: 204 и разрешённый POST', async () => {
    const response = await callWorker('/mini/hello', {
      method: 'OPTIONS',
      headers: { origin: GAME_ORIGIN, 'access-control-request-method': 'POST' },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('GET на /mini/hello — 405, неизвестный /mini/* — 404', async () => {
    expect((await callWorker('/mini/hello', { method: 'GET' })).status).toBe(405)
    expect((await callWorker('/mini/nope', { method: 'POST' })).status).toBe(404)
  })
})

describe('/mini/restore: перенос партии по одноразовому токену', () => {
  it('токен возвращает то же сохранение и гаснет на втором использовании', async () => {
    const initData = await signedInitData(777001)
    await miniCall('/mini/hello', { initData, version: 1, save: savePayload })

    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/load'))
    const token = transferTokenOf(calls)
    expect(token).not.toBe('')

    const first = await miniCall('/mini/restore', { initData, token })
    expect(first.status).toBe(200)
    const body = (await first.json()) as { save: string; version: number }
    expect(body.save).toBe(savePayload)
    expect(body.version).toBe(1)

    const second = await miniCall('/mini/restore', { initData, token })
    expect(second.status).toBe(410)
    expect(await second.text()).not.toContain('msgs')
  })

  it('токен чужого игрока не отдаёт чужую партию', async () => {
    const owner = await signedInitData(777001)
    await miniCall('/mini/hello', { initData: owner, version: 1, save: savePayload })
    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/load', 777001))
    const token = transferTokenOf(calls)

    const stranger = await signedInitData(777002)
    // у второго игрока нет своей партии: чужая строка ему не видна ни статусом, ни телом
    const response = await miniCall('/mini/restore', { initData: stranger, token })
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('msgs')
  })

  it('просроченный токен — отказ, сохранение на месте', async () => {
    const initData = await signedInitData(777001)
    await miniCall('/mini/hello', { initData, version: 1, save: savePayload })
    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/load'))
    const token = transferTokenOf(calls)
    await env.DB.prepare('UPDATE transfer_tokens SET expires_at = ?').bind(new Date(Date.now() - 60_000).toISOString()).run()

    const response = await miniCall('/mini/restore', { initData, token })
    expect(response.status).toBe(410)
    expect(await saveRows()).toHaveLength(1)
  })

  it('подпись обязательна и для переноса', async () => {
    const initData = await signedInitData(777001)
    await miniCall('/mini/hello', { initData, version: 1, save: savePayload })
    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/load'))
    const token = transferTokenOf(calls)

    const forged = (await signedInitData(777001)).replace(/hash=[0-9a-f]+/, 'hash='.padEnd(70, 'f'))
    const response = await miniCall('/mini/restore', { initData: forged, token })
    expect(response.status).toBe(401)
  })
})

describe('/save и /load в боте', () => {
  it('/save подтверждает серверную копию', async () => {
    const initData = await signedInitData(777001)
    await miniCall('/mini/hello', { initData, version: 1, save: savePayload })
    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/save'))
    const sent = lastSend(calls)
    expect(sent.text).toContain('Партия на сервере')
    expect(sent.keyboard).toBeUndefined()
  })

  it('/save без копии говорит, откуда она берётся', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/save'))
    expect(lastSend(calls).text).toContain('Сохранять пока нечего')
  })

  it('/load без копии не выпускает ссылку', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/load'))
    const sent = lastSend(calls)
    expect(sent.text).toContain('Переносить нечего')
    expect(sent.keyboard).toBeUndefined()
  })

  it('ссылка переноса — та же игра со startapp, ссылка живёт час', async () => {
    const initData = await signedInitData(777001)
    await miniCall('/mini/hello', { initData, version: 1, save: savePayload })
    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/load'))
    const keyboard = lastSend(calls).keyboard as { inline_keyboard: Array<Array<{ url: string }>> }
    const url = new URL(keyboard.inline_keyboard[0]![0]!.url)
    expect(url.origin + url.pathname).toBe('https://t.me/alik_where_money_bot/game')
    expect(url.searchParams.get('startapp')).toHaveLength(43)

    const row = (await env.DB.prepare('SELECT created_at, expires_at FROM transfer_tokens').first<{ created_at: string; expires_at: string }>())!
    const ttl = Date.parse(row.expires_at) - Date.parse(row.created_at)
    expect(ttl).toBe(60 * 60 * 1000)
  })

  it('кнопка «Не напоминать» снимает игрока с рассылки', async () => {
    await seedPlayer({ userId: 777001, lastSeen: new Date(Date.now() - 3 * 86_400_000).toISOString() })

    const { calls } = mockTelegram()
    const response = await sendWebhook({
      update_id: nextId(),
      callback_query: {
        id: 'cb-1',
        from: { id: 777001, is_bot: false, first_name: 'Игрок' },
        data: 'no_remind',
        message: { message_id: 12, chat: { id: 777001, type: 'private' } },
      },
    })
    expect(response.status).toBe(200)
    expect(calls.map((call) => call.method)).toContain('answerCallbackQuery')
    expect(calls.map((call) => call.method)).toContain('editMessageReplyMarkup')
    expect(await playerRows()).toMatchObject([{ telegram_user_id: 777001, opt_out: 1 }])

    const { calls: after } = mockTelegram()
    await runScheduled()
    expect(after.filter((call) => call.method === 'sendMessage')).toHaveLength(0)
  })
})
