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

test('досье: модальность с клавиатуры, фон недоступен', async ({ page }) => {
  await page.getByTitle('Обещания и ачивки').focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Досье на Алика' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(page.locator('.phone-surface')).toHaveAttribute('inert')
  await expect(page.getByLabel('Закрыть')).toBeFocused()

  await page.keyboard.press('Tab')
  const inDialog = await page.evaluate(() => {
    const d = document.querySelector('.sheet-inner')
    return !!d && d.contains(document.activeElement)
  })
  expect(inDialog).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByTitle('Обещания и ачивки')).toBeFocused()
  await expect(page.locator('.phone-surface')).not.toHaveAttribute('inert')
})
