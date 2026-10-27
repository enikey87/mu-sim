import { expect, test, type Page } from '@playwright/test'

/**
 * Титры шелла холодной загрузки (#1444): первый запуск в вебе играет интро до прихода пакета приложения.
 * Проверяется то, чего не видно в jsdom: порядок сети и то, что титры идут своим ходом, пока пакет
 * (React + движок + корпус, ~323 кБ gzip) ещё в пути.
 */

/** URL входного скрипта из index.html: всё остальное — пакет приложения и его чанки. */
const entryScript = async (page: Page): Promise<string> => {
  const html = await (await page.request.get('/')).text()
  const src = /<script type="module"[^>]*src="([^"]+)"/.exec(html)?.[1] ?? ''
  return src.replace(/^\.\//, '')
}

const isEntry = (url: string, entry: string): boolean => url.endsWith(entry.split('/').pop() ?? entry)

test('титры идут до пакета: первый титр на экране, пока приложение ещё грузится', async ({ page }) => {
  // пакет задерживаем на 4 с — титры обязаны пойти сразу после касания, а не после загрузки
  const entry = await entryScript(page)
  const requested: number[] = []
  await page.route('**/*.js', async (route) => {
    if (isEntry(route.request().url(), entry)) return route.continue()
    requested.push(Date.now())
    await new Promise((resolve) => setTimeout(resolve, 4000))
    return route.continue()
  })
  await page.goto('/')
  // гейт на экране до пакета: будь титры завязаны на загрузку, он ждал бы её четыре секунды
  await expect(page.getByText('Коснитесь, чтобы начать')).toBeVisible({ timeout: 1500 })
  // до касания пакет не скачивается вовсе: 322 кБ не платятся за того, кто не начал игру
  expect(requested, 'пакет запрошен до касания').toHaveLength(0)

  await page.locator('.intro').click()
  await expect(page.locator('.intro-line'), 'первый титр ждёт пакет').toHaveText('Вы положили плитку на объекте Алика.', { timeout: 1500 })
  expect(requested, 'пакет не запрошен с первым титром').toHaveLength(1)
  // приложения на экране ещё нет: пакет едет, титры уже играют
  expect(await page.evaluate(() => (window as unknown as { __alik?: unknown }).__alik === undefined)).toBe(true)
  await expect(page.locator('.intro-line'), 'вторая карточка раньше пакета').toHaveText(/Объект сдан/, { timeout: 3000 })
})

test('пакет не доехал: после титров остаётся «Алик печатает…», а не пустой экран', async ({ page }) => {
  const entry = await entryScript(page)
  await page.route('**/*.js', (route) => (isEntry(route.request().url(), entry) ? route.continue() : route.abort()))
  await page.goto('/')
  await page.locator('.intro').click()
  await expect(page.locator('.intro-line')).toHaveText('Вы положили плитку на объекте Алика.')
  await page.locator('.intro').click() // пропуск касанием: титры убираются сразу
  await expect(page.locator('.intro')).toHaveCount(0)
  await expect(page.locator('#boot')).toBeVisible()
  await expect(page.locator('.boot-status')).toHaveText('печатает…')
})

test('сохранение есть — титров нет: место отдаётся прежней партии', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('alik-save-v4', JSON.stringify({ msgs: [] })))
  await page.goto('/')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('.intro')).toHaveCount(0)
})

test('?nointro — титров нет ни у шелла, ни у приложения', async ({ page }) => {
  await page.goto('/?nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('.intro')).toHaveCount(0)
})

test('титры и чат называют одно обещание: карточка 3 = первое сообщение Алика', async ({ page }) => {
  test.slow()
  await page.goto('/')
  const intro = page.locator('.intro')
  await expect(page.getByText('Коснитесь, чтобы начать')).toBeVisible()
  await intro.click()
  // карточки 1→4 идут по ~1,8 с: ждём третью — обещание завязки
  // пока титры на экране, партия ещё не помнит «показано»: ушедший на титрах считается ушедшим с интро
  // (фаза цели `left`), а не с чата — отметку ставит конец титров
  await expect.poll(() => page.evaluate(() => {
    const g = (window as unknown as { __alik?: { S: { introShown: boolean } } }).__alik
    return g?.S.introShown ?? 'нет партии'
  })).toBe(false)
  const vowLine = page.locator('.intro-line')
  await expect(vowLine).toHaveText(/^Алик: «.+»$/, { timeout: 6000 })
  const shown = (await vowLine.textContent()) ?? ''
  const vow = /«(.+)»/.exec(shown)?.[1] ?? ''
  // титул и уезд: экран уходит сам, под ним чат с тем же прологом
  await expect(intro).toHaveCount(0, { timeout: 12_000 })
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  // конец титров поставил отметку — второй раз интро не сыграет
  expect(await page.evaluate(() => (window as unknown as { __alik: { S: { introShown: boolean } } }).__alik.S.introShown)).toBe(true)
  const first = await page.evaluate(() => {
    const g = (window as unknown as { __alik: { S: { msgs: Array<{ kind: string; from?: string; text?: string }> } } }).__alik
    return g.S.msgs.find((m) => m.kind === 'text' && m.from === 'alik')?.text ?? ''
  })
  // обещание в титрах — факт завязки, а не обрезка: оно входит в первое сообщение Алика дословно
  expect(vow.length).toBeGreaterThan(3)
  expect(first.toLowerCase(), `титры: ${shown}`).toContain(vow.toLowerCase())
})

test('«Начать заново» — те же титры рисует приложение: разметка и строки общие', async ({ page }) => {
  await page.goto('/?fast')
  const shell = page.getByRole('button', { name: 'Интро: коснитесь, чтобы пропустить' })
  await expect(shell).toBeVisible()
  await shell.click()
  await shell.click()
  await expect(shell).toHaveCount(0)
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')

  page.once('dialog', (d) => d.accept())
  await page.getByTitle('Обещания и ачивки').click()
  await page.getByRole('button', { name: 'Начать заново' }).click()
  const intro = page.locator('.intro')
  await expect(intro).toBeVisible()
  await expect(page.locator('.intro-line.on')).toHaveText('Вы положили плитку на объекте Алика.')
  // после сброса касание уже было: подсказки «Коснитесь» нет, титры идут сразу
  await expect(page.getByText('Коснитесь, чтобы начать')).toHaveCount(0)
  // интро на перезапуске живёт внутри .phone — титры шелла стоят в своей рамке, у этой есть рамка телефона
  expect(await intro.evaluate((el) => el.closest('.phone') !== null)).toBe(true)
  await intro.click()
  await expect(intro).toHaveCount(0)
})
