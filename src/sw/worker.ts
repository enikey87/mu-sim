// Service worker приложения (#1446): app-shell кэш, офлайн-игра, мгновенный повторный визит.
// Собирается отдельным входом в dist/sw.js (vite.config.ts, entryFileNames) — импортов из src/ нет,
// кроме политики: воркер не должен тянуть в свой бандл игру.
// Регистрация — src/sw/register.ts, стратегии — src/sw/policy.ts, поведение в браузере — tests/e2e/sw.spec.ts.
import { assetUrls, manifestUrls, shellKey, strategyOf } from './policy'

/**
 * Минимум глобалов воркера, который здесь нужен. Типы webworker в проект не подключены (lib DOM),
 * а тащить `/// <reference lib="webworker" />` нельзя: он конфликтует с DOM на весь проект.
 */
interface Lifetime {
  waitUntil: (work: Promise<unknown>) => void
}
interface FetchLifecycle extends Lifetime {
  request: Request
  respondWith: (response: Promise<Response>) => void
}
interface SwScope {
  registration: { scope: string }
  location: { href: string }
  clients: { claim: () => Promise<void> }
  skipWaiting: () => Promise<void>
  addEventListener(type: 'install' | 'activate', listener: (event: Lifetime) => void): void
  addEventListener(type: 'fetch', listener: (event: FetchLifecycle) => void): void
}

const sw = self as unknown as SwScope

/** Область воркера: на GitHub Pages это /mu-sim/, у Telegram-сборки — /mu-sim/t/. */
const SCOPE = sw.registration.scope

/**
 * Версия кэшей. Менять, когда меняется смысл хранения (например, набор стратегий):
 * старые кэши `alik-*` удаляются на activate, поэтому смена версии — это и есть сброс.
 */
const VERSION = 'v1'
const SHELL_CACHE = `alik-shell-${VERSION}`
const ASSET_CACHE = `alik-assets-${VERSION}`
/** Потолок ассетов: с каждым деплоем имена хешированные, старые нужны только открытой вкладке. */
const ASSETS_MAX = 80

sw.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => sw.skipWaiting()))
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE])
      for (const name of await caches.keys()) {
        if (name.startsWith('alik-') && !keep.has(name)) await caches.delete(name)
      }
      // Новый воркер обслуживает уже открытую вкладку: иначе первый визит остаётся без офлайн-следа до перезагрузки
      await sw.clients.claim()
    })(),
  )
})

sw.addEventListener('fetch', (event) => {
  const plan = strategyOf({ url: event.request.url, scope: SCOPE, mode: event.request.mode, method: event.request.method })
  if (plan.kind === 'pass') return // аналитика и чужое — прозрачно в сеть, воркер их не трогает
  event.respondWith(plan.kind === 'cache-first' ? cacheFirst(event.request) : networkFirst(event.request, plan.key))
})

/**
 * Установка: шелл и все файлы сборки — в кэш. Шелл и список файлов берём мимо HTTP-кэша (`reload`),
 * чтобы офлайн-копия не оказалась прошлым деплоем; сами файлы — как есть: имена хешированные и уже
 * лежат в HTTP-кэше после этой загрузки, поэтому предкэш стоит примерно ничего.
 */
async function precache(): Promise<void> {
  const shellUrl = shellKey(SCOPE)
  const files = new Set<string>()
  try {
    const shell = await fetch(shellUrl, { cache: 'reload' })
    if (shell.ok) {
      await (await caches.open(SHELL_CACHE)).put(shellUrl, shell.clone())
      for (const url of assetUrls(await shell.text(), shellUrl)) files.add(url)
    }
  } catch {
    // Сеть не отдала шелл: воркер всё равно встаёт, кэш наполнится первым же контролируемым визитом
  }
  try {
    // Список сборки: динамический чанк приложения в index.html не упомянут, а офлайну нужен
    const manifest = await fetch(new URL('manifest.json', SCOPE).href, { cache: 'reload' })
    if (manifest.ok) for (const url of manifestUrls(await manifest.json(), SCOPE)) files.add(url)
  } catch {
    // Нет списка сборки — кэшируем то, что назвал шелл; остальное доберёт первый контролируемый визит
  }
  // Сам воркер в кэш не кладём: его обновляет браузер, копия в Cache API только путала бы
  files.delete(sw.location.href)
  const cache = await caches.open(ASSET_CACHE)
  await Promise.all(
    [...files].map(async (url) => {
      try {
        const response = await fetch(url)
        if (response.ok) await cache.put(url, response)
      } catch {
        // Один недоступный файл не отменяет установку: остальное кэшировано, этот доберётся первым визитом
      }
    }),
  )
}

/** `/assets/*`: кэш первый — повторный визит не ходит в сеть вовсе. */
async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(ASSET_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) await remember(cache, request, response, ASSETS_MAX)
  return response
}

/** index.html и манифест: сеть первая — обновление деплоя подхватывается визитом; офлайн — кэш. */
async function networkFirst(request: Request, key: string): Promise<Response> {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(key, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(key)
    if (cached) return cached
    throw error
  }
}

/** Записать ответ и подрезать кэш до потолка: ключи идут в порядке вставки, старые — первыми. */
async function remember(cache: Cache, request: Request, response: Response, max: number): Promise<void> {
  await cache.put(request, response.clone())
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key)
}
