import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?fast')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
})

test('новая игра показывает чат, долг и варианты ответа', async ({ page }) => {
  await expect(page).toHaveTitle('Алик, где деньги?')
  await expect(page.locator('#debt')).toHaveText(/240\s000 ₽/)
  await expect(page.getByLabel('Сообщение')).toBeVisible()
  await expect(page.getByLabel('Отправить')).toBeDisabled()

  const choices = await page.locator('#choices button').count()
  expect(choices).toBeGreaterThanOrEqual(3)
  expect(choices).toBeLessThanOrEqual(4)
})

test('готовый вариант отправляется и открывает следующий ход', async ({ page }) => {
  const choice = page.locator('#choices button:not([disabled])').first()
  const text = (await choice.innerText()).trim()

  await choice.click()

  await expect(page.locator('.msg.me').filter({ hasText: text })).toBeVisible()
  await expect(page.locator('#composer')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('#choices button:not([disabled])').first()).toBeVisible()
})

test('ручной ответ отправляется, очищает поле и сохраняется после перезагрузки', async ({ page }) => {
  const text = 'Алик, пожалуйста, верните деньги'
  const input = page.getByLabel('Сообщение')

  await input.fill(text)
  await page.getByLabel('Отправить').click()

  await expect(page.locator('.msg.me').filter({ hasText: text })).toBeVisible()
  await expect(input).toHaveValue('')
  await expect(page.locator('#composer')).toHaveAttribute('aria-busy', 'false')

  await page.reload()
  await expect(page.locator('.msg.me').filter({ hasText: text })).toBeVisible()
})

test('досье открывается и закрывается клавишей Escape', async ({ page }) => {
  await page.getByTitle('Обещания и ачивки').click()
  await expect(page.getByRole('dialog', { name: 'Досье на Алика' })).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.getByRole('dialog', { name: 'Досье на Алика' })).toBeHidden()
})

test('длинная история: прокрутка, непрочитанные, своя реплика возвращает вниз', async ({ page }) => {
  await page.evaluate(() => {
    const g = (window as unknown as { __alik: { S: { msgs: unknown[]; nextId: number }; notifyMsgs: () => void } }).__alik
    for (let i = 0; i < 200; i++) {
      g.S.msgs.push({
        id: g.S.nextId++,
        kind: 'text',
        from: i % 2 ? 'me' : 'alik',
        text: `длинное-сообщение-${i}`,
        time: '12:00',
      })
    }
    g.notifyMsgs()
  })

  const chat = page.locator('#chat')
  await expect(page.getByText('длинное-сообщение-199')).toBeVisible()
  await chat.evaluate((el) => {
    el.scrollTop = 0
    el.dispatchEvent(new Event('scroll'))
  })
  await expect(page.getByText('длинное-сообщение-0')).toBeVisible()

  await page.evaluate(() => {
    const g = (window as unknown as { __alik: { push: (m: object) => void } }).__alik
    g.push({ kind: 'text', from: 'alik', text: 'входящее-пока-читаешь', time: '12:05' })
  })
  await expect(page.getByRole('button', { name: /новое сообщение|новых сообщени/i })).toBeVisible()
  await page.getByRole('button', { name: /новое сообщение|новых сообщени/i }).click()
  await expect(page.getByText('входящее-пока-читаешь')).toBeVisible()

  const input = page.getByLabel('Сообщение')
  await input.fill('моя реплика после длинной истории')
  await page.getByLabel('Отправить').click()
  await expect(page.locator('.msg.me').filter({ hasText: 'моя реплика после длинной истории' })).toBeVisible()
  await expect(page.locator('#composer')).toHaveAttribute('aria-busy', 'false')
  const atBottom = await chat.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop <= 30)
  expect(atBottom).toBe(true)
})
