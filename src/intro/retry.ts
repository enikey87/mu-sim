// Повтор загрузки главного пакета (#1477): сеть не отдала import() — пробуем ещё, а не оставляем вечный
// индикатор. Три попытки с паузами 2 и 5 с; отказ виден игроку строкой в шелле, после третьей — кнопка.
//
// Повтор — перезагрузка страницы, а не второй import() того же адреса: module map браузера помнит неудачу
// и отдаёт ту же ошибку, не делая запроса (проверено tests/e2e/net-failures.spec.ts — та же ошибка без
// сети). Каждая перезагрузка — новый документ и честный import(); номер попытки переживает её в
// sessionStorage. Класс отказа — boot (docs/NET_FAILURES.md).

/** Сколько раз пробуем import(), включая первую попытку. */
export const MAIN_ATTEMPTS = 3
/** Паузы перед второй и третьей попыткой: короткая на «мигнуло», длинная — на «сеть возвращается». */
export const MAIN_DELAYS_MS = [2000, 5000] as const
/** Отметка попытки: sessionStorage переживает перезагрузку и не уезжает в другие вкладки. */
export const RETRY_KEY = 'alik-app-retry'

/** Строка повтора в шелле: первая попытка остаётся за обычным индикатором «печатает…». */
export const retryLine = (attempt: number): string => `дозваниваемся… ${attempt} из ${MAIN_ATTEMPTS}`

/** Хранилище попытки; недоступно — считаем, что попыток не было (одна перезагрузка всё равно попробуется). */
const session = (): Storage | null => {
  try { return window.sessionStorage } catch { return null }
}

/** Номер попытки, которую делает этот документ: 1, если отметки нет или она испорчена. */
export function attemptsDone(storage: Storage | null = session()): number {
  try {
    const attempt = Number(storage?.getItem(RETRY_KEY))
    return attempt >= 2 && attempt <= MAIN_ATTEMPTS ? attempt : 1
  } catch {
    return 1
  }
}

/** Запомнить следующую попытку перед перезагрузкой. Хранилище не пишется — попытка не переживёт reload. */
export function markAttempt(attempt: number, storage: Storage | null = session()): void {
  try { storage?.setItem(RETRY_KEY, String(attempt)) } catch { /* приватный режим: без отметки */ }
}

/** Пакет доехал: серия попыток закончилась, следующая сессия начинает с первой. */
export function clearAttempts(storage: Storage | null = session()): void {
  try { storage?.removeItem(RETRY_KEY) } catch { /* нечего чистить */ }
}

/** Что делать после отказа попытки: следующая и пауза перед ней; null — попытки кончились, нужна кнопка. */
export function nextAttempt(attempt: number): { attempt: number; delay: number } | null {
  if (attempt >= MAIN_ATTEMPTS) return null
  return { attempt: attempt + 1, delay: MAIN_DELAYS_MS[attempt - 1] }
}
