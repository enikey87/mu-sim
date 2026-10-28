import { expect, test, type CDPSession } from '@playwright/test'

/**
 * Первый кадр не ждёт styles.css приложения (#1449). Шелл красит первый кадр инлайном из index.html,
 * и этого достаточно: stylesheet, попавший в разметку `<head>`, держит отрисовку целый round-trip —
 * на Slow 3G это 1036–1052 мс против 452–460 мс без CSS (замер в задаче, он же база ниже).
 * Поэтому стили приложения едут кодом пакета, а не разметкой, и первый кадр укладывается в один RTT.
 *
 * Гейт держит механизм, а не одно число: запрос CSS не должен обгонять первую отрисовку — иначе
 * кадр снова упирается в сеть. Мутация «вернули блокирующий link в head» краснит оба теста.
 */
const SLOW_3G = { offline: false, latency: 400, downloadThroughput: 51_200, uploadThroughput: 51_200 }
/** База задачи: 452–460 мс без CSS, 1036–1052 с блокирующим; середина — 750. */
const FIRST_FRAME_BUDGET_MS = 750

/** Начала запросов stylesheet приложения в epoch-мс — та же шкала, что у performance.timeOrigin. */
const cssRequests = (cdp: CDPSession): number[] => {
  const at: number[] = []
  cdp.on('Network.requestWillBeSent', (e) => {
    if (/\.css(\?|$)/.test(e.request.url)) at.push(e.wallTime * 1000)
  })
  return at
}

test('styles.css приложения не едет в разметке: первый кадр его не ждёт', async ({ request }) => {
  const html = await (await request.get('/')).text()
  const stylesheets = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map((m) => m[0])
  expect(stylesheets, `stylesheet в разметке держит первый кадр: ${stylesheets.join(', ')}`).toEqual([])
})

test('первый кадр на Slow 3G: CSS приложения запрашивается уже после него', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', SLOW_3G)
  const css = cssRequests(cdp)

  await page.goto('/?fast&nointro', { waitUntil: 'commit' })
  const paint = await page.evaluate(async () => {
    const first = (): PerformanceEntry | undefined =>
      performance.getEntriesByType('paint').find((e) => e.name === 'first-paint')
    const deadline = performance.now() + 10_000
    while (!first() && performance.now() < deadline) await new Promise((r) => setTimeout(r, 10))
    const entry = first()
    return entry ? { at: entry.startTime, epoch: performance.timeOrigin + entry.startTime } : null
  })
  expect(paint, 'браузер отчитался о первом кадре').not.toBeNull()
  expect(paint!.at).toBeLessThan(FIRST_FRAME_BUDGET_MS)

  await expect.poll(() => css.length, { message: 'CSS приложения так и не запросился' }).toBeGreaterThan(0)
  // запас в 100 мс — на кэш и грубость часов: блокирующий link приходит на старте разметки,
  // то есть за целый round-trip (400 мс) и больше до кадра
  expect(
    css[0],
    `первый кадр ${Math.round(paint!.at)} мс: CSS запрошен за ` +
      `${Math.round(paint!.epoch - css[0])} мс до него (меньше −100 — кадр ждал stylesheet)`,
  ).toBeGreaterThan(paint!.epoch - 100)
})

test('приложение монтируется уже со своими стилями: шелл не мелькает без рамки', async ({ page }) => {
  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  // тень рамки — правило styles.css: без неё приложение встало бы голым
  await expect(page.locator('.phone').first()).toHaveCSS('box-shadow', /rgba\(0, 0, 0, 0\.35\)/)
  await expect(page.locator('#boot')).toHaveCount(0)
})
