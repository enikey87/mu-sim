// Регистрация service worker (#1446). Воркер — src/sw/worker.ts, стратегии — src/sw/policy.ts.
// Здесь только вызов регистрации и его отказы: у витрин (VK/Яндекс/Telegram WebView) API может не быть,
// регистрация может отвергнуть — в обоих случаях игра работает как раньше, без офлайна.
// Регистрируется после load: воркер не спорит за канал с первым кадром шелла (#1443/#1444).

/** Адрес воркера относительно страницы: сборка кладёт его в корень своей области (dist/sw.js). */
const SW_URL = './sw.js'

/** Зарегистрировать воркер; `null` — API нет или регистрация отказала (ошибка только в консоль). */
export function registerServiceWorker(nav: Navigator = navigator): Promise<ServiceWorkerRegistration | null> {
  try {
    const container = nav.serviceWorker
    if (!container) return Promise.resolve(null)
    // type: 'module' — сборка выдаёт воркер модулем (vite.config.ts, вход sw); сборка без импортов
    // тоже модуль, поэтому тип не зависит от того, появится ли у воркера общий чанк
    return container.register(SW_URL, { type: 'module' }).catch((error: unknown) => {
      console.warn('[alik] service worker не зарегистрирован', error)
      return null
    })
  } catch (error) {
    console.warn('[alik] service worker не зарегистрирован', error)
    return Promise.resolve(null)
  }
}

/**
 * Регистрация, привязанная к загрузке страницы: зовём сразу, если load уже прошёл,
 * иначе — по нему. `register` — шов для теста, боевой путь — registerServiceWorker.
 */
export function armServiceWorker(
  win: Window = window,
  register: (nav: Navigator) => Promise<unknown> = registerServiceWorker,
): void {
  const start = (): void => {
    // Отказ регистрации не должен ронять вход страницы: промис гасим здесь, причину пишет сама регистрация
    void register(win.navigator).catch(() => undefined)
  }
  if (win.document.readyState === 'complete') start()
  else win.addEventListener('load', start, { once: true })
}
