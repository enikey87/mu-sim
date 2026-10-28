import { expect, test, type Page } from '@playwright/test'

/**
 * Крах отрисовки (#1482): партия живёт вне React, поэтому интерфейс перемонтируется, а не стирается.
 * Краш — подменой поля состояния, которое читает шапка: настоящее падение отрисовки, не тестовый флаг сборки.
 */

type Snapshot = { day: number; sent: number }

const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => {
  const g = (window as unknown as { __alik: { S: { day: number; stats: { sent: number } } } }).__alik
  return { day: g.S.day, sent: g.S.stats.sent }
})

/** Ход игрока до краха: у свежей партии day 0 и sent 0, и тогда подмена на новую партию невидима. */
const sendTurn = async (page: Page): Promise<string> => {
  const choice = page.locator('#choices button:not([disabled])').first()
  const text = (await choice.innerText()).trim()
  await choice.click()
  await expect(page.locator('.msg.me').filter({ hasText: text })).toBeVisible()
  await expect(page.locator('#composer')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 })
  return text
}

const breakRender = (page: Page): Promise<void> => page.evaluate(() => {
  const g = (window as unknown as { __alik: { S: Record<string, unknown>; notifyMsgs: () => void } }).__alik
  const battery = Object.getOwnPropertyDescriptor(g.S, 'battery')
  ;(window as unknown as { __restoreBattery?: () => void }).__restoreBattery = () => {
    if (battery) Object.defineProperty(g.S, 'battery', battery)
  }
  Object.defineProperty(g.S, 'battery', { configurable: true, get() { throw new Error('boom') } })
  g.notifyMsgs()
})

const restoreRender = (page: Page): Promise<void> => page.evaluate(() => {
  (window as unknown as { __restoreBattery: () => void }).__restoreBattery()
})

test.beforeEach(async ({ page }) => {
  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
})

test('крах отрисовки: две кнопки, «Перезагрузить интерфейс» оставляет партию на месте', async ({ page }) => {
  const sent = await sendTurn(page)
  const before = await snapshot(page)
  expect(before.sent).toBeGreaterThan(0)

  await breakRender(page)
  await expect(page.getByText(/Что-то сломалось/)).toBeVisible()
  await expect(page.locator('.crash button')).toHaveCount(2)

  await restoreRender(page)
  await page.getByRole('button', { name: 'Перезагрузить интерфейс' }).click()

  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('.msg.me').filter({ hasText: sent })).toBeVisible()
  expect(await snapshot(page)).toEqual(before)
})

test('второй крах подряд: экран возвращается, стирание рекомендовано, цикла перезагрузок нет', async ({ page }) => {
  const sent = await sendTurn(page)
  await breakRender(page)
  await expect(page.getByText(/Что-то сломалось/)).toBeVisible()

  await page.getByRole('button', { name: 'Перезагрузить интерфейс' }).click()
  // перемонтирование падает на том же состоянии — экран вернулся, и это второй крах подряд
  await expect(page.getByText(/Что-то сломалось/)).toBeVisible()
  await expect(page.locator('.crash button')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Стереть сохранение и начать заново' })).toHaveClass(/recommended/)
  await expect(page.getByText(/остаётся стереть сохранение/)).toBeVisible()

  // «Стереть» по-прежнему запасной рубеж: после починки отрисовки она даёт новую партию
  await restoreRender(page)
  await page.getByRole('button', { name: 'Стереть сохранение и начать заново' }).click()
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('.msg.me').filter({ hasText: sent })).toHaveCount(0)
  expect((await snapshot(page)).sent).toBe(0)
})
