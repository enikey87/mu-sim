import { expect, test } from '@playwright/test'

/**
 * Страница «О игре и приватности» (#1484): требование модерации витрин. Проверяется то, чего не видно
 * в юнит-тесте: страница действительно лежит в сборке по адресу рядом с игрой, отдаётся как HTML,
 * рисует обе темы и открывается ссылкой из досье — отдельной вкладкой, не вместо партии.
 */

test('страница лежит в сборке: 200, по-русски, без скриптов', async ({ request }) => {
  const res = await request.get('/privacy.html')
  // мутация «файл не попал в сборку» — здесь 404, и тест красный
  expect(res.status(), 'privacy.html не попал в сборку').toBe(200)
  expect(res.headers()['content-type']).toContain('text/html')
  const html = await res.text()
  expect(html).toContain('<html lang="ru">')
  for (const counter of ['Яндекс Метрика', 'Umami', 'PostHog']) expect(html, counter).toContain(counter)
  expect(html).toContain('памяти браузера')
  expect(html).not.toContain('<script')
})

test('обе темы: тёмная меняет фон страницы и цвет текста', async ({ page }) => {
  const paint = () => page.evaluate(() => {
    const body = getComputedStyle(document.body)
    const card = getComputedStyle(document.querySelector('main')!)
    return { page: body.backgroundColor, text: body.color, card: card.backgroundColor }
  })

  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/privacy.html')
  const light = await paint()
  // палитра src/styles.css: --page #d9dde3, --text #111418, --panel #ffffff
  expect(light).toEqual({ page: 'rgb(217, 221, 227)', text: 'rgb(17, 20, 24)', card: 'rgb(255, 255, 255)' })

  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await paint()
  // --page #0b0e12, --text #e9edf1, --panel #17212b
  expect(dark).toEqual({ page: 'rgb(11, 14, 18)', text: 'rgb(233, 237, 241)', card: 'rgb(23, 33, 43)' })
})

test('ссылка из досье открывает страницу отдельной вкладкой', async ({ page, context }) => {
  // адрес в ссылке — публичный (его знает только сборка), содержимое — из этой же сборки:
  // сеть витрины тест не трогает
  const artifact = await (await page.request.get('/privacy.html')).body()
  await context.route('https://enikey87.github.io/mu-sim/privacy.html', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: artifact }))

  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await page.locator('#infoBtn').click()
  const link = page.getByRole('link', { name: 'О игре и приватности' })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', 'https://enikey87.github.io/mu-sim/privacy.html')
  await expect(link).toHaveAttribute('target', '_blank')

  const [tab] = await Promise.all([context.waitForEvent('page'), link.click()])
  await tab.waitForLoadState('domcontentloaded')
  await expect(tab.getByRole('heading', { level: 1 })).toHaveText('О игре и приватности')
  // партия на месте: ссылка ушла в новую вкладку, а не заменила игру
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
})
