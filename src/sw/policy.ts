// Политика кэша service worker (#1446): каким запросам какая стратегия.
// Здесь только решения — ни Cache API, ни событий воркера: их применяет src/sw/worker.ts,
// а таблицу решений проверяет src/sw/policy.test.ts. Воркер обязан оставаться без импортов
// из остального src/: он собирается отдельным входом в dist/sw.js (vite.config.ts).

/** Что воркер делает с запросом: отдать из кэша, сходить в сеть с фолбэком или пропустить. */
export type Strategy =
  | { kind: 'cache-first' }
  /** `key` — адрес, под которым кэш помнит ответ (навигация помнит шелл, а не каждый `?параметр`). */
  | { kind: 'network-first'; key: string }
  | { kind: 'pass' }

/** Адрес шелла: `scope` кончается слэшем (`https://host/mu-sim/`), ключ — та же область без index.html. */
export const shellKey = (scope: string): string => new URL('./', scope).href

/**
 * Стратегия запроса. `scope` — область воркера.
 * Аналитика (mc.yandex.ru, cloud.umami.is, eu.i.posthog.com) и остальное чужое не кэшируется по факту
 * своего происхождения: запрос вне области воркер не трогает вовсе — ни кэша, ни офлайн-подмены.
 */
export function strategyOf(input: { url: string; scope: string; mode?: string; method?: string }): Strategy {
  const url = new URL(input.url)
  const scope = new URL(input.scope)
  if ((input.method ?? 'GET') !== 'GET') return { kind: 'pass' }
  if (url.origin !== scope.origin) return { kind: 'pass' }
  // Навигация — сеть первой: задеплоенный index.html подхватывается следующим визитом, офлайн — шелл из кэша
  if ((input.mode ?? '') === 'navigate') {
    return isShell(url, scope) ? { kind: 'network-first', key: shellKey(input.scope) } : { kind: 'pass' }
  }
  if (isManifest(url.pathname)) return { kind: 'network-first', key: url.href }
  if (isAsset(url.pathname)) return { kind: 'cache-first' }
  return { kind: 'pass' }
}

/** Шелл — корень области и его index.html: остальные адреса под областью (витрины, якоря) — не шелл. */
const isShell = (url: URL, scope: URL): boolean =>
  url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`

const isManifest = (pathname: string): boolean => /\/manifest\.(webmanifest|json)$/.test(pathname)

/**
 * Иммутабельные файлы сборки: `/assets/*` с хешем в имени, иконки манифеста и яблочная иконка.
 * Замена такой иконки в деплое ждёт сброса кэша — это цена cache-first, названа в PR.
 */
export const isAsset = (pathname: string): boolean =>
  pathname.includes('/assets/') || /\/icon-[^/]*\.png$/.test(pathname) || /\/apple-touch-icon[^/]*\.png$/.test(pathname)

/**
 * Что положить в кэш при установке: шелл и всё, на что он ссылается (пакет, стили, иконки, манифест).
 * Без этого первый визит не оставляет офлайн-следа: страница была не под воркером, её ассеты не кэшировались.
 */
export function assetUrls(html: string, base: string): string[] {
  const origin = new URL(base).origin
  const found = new Set<string>()
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const raw = match[1]
    if (/^(data:|javascript:|mailto:|#)/i.test(raw)) continue
    let url: URL
    try {
      url = new URL(raw, base)
    } catch {
      continue
    }
    if (url.origin !== origin) continue
    url.hash = ''
    found.add(url.href)
  }
  return [...found]
}

/**
 * Файлы сборки из `manifest.json` (vite: build.manifest). Здесь то, чего нет в index.html:
 * динамический чанк приложения, который шелл грузит import() — без него офлайн после первого визита мёртв.
 */
export function manifestUrls(manifest: unknown, base: string): string[] {
  const origin = new URL(base).origin
  const found = new Set<string>()
  const add = (value: unknown): void => {
    if (typeof value !== 'string') return
    let url: URL
    try {
      url = new URL(value, base)
    } catch {
      return
    }
    if (url.origin !== origin) return
    url.hash = ''
    found.add(url.href)
  }
  if (manifest == null || typeof manifest !== 'object') return []
  for (const entry of Object.values(manifest as Record<string, unknown>)) {
    if (entry == null || typeof entry !== 'object') continue
    const { file, css, assets } = entry as { file?: unknown; css?: unknown; assets?: unknown }
    add(file)
    for (const list of [css, assets]) if (Array.isArray(list)) list.forEach(add)
  }
  return [...found]
}
