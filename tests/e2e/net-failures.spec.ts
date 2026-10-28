import { expect, test, type Page } from '@playwright/test'

/**
 * Отказы сети на холодной загрузке (#1477): сторож бута и повтор главного пакета.
 * Сеть рвётся маршрутом (route.abort/fulfill), поэтому проверяется настоящий сетевой путь сборки:
 * шелл и титры должны пережить отказ и сказать игроку правду, а не оставить вечный индикатор.
 */

/** URL входного скрипта из index.html: всё остальное — пакет приложения и его чанки. */
const entryScript = async (page: Page): Promise<string> => {
  const html = await (await page.request.get('/')).text()
  const src = /<script type="module"[^>]*src="([^"]+)"/.exec(html)?.[1] ?? ''
  return src.replace(/^\.\//, '')
}

const isEntry = (url: string, entry: string): boolean => url.endsWith(entry.split('/').pop() ?? entry)

/** Любой JS-адрес: файлы сборки зовутся .js, у загрузчика и пакета свои хеши. */
const SCRIPT = /\.js($|\?)/

const FAIL_TEXT = 'Алик не дозвонился. Проверьте сеть и обновите страницу.'

/** Считает документы: авто-перезагрузка сторожа — это второй документ, цикл — третий и дальше. */
const countDocuments = (page: Page): (() => number) => {
  let documents = 0
  page.on('request', (request) => { if (request.resourceType() === 'document') documents += 1 })
  return () => documents
}

test('загрузчик не доехал: сторож показывает текст и не уходит в цикл перезагрузок', async ({ page }) => {
  const entry = await entryScript(page)
  const documents = countDocuments(page)
  await page.route(SCRIPT, (route) => (isEntry(route.request().url(), entry) ? route.abort() : route.continue()))
  await page.goto('/')
  await expect(page.getByText(FAIL_TEXT)).toBeVisible({ timeout: 15_000 })
  // одна авто-перезагрузка за сессию: отметка в sessionStorage, а не бесконечный цикл
  expect(await page.evaluate(() => sessionStorage.getItem('alik-boot-retry'))).toBe('1')
  // сторож не предлагает кнопку: перезагрузка уже была, текст велит обновить страницу руками
  await expect(page.getByRole('button', { name: 'Попробовать снова' })).toBeHidden()
  expect(documents()).toBe(2)
  await page.waitForTimeout(1500)
  expect(documents(), 'сторож ушёл в цикл перезагрузок').toBe(2)
})

test('загрузчик молчит (ни ошибки, ни сигнала бута): через 12 с срабатывает тайм-аут', async ({ page }) => {
  test.slow()
  const entry = await entryScript(page)
  const documents = countDocuments(page)
  await page.clock.install()
  // пустой ответ вместо загрузчика: ошибки загрузки нет, __alikBoot не появится — только тайм-аут сторожа
  await page.route(SCRIPT, (route) => (isEntry(route.request().url(), entry)
    ? route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
    : route.continue()))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.clock.fastForward(12_000)
  await expect.poll(documents, 'первый документ должен перезагрузиться').toBe(2)
  await page.clock.fastForward(12_000)
  await expect(page.getByText(FAIL_TEXT)).toBeVisible({ timeout: 15_000 })
  expect(documents()).toBe(2)
})

test('пакет не доехал дважды: повтор перезагрузкой вытаскивает третью попытку в чат', async ({ page }) => {
  test.slow()
  const entry = await entryScript(page)
  const documents = countDocuments(page)
  let aborted = 0
  await page.route(SCRIPT, (route) => {
    if (isEntry(route.request().url(), entry)) return route.continue()
    if (aborted < 2) { aborted += 1; return route.abort() }
    return route.continue()
  })
  await page.goto('/?nointro')
  // повтор не молчит: игрок видит, что дозвон продолжается
  await expect(page.locator('#boot .wt span')).toHaveText(/дозваниваемся… [23] из 3/, { timeout: 15_000 })
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян', { timeout: 30_000 })
  expect(aborted).toBe(2)
  // повтор — новый документ: import() того же адреса сеть не повторила бы (module map помнит отказ)
  expect(documents()).toBe(3)
})

test('пакет не доехал трижды: текст и кнопка повтора вместо вечного индикатора', async ({ page }) => {
  test.slow()
  const entry = await entryScript(page)
  await page.route(SCRIPT, (route) => (isEntry(route.request().url(), entry) ? route.continue() : route.abort()))
  await page.goto('/?nointro')
  const again = page.getByRole('button', { name: 'Попробовать снова' })
  await expect(page.getByText(FAIL_TEXT)).toBeVisible({ timeout: 30_000 })
  await expect(again).toBeVisible()
  await expect(page.locator('#boot')).toHaveClass(/failed/)
  // кнопка — перезагрузка: после неё снова честные попытки, а не мёртвая кнопка
  await again.click()
  await expect(page.getByText(FAIL_TEXT)).toBeVisible({ timeout: 30_000 })
})

test('живая игра переживает тайм-аут сторожа: сигнал __alikBoot поставлен первым действием', async ({ page }) => {
  const documents = countDocuments(page)
  await page.clock.install()
  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  // без сигнала сторожа этот прыжок перезагрузил бы живую игру, а потом показал текст отказа
  await page.clock.fastForward(13_000)
  await expect(page.getByText(FAIL_TEXT)).toHaveCount(0)
  expect(documents(), 'сторож перезагрузил живую игру').toBe(1)
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
})
