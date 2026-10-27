import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/**
 * Service worker (#1446): app-shell кэш, офлайн-игра, обновление со следующего визита.
 * Проверяется то, чего не видно в jsdom: настоящий Cache API, настоящая навигация мимо сети.
 * Сценарий поднимает свой статический сервер над той же сборкой: только так можно изобразить
 * новый деплой посреди теста, не трогая dist/ у параллельных сценариев. `vite preview` из
 * playwright.config поднимает dist и здесь нужен лишь как сборка (webServer собирает до прогона).
 */

test.use({ serviceWorkers: 'allow' })

const DIST = resolve('dist')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
}

/** Статический сайт сборки с подменой index.html: подмена — это и есть «новый деплой». */
class Site {
  private server!: Server
  private port = 0
  private requests = new Map<string, number>()
  index: string | null = null

  /** Сколько раз сервер отдал файлы, подошедшие под шаблон: так видно, что кэш в сеть не ходит. */
  hits(pattern: RegExp): number {
    let total = 0
    for (const [path, count] of this.requests) if (pattern.test(path)) total += count
    return total
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.serve(req, res))
    await new Promise<void>((done) => this.server.listen(0, '127.0.0.1', done))
    const address = this.server.address()
    if (address == null || typeof address === 'string') throw new Error('порт не получен')
    this.port = address.port
  }

  async stop(): Promise<void> {
    await new Promise<void>((done, fail) => this.server.close((error) => (error ? fail(error) : done())))
  }

  url(path = '/'): string {
    return `http://127.0.0.1:${this.port}${path}`
  }

  private async serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)
    this.requests.set(path, (this.requests.get(path) ?? 0) + 1)
    if (path === '/' || path === '/index.html') {
      const html = this.index ?? (await readFile(join(DIST, 'index.html'), 'utf8'))
      res.writeHead(200, { 'content-type': TYPES['.html'] }).end(html)
      return
    }
    const file = normalize(path).replace(/^([/\\]|\.\.)+/, '')
    const body = await readFile(join(DIST, file)).catch(() => null)
    if (body == null) {
      res.writeHead(404).end('нет файла')
      return
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
  }
}

let site: Site

test.beforeEach(async () => {
  site = new Site()
  await site.start()
})

test.afterEach(async () => {
  await site.stop()
})

/** Чат на экране: приложение смонтировалось. */
const appReady = async (page: Page): Promise<void> => {
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
}

/** Воркер активирован и уже обслуживает эту вкладку (clients.claim), app-shell собран. */
const workerActive = async (page: Page): Promise<void> => {
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe('activated')
  expect(await page.evaluate(() => navigator.serviceWorker.controller != null)).toBe(true)
}

/** Адреса из кэшей воркера: что воркер действительно помнит. */
const cacheUrls = (page: Page): Promise<string[]> =>
  page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      urls.push(...(await cache.keys()).map((request) => request.url))
    }
    return urls
  })

/** Содержимое закэшированного шелла: по нему видно, какой деплой лежит в кэше. */
const cachedShell = (page: Page): Promise<string | null> =>
  page.evaluate(async () => {
    for (const name of (await caches.keys()).filter((cache) => cache.startsWith('alik-shell-'))) {
      const hit = await (await caches.open(name)).match(`${location.origin}/`)
      if (hit) return await hit.text()
    }
    return null
  })

test('первый визит оставляет офлайн-след: шелл и пакет лежат в кэше до второго визита', async ({ page }) => {
  await page.goto(site.url('/?fast&nointro'))
  await appReady(page)
  await workerActive(page)

  // Пакет кэширован установкой (страница в тот момент ещё не была под воркером), а не первым визитом
  const urls = await cacheUrls(page)
  expect(urls.filter((url) => /\/assets\/.*\.js$/.test(url)).length).toBeGreaterThanOrEqual(2)
  expect(urls.some((url) => url.endsWith('/manifest.webmanifest'))).toBe(true)
  // Себя воркер не кэширует: обновление самого sw.js — дело браузера
  expect(urls.some((url) => url.endsWith('/sw.js'))).toBe(false)
})

test('офлайн: повторный визит играет из кэша, сохранение на месте', async ({ page, context }) => {
  await page.goto(site.url('/?fast&nointro'))
  await appReady(page)
  await workerActive(page)

  const text = 'Алик, верните деньги'
  await page.getByLabel('Сообщение').fill(text)
  await page.getByLabel('Отправить').click()
  await expect(page.locator('.msg.me').filter({ hasText: text })).toBeVisible()

  await context.setOffline(true)
  await page.reload()

  await appReady(page)
  await expect(page.locator('.msg.me').filter({ hasText: text })).toBeVisible()
})

test('повторный визит не ходит в сеть за пакетом: ассеты отдаёт кэш', async ({ page }) => {
  await page.goto(site.url('/?fast&nointro'))
  await appReady(page)
  await workerActive(page)

  const assets = site.hits(/\/assets\//)
  const shell = site.hits(/^\/$/)
  expect(assets).toBeGreaterThan(0) // первый визит пакет действительно скачивал

  await page.reload()
  await appReady(page)

  // Сеть получила только шелл (сеть первой): ни пакета, ни стилей, ни картинок
  expect(site.hits(/\/assets\//)).toBe(assets)
  expect(site.hits(/^\/$/)).toBe(shell + 1)
})

test('новый деплой подхватывается следующим визитом: шелл — сеть первой', async ({ page }) => {
  await page.goto(site.url('/?fast&nointro'))
  await appReady(page)
  await workerActive(page)
  await expect(page.locator('meta[name="deploy"]')).toHaveCount(0)

  const html = await readFile(join(DIST, 'index.html'), 'utf8')
  site.index = html.replace('</head>', '<meta name="deploy" content="v2"></head>')

  await page.reload()
  await expect(page.locator('meta[name="deploy"]')).toHaveAttribute('content', 'v2')
  // Кэш шелла — тоже новый: следующий офлайн-визит не вернёт прошлый деплой
  expect(await cachedShell(page)).toContain('content="v2"')
})

test('аналитика мимо воркера: маяк уходит в сеть и в кэш не попадает', async ({ page }) => {
  const beacons: string[] = []
  await page.route(/mc\.yandex\.ru|cloud\.umami\.is|eu\.i\.posthog\.com/, (route) => {
    beacons.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* приёмник */' })
  })

  await page.goto(site.url('/?fast&nointro'))
  await appReady(page)
  await workerActive(page)

  await page.evaluate(() => fetch('https://mc.yandex.ru/metrika/tag.js', { mode: 'no-cors' }))

  // Запрос дошёл до сети (воркер пропустил его), но в кэше его нет
  expect(beacons.some((url) => url.includes('mc.yandex.ru'))).toBe(true)
  const analytics = (await cacheUrls(page)).filter((url) => /mc\.yandex|umami|posthog/.test(url))
  expect(analytics).toEqual([])
})

test('без API воркера (WebView витрин) игра грузится как раньше', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: () => undefined, configurable: true })
  })
  await page.goto(site.url('/?fast&nointro'))
  await appReady(page)
  expect(await page.evaluate(() => 'serviceWorker' in navigator && navigator.serviceWorker != null)).toBe(false)
  expect(errors).toEqual([])
})

test('отказ регистрации не роняет игру и не оставляет ошибки на странице', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'serviceWorker', {
      get: () => ({ register: () => Promise.reject(new Error('модульные воркеры не поддержаны')) }),
      configurable: true,
    })
  })
  await page.goto(site.url('/?fast&nointro'))
  await appReady(page)
  expect(errors).toEqual([])
})
