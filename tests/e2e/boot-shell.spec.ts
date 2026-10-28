import { expect, test } from '@playwright/test'

/**
 * Шелл холодной загрузки (#1443, #1476): первый кадр — из одного HTML.
 * JS и внешний CSS отключены, поэтому стили и индикатор могут прийти только инлайном из index.html;
 * этот же прогон — это и есть «curl сборки»: сервер отдаёт прод-артефакт (`vite preview`).
 */
test.describe('первый кадр без JS и без внешних файлов', () => {
  test.use({ javaScriptEnabled: false })

  test.beforeEach(async ({ page }) => {
    await page.route('**/*.css', (route) => route.abort())
  })

  test('уровень в светлой теме, без рамки телефона и шапки чата', async ({ page }) => {
    await page.goto('/')
    const boot = page.locator('#boot')
    await expect(boot).toBeVisible()
    await expect(page.locator('#boot .lvl')).toBeVisible()
    // «Алик печатает…» — второе окно: до титр его не видно
    await expect(page.locator('#boot .wt')).toBeHidden()
    await expect(page.locator('#boot .wt')).toContainText('Алик печатает…')

    // фальш-чата в первом кадре нет: ни рамки телефона, ни шапки с аватаром
    const box = async (sel: string, prop: 'backgroundColor' | 'color' | 'borderTopWidth' | 'borderTopColor') =>
      page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p as 'backgroundColor'], prop)
    expect(await box('#boot', 'backgroundColor')).toBe('rgba(0, 0, 0, 0)')
    expect(await box('#boot', 'borderTopWidth')).toBe('0px')
    await expect(page.locator('.boot-head')).toHaveCount(0)

    // оформление пришло инлайном: страница темы и капсула уровня — цвета палитры, а не прозрачный фон браузера
    expect(await box('body', 'backgroundColor')).toBe('rgb(217, 221, 227)')
    expect(await box('#boot .lvl', 'backgroundColor')).toBe('rgb(255, 255, 255)')
    expect(await box('#boot .lvl', 'borderTopColor')).toBe('rgb(123, 133, 145)')

    // индикатор — пузырёк уровня, который выставляется к центру с перелётами, а не бесконечная строка точек
    const spirit = page.locator('#boot .spr')
    expect(await spirit.evaluate((el) => getComputedStyle(el).animationName)).toBe('hunt')
    // капсула стоит по центру первого кадра
    const viewport = page.viewportSize()!
    const lvl = (await page.locator('#boot .lvl').boundingBox())!
    expect(Math.abs(lvl.x + lvl.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1)
  })

  test('уровень в тёмной теме', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    const prop = (sel: string, p: 'backgroundColor' | 'borderTopColor') =>
      page.locator(sel).first().evaluate((el, key) => getComputedStyle(el)[key as 'backgroundColor'], p)
    expect(await prop('body', 'backgroundColor')).toBe('rgb(11, 14, 18)')
    expect(await prop('#boot .lvl', 'backgroundColor')).toBe('rgb(11, 14, 18)')
    expect(await prop('#boot .lvl', 'borderTopColor')).toBe('rgb(138, 151, 164)')
    // пузырёк в тёмной теме — светлый, как в одобренном макете
    expect(await prop('#boot .spr', 'backgroundColor')).toBe('rgba(0, 0, 0, 0)')
    expect(await page.locator('#boot .spr').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('rgb(233, 237, 241)')
  })

  test('reduced-motion: пузырёк замирает у центра', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const spirit = page.locator('#boot .spr')
    await expect(spirit).toHaveCSS('animation-name', 'none')
    // не «какая-то» статичная поза, а именно центр капсулы — между двумя рисками
    const lvl = (await page.locator('#boot .lvl').boundingBox())!
    const spr = (await spirit.boundingBox())!
    expect(Math.abs(spr.x + spr.width / 2 - (lvl.x + lvl.width / 2))).toBeLessThanOrEqual(1)
  })
})

test('приложение стирает шелл при монтировании: индикатор не остаётся в разметке', async ({ page }) => {
  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('#boot')).toHaveCount(0)
})
