import { expect, test } from '@playwright/test'

/**
 * Шелл холодной загрузки (#1443): первый кадр — из одного HTML.
 * JS и внешний CSS отключены, поэтому стили и индикатор могут прийти только инлайном из index.html;
 * этот же прогон — это и есть «curl сборки»: сервер отдаёт прод-артефакт (`vite preview`).
 */
test.describe('первый кадр без JS и без внешних файлов', () => {
  test.use({ javaScriptEnabled: false })

  test.beforeEach(async ({ page }) => {
    await page.route('**/*.css', (route) => route.abort())
  })

  test('«Алик печатает…» в светлой теме', async ({ page }) => {
    await page.goto('/')
    const boot = page.locator('#boot')
    await expect(boot).toBeVisible()
    await expect(boot).toContainText('Алик')
    await expect(boot).toContainText('печатает…')

    // оформление пришло инлайном: страница, телефон, панель — цвета палитры, а не прозрачный фон браузера
    const bg = (sel: string, prop: 'backgroundColor' | 'color') =>
      page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p as 'backgroundColor'], prop)
    expect(await bg('body', 'backgroundColor')).toBe('rgb(217, 221, 227)')
    expect(await bg('#boot', 'backgroundColor')).toBe('rgb(231, 235, 228)')
    expect(await bg('.boot-bubble', 'backgroundColor')).toBe('rgb(255, 255, 255)')
    expect(await bg('.boot-status', 'color')).toBe('rgb(47, 158, 92)')

    // индикатор — три анимированные точки, как в чате
    const dots = page.locator('.boot-bubble i')
    await expect(dots).toHaveCount(3)
    expect(await bg('.boot-bubble i', 'backgroundColor')).toBe('rgb(123, 133, 145)')
    expect(await dots.first().evaluate((el) => getComputedStyle(el).animationName)).toBe('boot-blink')
  })

  test('«Алик печатает…» в тёмной теме', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    const bg = (sel: string, prop: 'backgroundColor' | 'color') =>
      page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p as 'backgroundColor'], prop)
    expect(await bg('body', 'backgroundColor')).toBe('rgb(11, 14, 18)')
    expect(await bg('#boot', 'backgroundColor')).toBe('rgb(15, 26, 31)')
    expect(await bg('.boot-head', 'backgroundColor')).toBe('rgb(23, 33, 43)')
    expect(await bg('.boot-status', 'color')).toBe('rgb(95, 201, 138)')
  })

  test('reduced-motion выключает анимацию точек', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('.boot-bubble i').first()).toHaveCSS('animation-name', 'none')
  })
})

test('приложение стирает шелл при монтировании: индикатор не остаётся в разметке', async ({ page }) => {
  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('#boot')).toHaveCount(0)
})
