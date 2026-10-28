import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * «Поделиться» на экране концовки и в галерее (#1485): текст с днями и адресом, настоящий PNG-постер,
 * честный фолбэк без Web Share API, и кнопка в галерее — только у открытой концовки.
 * Сеть шаринга мокается в странице: тест проверяет, что игра отдала, а не что сделал браузер.
 */
const GAME_URL = 'https://enikey87.github.io/mu-sim/'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

interface Shared {
  text: string
  title: string
  url: string
  files: { name: string; size: number; type: string }[]
}

/** Подменяет Web Share API до загрузки страницы и складывает данные окна шаринга в `window.__shared`. */
async function stubShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store: Shared[] = []
    ;(window as unknown as { __shared: Shared[] }).__shared = store
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { text?: string; title?: string; url?: string; files?: File[] }) => {
        store.push({
          text: data.text ?? '',
          title: data.title ?? '',
          url: data.url ?? '',
          files: (data.files ?? []).map((f) => ({ name: f.name, size: f.size, type: f.type })),
        })
      },
    })
    // окно шаринга принимает файлы — иначе ветка с картинкой не проверится
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
  })
}

const shared = (page: Page): Promise<Shared[]> =>
  page.evaluate(() => (window as unknown as { __shared: Shared[] }).__shared)

const day = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __alik: { S: { day: number } } }).__alik.S.day)

/** Концовка «Породнились» достигается тем же движком, что и у игрока: партия пишет её в S.ending. */
async function reachEnding(page: Page, id = 'family'): Promise<void> {
  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await page.waitForFunction(() => '__alik' in window)
  await page.evaluate((ending) => (window as unknown as { __alik: { reachEnding: (id: string) => Promise<void> } }).__alik.reachEnding(ending), id)
  await expect(page.locator('#endingScreen')).toBeVisible()
}

test('экран концовки: «Поделиться» отдаёт дни, адрес и непустой PNG', async ({ page }) => {
  await stubShare(page)
  await reachEnding(page)
  const days = await day(page)

  await expect(page.locator('#endingShare')).toBeVisible()
  await page.locator('#endingShare').click()
  await expect.poll(async () => (await shared(page)).length).toBe(1)

  const sent = await shared(page)
  expect(sent).toHaveLength(1)
  expect(sent[0].text).toMatch(new RegExp(`^Я дожал Алика за ${days} (день|дня|дней)\\. `))
  expect(sent[0].text).toContain(GAME_URL)
  expect(sent[0].url).toBe(GAME_URL)
  expect(sent[0].files).toHaveLength(1)
  expect(sent[0].files[0]).toMatchObject({ name: 'alik-ending-family.png', type: 'image/png' })
  // постер, а не заглушка: кодировщик отдал настоящие килобайты
  expect(sent[0].files[0].size).toBeGreaterThan(10 * 1024)
})

test('«Сохранить картинку» скачивает постер 1080×1080 как файл', async ({ page }) => {
  await reachEnding(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#endingSaveCard').click(),
  ])
  expect(download.suggestedFilename()).toBe('alik-ending-family.png')
  const path = await download.path()
  if (!path) throw new Error('скачивание не дало файла')
  const file = readFileSync(path)
  expect(file.subarray(0, 8)).toEqual(PNG)
  expect(file.length).toBeGreaterThan(10 * 1024)
})

test('без Web Share API: мёртвой «Поделиться» нет, постер скачивается', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })
  })
  await reachEnding(page)
  await expect(page.locator('#endingShare')).toHaveCount(0)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#endingSaveCard').click(),
  ])
  expect(download.suggestedFilename()).toBe('alik-ending-family.png')
  const path = await download.path()
  if (!path) throw new Error('фолбэк не дал файла')
  expect(readFileSync(path).length).toBeGreaterThan(10 * 1024)
})

test('галерея: делиться можно только открытой концовкой, дни — из коллекции', async ({ page }) => {
  await stubShare(page)
  await reachEnding(page)
  const days = await day(page)
  await page.locator('#endingContinue').click()
  await page.getByTitle('Обещания и ачивки').click()

  const endings = page.locator('#endings')
  const got = endings.locator('.tile').filter({ hasText: 'Породнились' })
  const locked = endings.locator('.tile.locked')
  await expect(got).toHaveCount(1)
  await expect(locked.first()).toBeVisible()
  await expect(got.getByRole('button', { name: 'Поделиться концовкой «Породнились»' })).toBeVisible()
  // у силуэта кнопки нет вовсе — не «неактивная», а отсутствующая
  expect(await locked.locator('button').count()).toBe(0)

  await got.getByRole('button').click()
  await expect.poll(async () => (await shared(page)).length).toBe(1)
  const sent = await shared(page)
  expect(sent).toHaveLength(1)
  expect(sent[0].text).toMatch(new RegExp(`за ${days} (день|дня|дней)`))
  expect(sent[0].text).toContain(GAME_URL)
})
