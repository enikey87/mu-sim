import { expect, test, type Page } from '@playwright/test'

/**
 * Экран блокировки (#1522): холодная загрузка играет титры на том же замке, что родился в index.html,
 * пакет приложения грузится параллельно и появляется под титрами. Проверяется то, чего не видно в jsdom:
 * порядок сети, удержание титула до готовности чата, один узел замка и уезд вверх.
 */

const HINT = 'Коснитесь, чтобы начать'
const FAIL_TEXT = 'Алик не дозвонился. Проверьте сеть и обновите страницу.'

/** URL входного скрипта из index.html: всё остальное — пакет приложения и его чанки. */
const entryScript = async (page: Page): Promise<string> => {
  const html = await (await page.request.get('/')).text()
  const src = /<script type="module"[^>]*src="([^"]+)"/.exec(html)?.[1] ?? ''
  return src.replace(/^\.\//, '')
}

const isEntry = (url: string, entry: string): boolean => url.endsWith(entry.split('/').pop() ?? entry)

/** Задержка пакета приложения: титры успевают кончиться раньше чата. */
const slowPackage = async (page: Page, ms: number): Promise<void> => {
  const entry = await entryScript(page)
  await page.route('**/*.js', async (route) => {
    if (isEntry(route.request().url(), entry)) return route.continue()
    await new Promise((resolve) => setTimeout(resolve, ms))
    return route.continue()
  })
}

/** Один отказ любого JS-запроса, кроме входного: пакет не доезжает. */
const breakPackage = async (page: Page): Promise<void> => {
  const entry = await entryScript(page)
  await page.route('**/*.js', (route) => (isEntry(route.request().url(), entry) ? route.continue() : route.abort()))
}

/** Уезжал ли замок вверх: класс intro-leave на #lock-screen, даже если узел уже снят. */
const trackLeave = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const state = window as unknown as { __left?: boolean }
    state.__left = false
    new MutationObserver((records) => {
      for (const r of records) {
        const target = r.target as HTMLElement
        if (r.type === 'attributes' && target.id === 'lock-screen' && target.classList.contains('intro-leave')) state.__left = true
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] })
  })
}

const left = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __left?: boolean }).__left === true)

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
  await expect(page.getByText(HINT)).toBeVisible({ timeout: 1500 })
  // уровень — индикатор загрузки: до касания грузить нечего, и он не показывается
  await expect(page.locator('#lock-screen .lvl')).toBeHidden()
  // до касания пакет не скачивается вовсе: 322 кБ не платятся за того, кто не начал игру
  expect(requested, 'пакет запрошен до касания').toHaveLength(0)

  await page.getByText(HINT).click()
  await expect(page.locator('.intro-line'), 'первый титр ждёт пакет').toHaveText('Вы положили плитку на объекте Алика.', { timeout: 1500 })
  expect(requested, 'пакет не запрошен с первым титром').toHaveLength(1)
  // приложения на экране ещё нет: пакет едет, титры уже играют
  expect(await page.evaluate(() => (window as unknown as { __alik?: unknown }).__alik === undefined)).toBe(true)
  await expect(page.locator('.intro-line'), 'вторая карточка раньше пакета').toHaveText(/Объект сдан/, { timeout: 3000 })
})

test('титры кончились раньше пакета: титул держится, уровень остаётся внизу', async ({ page }) => {
  test.slow()
  await slowPackage(page, 6000)
  await page.goto('/')
  const lock = page.locator('#lock-screen')
  await page.getByText(HINT).click() // касание снимает гейт, пакет поехал
  await lock.click() // пропуск карточек — сразу к титулу
  await expect(page.locator('.intro-title.on')).toBeVisible()

  // пакет ещё едет: последняя карточка (титул) остаётся, уровень — внизу замка
  await page.waitForTimeout(1500)
  await expect(lock).toBeVisible()
  await expect(page.locator('.intro-title.on')).toBeVisible()
  await expect(page.locator('#lock-screen .lvl')).toBeVisible()
  // второго индикатора «Алик печатает…» больше нет
  await expect(page.getByText('Алик печатает', { exact: false })).toHaveCount(0)

  // пакет доехал — тот же замок уезжает вверх, под ним живой чат
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян', { timeout: 20_000 })
  await expect(lock).toHaveCount(0)
})

test('пакет не доехал: строка про сеть в низу замка вместо вечного уровня', async ({ page }) => {
  test.slow()
  await breakPackage(page)
  await page.goto('/')
  await page.getByText(HINT).click()
  // первый отказ не молчит: повтор виден строкой в низу замка (#1477)
  await expect(page.locator('#lock-screen .fl')).toHaveText(/дозваниваемся… [23] из 3/, { timeout: 15_000 })
  await expect(page.locator('#lock-screen')).toHaveClass(/msg/)
  // три попытки отказали — строка про сеть и кнопка вместо уровня
  await expect(page.locator('#lock-screen .fl')).toHaveText(FAIL_TEXT, { timeout: 30_000 })
  await expect(page.locator('#lock-screen')).toHaveClass(/failed/)
  await expect(page.getByRole('button', { name: 'Попробовать снова' })).toBeVisible()
})

test('?nointro и отказ сети: замок сразу говорит про сеть, а не показывает уровень', async ({ page }) => {
  test.slow()
  await breakPackage(page)
  await page.goto('/?nointro')
  // повтор виден сразу, после трёх попыток — строка про сеть и кнопка (#1477)
  await expect(page.locator('#lock-screen .fl')).toHaveText(/дозваниваемся… [23] из 3/, { timeout: 15_000 })
  await expect(page.locator('#lock-screen .fl')).toHaveText(FAIL_TEXT, { timeout: 30_000 })
})

test('сохранение есть — титров нет: замок уезжает сам, без тапа', async ({ page }) => {
  await trackLeave(page)
  await page.addInitScript(() => localStorage.setItem('alik-save-v4', JSON.stringify({ msgs: [] })))
  await page.goto('/')
  // тапа не было, а чат на экране: замок уехал сам тем же уездом, что титры
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('.intro-line')).toHaveCount(0)
  await expect(page.locator('#intro-frame')).toHaveCount(0)
  expect(await left(page), 'замок сняли без уезда').toBe(true)
  // сохранение на месте: замок не тронул партию
  expect(await page.evaluate(() => localStorage.getItem('alik-save-v4') != null)).toBe(true)
})

test('?nointro — титров нет: приложение монтируется сразу, замок не задерживает', async ({ page }) => {
  await trackLeave(page)
  await page.goto('/?nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('.intro')).toHaveCount(0)
  // без театра: уезда нет, замок снимается на месте
  expect(await left(page), 'в ?nointro сыграли уезд').toBe(false)
})

test('титры и чат называют одно обещание: карточка 3 = первое сообщение Алика', async ({ page }) => {
  test.slow()
  await page.goto('/')
  const lock = page.locator('#lock-screen')
  await expect(page.getByText(HINT)).toBeVisible()
  await lock.click()
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
  await expect(lock).toHaveCount(0, { timeout: 12_000 })
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

test('один замок: титры пришли на узел из разметки, второго экрана нет', async ({ page }) => {
  await slowPackage(page, 1500)
  await page.goto('/')
  const lock = page.locator('#lock-screen')
  await expect(page.getByText(HINT)).toBeVisible()
  await lock.evaluate((el) => el.setAttribute('data-born', 'html'))
  await page.getByText(HINT).click()
  await expect(page.locator('#lock-screen[data-born="html"] .intro-line.on')).toBeVisible()
  await lock.click() // пропуск карточек
  // титул и низ с уровнем — на том же узле, что родился в index.html: скачка DOM между шеллом и титрами нет
  await expect(page.locator('#lock-screen[data-born="html"] .intro-title.on')).toBeVisible()
  await expect(page.locator('#lock-screen[data-born="html"] .lvl')).toBeAttached()
  expect(await page.locator('#lock-screen').count()).toBe(1)
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян', { timeout: 20_000 })
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
  // узел отсутствовал — приложение создало замок само, теми же классами и id (#1522)
  await expect(intro).toHaveAttribute('id', 'lock-screen')
  await expect(page.locator('.intro-line.on')).toHaveText('Вы положили плитку на объекте Алика.')
  // после сброса касание уже было: подсказки «Коснитесь» нет, титры идут сразу
  await expect(page.getByText(HINT)).toHaveCount(0)
  // интро на перезапуске живёт внутри .phone — титры шелла стоят в своей рамке, у этой есть рамка телефона
  expect(await intro.evaluate((el) => el.closest('.phone') !== null)).toBe(true)
  await intro.click()
  await expect(intro).toHaveCount(0)
})
