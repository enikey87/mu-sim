import { expect, test, type Page } from '@playwright/test'

/**
 * Экран блокировки (#1522): первый кадр — из одного HTML, а не белый экран; дальше замок дорабатывают
 * титры, а чат его увозит. JS и внешний CSS отключены в первой части, поэтому стили замка могут прийти
 * только инлайном из index.html; этот же прогон — «curl сборки»: сервер отдаёт прод-артефакт (vite preview).
 */

/** URL входного скрипта из index.html: всё остальное — пакет приложения и его чанки. */
const entryScript = async (page: Page): Promise<string> => {
  const html = await (await page.request.get('/')).text()
  const src = /<script type="module"[^>]*src="([^"]+)"/.exec(html)?.[1] ?? ''
  return src.replace(/^\.\//, '')
}

const isEntry = (url: string, entry: string): boolean => url.endsWith(entry.split('/').pop() ?? entry)

/** Задержка пакета приложения: загрузка дольше порога уровня. */
const slowPackage = async (page: Page, ms: number): Promise<void> => {
  const entry = await entryScript(page)
  await page.route('**/*.js', async (route) => {
    if (isEntry(route.request().url(), entry)) return route.continue()
    await new Promise((resolve) => setTimeout(resolve, ms))
    return route.continue()
  })
}

const opacity = (page: Page, selector: string): Promise<number> =>
  page.locator(selector).evaluate((el) => Number(getComputedStyle(el).opacity))

test.describe('первый кадр без JS и без внешних файлов', () => {
  test.use({ javaScriptEnabled: false })

  test.beforeEach(async ({ page }) => {
    await page.route('**/*.css', (route) => route.abort())
  })

  test('замок в светлой теме: та же рамка и часы, что у интро и чата', async ({ page }) => {
    await page.goto('/')
    const lock = page.locator('#lock-screen')
    await expect(lock).toBeVisible()
    await expect(lock.locator('.intro-date')).toHaveText('18 марта 2026 г.')
    // время ставит загрузчик: без JS в разметке прочерк, а не чужие часы
    await expect(lock.locator('.intro-time')).toHaveText('--:--')
    // уровень — индикатор загрузки: без загрузчика ничего не грузится, и он не врёт
    await expect(lock.locator('.lvl')).toBeHidden()
    // «Алик печатает…» отменён решением оператора: второго индикатора в разметке нет
    await expect(lock.locator('.wt')).toHaveCount(0)
    // без JS играть нечем — замок говорит, что включить (текст в разметке, сторож: boot-shell.test.ts)
    expect(await lock.locator('noscript').count()).toBe(1)

    const prop = (sel: string, p: 'backgroundColor' | 'borderTopWidth' | 'borderTopColor' | 'backgroundImage') =>
      page.locator(sel).first().evaluate((el, key) => getComputedStyle(el)[key as 'backgroundColor'], p)

    // оформление пришло инлайном: страница темы и приглушённый градиент замка, а не прозрачный фон браузера
    expect(await prop('body', 'backgroundColor')).toBe('rgb(217, 221, 227)')
    expect(await prop('#lock-screen', 'backgroundImage')).toContain('linear-gradient')

    // рамка стоит по центру: приложение встанет ровно в неё
    const viewport = page.viewportSize()!
    // узкий экран снимает рамку, как у .phone (#1444) — на десктопе она на месте
    if (viewport.width > 500) {
      expect(await prop('#intro-frame', 'borderTopWidth')).toBe('10px')
      expect(await prop('#intro-frame', 'borderTopColor')).toBe('rgb(17, 17, 17)')
    }
    const frame = (await page.locator('#intro-frame').boundingBox())!
    expect(Math.abs(frame.x + frame.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1)
    // часы — в верхней половине замка, а не поверх будущего чата
    const clock = (await page.locator('.intro-clock').boundingBox())!
    expect(clock.y + clock.height).toBeLessThan(frame.y + frame.height / 2)
  })

  test('замок в тёмной теме: страница и уровень в тёмной палитре', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    const prop = (sel: string, p: 'backgroundColor' | 'borderTopColor' | 'backgroundImage') =>
      page.locator(sel).first().evaluate((el, key) => getComputedStyle(el)[key as 'backgroundColor'], p)
    expect(await prop('body', 'backgroundColor')).toBe('rgb(11, 14, 18)')
    // уровень живёт в обеих темах: капсула тёмная, пузырёк светлый
    expect(await prop('#lock-screen .lvl', 'backgroundColor')).toBe('rgb(11, 14, 18)')
    expect(await prop('#lock-screen .lvl', 'borderTopColor')).toBe('rgb(138, 151, 164)')
    expect(await prop('#lock-screen .spr', 'backgroundImage')).toContain('rgb(233, 237, 241)')
  })
})

test.describe('замок и загрузка', () => {
  test('уровень появляется внизу, только если загрузка дольше порога', async ({ page }) => {
    await slowPackage(page, 3000)
    await page.goto('/?nointro')
    // порог 0.3 с истёк: капсула проявилась, пузырёк охотится за центром
    await expect.poll(() => opacity(page, '#lock-screen .lvl'), { timeout: 5000 }).toBe(1)
    const spr = page.locator('#lock-screen .spr')
    expect(await spr.evaluate((el) => getComputedStyle(el).animationName)).toBe('hunt')
    const lvl = (await page.locator('#lock-screen .lvl').boundingBox())!
    const viewport = page.viewportSize()!
    const frame = (await page.locator('#intro-frame').boundingBox())!
    // внизу по центру — там, где у замка место подсказки, а не чужой прогресс-бар
    expect(Math.abs(lvl.x + lvl.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1)
    expect(lvl.y + lvl.height).toBeGreaterThan(frame.y + frame.height - 60)
    await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян', { timeout: 15_000 })
  })

  test('порог — параметр CSS: с задержкой 2 с на загрузке 1,2 с уровня нет', async ({ page }) => {
    // меняем единственный параметр — переменную в инлайн-блоке; JS её не читает
    await page.addInitScript(() => {
      const css = '#lock-screen{--boot-hint-delay:2s}'
      const add = (): void => {
        const style = document.createElement('style')
        style.textContent = css
        ;(document.head ?? document.documentElement).append(style)
      }
      if (document.documentElement) add()
      else new MutationObserver((_, observer) => {
        if (!document.documentElement) return
        observer.disconnect()
        add()
      }).observe(document, { childList: true })
    })
    await slowPackage(page, 1200)
    await page.goto('/?nointro')
    // пока пакет едет, порог не истёк: капсула невидима
    await page.waitForTimeout(700)
    expect(await opacity(page, '#lock-screen .lvl')).toBe(0)
    await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян', { timeout: 15_000 })
  })

  test('reduced-motion: пузырёк замер у центра, уезда нет', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await slowPackage(page, 2000)
    await page.goto('/?nointro')
    const spr = page.locator('#lock-screen .spr')
    await expect(spr).toHaveCSS('animation-name', 'none')
    // не «какая-то» статичная поза, а именно центр капсулы — между двумя рисками
    const lvl = (await page.locator('#lock-screen .lvl').boundingBox())!
    const box = (await spr.boundingBox())!
    expect(Math.abs(box.x + box.width / 2 - (lvl.x + lvl.width / 2))).toBeLessThanOrEqual(1)
    // уезд выключен: подмена замка чатом мгновенная
    await page.locator('#lock-screen').evaluate((el) => el.classList.add('intro-leave'))
    expect(await page.locator('#lock-screen').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
    await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян', { timeout: 15_000 })
  })
})

test('чат монтируется в ту же коробку: рамка замка уходит, приложение встаёт на её место', async ({ page }) => {
  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('#intro-frame')).toHaveCount(0)
  // тень рамки — правило styles.css: без неё приложение встало бы голым
  await expect(page.locator('.phone').first()).toHaveCSS('box-shadow', /rgba\(0, 0, 0, 0\.35\)/)
})
