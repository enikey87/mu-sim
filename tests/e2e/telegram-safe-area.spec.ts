import { expect, test, type Page } from '@playwright/test'

const insets = async (page: Page, device: number[], content: number[]) => {
  await page.evaluate(({ device, content }) => {
    const root = document.documentElement
    for (const [i, side] of ['top', 'right', 'bottom', 'left'].entries()) {
      root.style.setProperty(`--tg-safe-area-inset-${side}`, `${device[i]}px`)
      root.style.setProperty(`--tg-content-safe-area-inset-${side}`, `${content[i]}px`)
    }
  }, { device, content })
}

const padding = (page: Page) => page.locator('.phone').evaluate((el) => {
  const s = getComputedStyle(el)
  return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat)
})

test.beforeEach(async ({ page }) => {
  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
})

test('Telegram: шапка, композер и досье вне системной и клиентской safe area', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await insets(page, [24, 0, 34, 0], [56, 0, 0, 0])
  expect(await padding(page), 'веб не использует отступы Telegram').toEqual([0, 0, 0, 0])

  await page.evaluate(() => { document.documentElement.dataset.platform = 'telegram' })
  expect(await padding(page)).toEqual([80, 0, 34, 0])
  const header = await page.locator('.statusbar').boundingBox()
  const send = await page.locator('#sendBtn').boundingBox()
  expect(header!.y).toBeGreaterThanOrEqual(80)
  expect(send!.y + send!.height).toBeLessThanOrEqual(810)

  await page.getByTitle('Обещания и ачивки').click()
  await expect(page.getByRole('dialog', { name: 'Досье на Алика' })).toBeVisible()
  const sheet = await page.locator('.sheet').boundingBox()
  expect(sheet!.y).toBe(80)
  expect(sheet!.y + sheet!.height).toBe(810)
  await expect(page.getByLabel('Закрыть')).toBeInViewport()
})

test('Telegram: fullscreen и поворот обновляют отступы, выход снимает их', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => { document.documentElement.dataset.platform = 'telegram' })
  expect(await padding(page), 'старый SDK без inset-переменных').toEqual([0, 0, 0, 0])

  await insets(page, [24, 0, 34, 0], [56, 0, 0, 0])
  expect(await padding(page)).toEqual([80, 0, 34, 0])

  await page.setViewportSize({ width: 844, height: 390 })
  await insets(page, [0, 44, 21, 44], [32, 8, 0, 8])
  expect(await padding(page)).toEqual([32, 52, 21, 52])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await insets(page, [0, 0, 0, 0], [0, 0, 0, 0])
  expect(await padding(page)).toEqual([0, 0, 0, 0])
})

test('Telegram: на широком экране оверлеи защищены теми же отступами', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 })
  await insets(page, [24, 0, 34, 0], [56, 0, 0, 0])
  expect(await padding(page)).toEqual([0, 0, 0, 0])
  await page.evaluate(() => { document.documentElement.dataset.platform = 'telegram' })
  expect(await padding(page)).toEqual([80, 0, 34, 0])

  await page.getByTitle('Обещания и ачивки').click()
  const rects = await page.evaluate(() => {
    const phone = document.querySelector('.phone')!
    const sheet = document.querySelector('.sheet')!
    const p = phone.getBoundingClientRect()
    const s = sheet.getBoundingClientRect()
    const border = parseFloat(getComputedStyle(phone).borderTopWidth)
    return { top: s.top - p.top - border, bottom: p.bottom - s.bottom - border }
  })
  expect(rects).toEqual({ top: 80, bottom: 34 })
})

test('Telegram: системные env и SDK не складываются дважды; старый клиент сохраняет env', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 30, right: 4, bottom: 20, left: 4 } })
  expect(await padding(page)).toEqual([30, 4, 20, 4])
  await page.evaluate(() => { document.documentElement.dataset.platform = 'telegram' })
  expect(await padding(page), 'нет переменных SDK — остаются системные inset').toEqual([30, 4, 20, 4])

  await insets(page, [24, 0, 34, 0], [56, 0, 0, 0])
  expect(await padding(page)).toEqual([86, 4, 34, 4])
  await insets(page, [40, 8, 10, 8], [56, 0, 0, 0])
  expect(await padding(page)).toEqual([96, 8, 20, 8])

  await page.evaluate(() => { delete document.documentElement.dataset.platform })
  expect(await padding(page), 'другие платформы снова используют только env').toEqual([30, 4, 20, 4])
})

test('Telegram: интро, концовка и разряженный телефон остаются в безопасной области', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/?fast')
  const intro = page.getByRole('button', { name: 'Интро: коснитесь, чтобы пропустить' })
  await expect(intro).toBeVisible()
  await expect(page.getByText('Коснитесь, чтобы начать', { exact: true })).toBeVisible()
  await insets(page, [24, 0, 34, 0], [56, 0, 0, 0])
  await page.evaluate(() => { document.documentElement.dataset.platform = 'telegram' })

  const checkBounds = async (selector: string) => {
    await expect(page.locator(selector)).toBeVisible()
    const box = await page.locator(selector).boundingBox()
    expect(box!.y).toBe(80)
    expect(box!.y + box!.height).toBe(810)
  }
  await checkBounds('.intro')
  await intro.click()
  await intro.click()
  await expect(intro).toBeHidden()

  await page.evaluate(() => (window as unknown as { __alik: { reachEnding(id: string): Promise<void> } }).__alik.reachEnding('family'))
  await checkBounds('.ending')
  await page.evaluate(() => (window as unknown as { __alik: { closeEnding(): Promise<void> } }).__alik.closeEnding())
  await page.evaluate(() => (window as unknown as { __alik: { battery: { drain(n: number): void } } }).__alik.battery.drain(100))
  await checkBounds('.dead')
  await expect(page.getByRole('button', { name: 'Поставить на зарядку' })).toBeInViewport()
})
