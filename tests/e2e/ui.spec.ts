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

test('поле сообщения имеет enterKeyHint=send', async ({ page }) => {
  await expect(page.getByLabel('Сообщение')).toHaveAttribute('enterkeyhint', 'send')
})

test('мобильный layout: композер в viewport, без горизонтального overflow', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'только mobile project')

  await page.addStyleTag({
    content: `:root { --safe-top: 47px; --safe-right: 0px; --safe-bottom: 34px; --safe-left: 0px; }`,
  })

  const metrics = await page.evaluate(() => {
    const phone = document.querySelector('.phone') as HTMLElement
    const send = document.getElementById('sendBtn') as HTMLElement
    const phoneBox = phone.getBoundingClientRect()
    const sendBox = send.getBoundingClientRect()
    const cs = getComputedStyle(phone)
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      sendBottom: sendBox.bottom,
      phoneBottom: phoneBox.bottom,
      sendVisible: sendBox.bottom <= phoneBox.bottom + 1 && sendBox.top >= phoneBox.top - 1,
    }
  })

  expect(metrics.paddingTop).toBe('47px')
  expect(metrics.paddingBottom).toBe('34px')
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
  expect(metrics.sendVisible).toBe(true)
})

test('landscape: нет горизонтального overflow при ненулевых боковых inset', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'только mobile project')

  await page.setViewportSize({ width: 844, height: 390 })
  await page.addStyleTag({
    content: `:root { --safe-top: 0px; --safe-right: 44px; --safe-bottom: 21px; --safe-left: 44px; }`,
  })

  const metrics = await page.evaluate(() => {
    const phone = document.querySelector('.phone') as HTMLElement
    const box = phone.getBoundingClientRect()
    const cs = getComputedStyle(phone)
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      phoneWidth: box.width,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      borderWidth: cs.borderLeftWidth,
      fullscreen: matchMedia('(max-width: 500px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)').matches,
    }
  })

  expect(metrics.fullscreen).toBe(true)
  expect(metrics.borderWidth).toBe('0px')
  expect(metrics.paddingLeft).toBe('44px')
  expect(metrics.paddingRight).toBe('44px')
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
})

test('landscape desktop: короткая высота не снимает рамку телефона', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('desktop'), 'только desktop project')

  await page.setViewportSize({ width: 844, height: 390 })
  await page.addStyleTag({
    content: `:root { --safe-top: 0px; --safe-right: 44px; --safe-bottom: 21px; --safe-left: 44px; }`,
  })

  const metrics = await page.evaluate(() => {
    const phone = document.querySelector('.phone') as HTMLElement
    const box = phone.getBoundingClientRect()
    const cs = getComputedStyle(phone)
    return {
      phoneWidth: Math.round(box.width),
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      borderWidth: cs.borderLeftWidth,
    }
  })

  expect(metrics.phoneWidth).toBe(400)
  expect(metrics.borderWidth).not.toBe('0px')
  expect(metrics.paddingLeft).toBe('0px')
  expect(metrics.paddingRight).toBe('0px')
})
