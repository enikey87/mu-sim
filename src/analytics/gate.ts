// Условия, на которых включается аналитика, и строка игроку о счётчике. Отдельный модуль без приёмников:
// те же условия нужны титрам шелла холодной загрузки (#1444) — они рисуются до загрузки приложения,
// а строка «Ходы считаются…» обязана быть на экране ровно там, где счётчик включён (docs/design/analytics.md).

/**
 * Сборочная переменная: значение из окружения сборки, вокруг — пробелы прочь.
 * Не задана или пуста — пустая строка, и это исправное состояние: приёмник молчит.
 */
const buildVar = (value: string | undefined): string => String(value ?? '').trim()

/** Номер счётчика Метрики: `VITE_METRIKA_COUNTER`. Пусто — приёмник молчит (docs/design/analytics.md). */
export const COUNTER_ID = buildVar(import.meta.env.VITE_METRIKA_COUNTER)

/** Ключ проекта PostHog (EU): `VITE_POSTHOG_KEY`. Пусто — приёмник молчит. */
export const POSTHOG_KEY = buildVar(import.meta.env.VITE_POSTHOG_KEY)

/** Ключ сайта Umami: `VITE_UMAMI_WEBSITE_ID`. Пусто — приёмник молчит. */
export const UMAMI_KEY = buildVar(import.meta.env.VITE_UMAMI_WEBSITE_ID)

/** Хост, на котором приёмники включаются: localhost, превью и e2e молчат. */
export const GAME_HOST = 'enikey87.github.io'

/** Строка игроку о счётчике: на интро и в досье, пока аналитика включена (#611). Баннера нет — он съедает интро. */
export const TRACK_NOTE = 'Ходы считаются, текст сообщений — нет.'

/** Вход страницы: адрес, по которому решается, включать ли приёмники; `id`-ключи — подстановки для теста. */
export interface Gate {
  host: string
  search: string
  id?: string
  posthogKey?: string
  umamiKey?: string
}

/**
 * Включится ли аналитика на этом адресе: хост игры, никакого `debug`/`fast`/`noidle`
 * и хотя бы один заданный ключ приёмника.
 */
export function analyticsGate(g: Gate): boolean {
  const url = new URLSearchParams(g.search)
  if (g.host !== GAME_HOST || url.has('debug') || url.has('fast') || url.has('noidle')) return false
  return Boolean(g.id ?? COUNTER_ID) || Boolean(g.posthogKey ?? POSTHOG_KEY) || Boolean(g.umamiKey ?? UMAMI_KEY)
}
