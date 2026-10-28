// Вход страницы (#1444): первый кадр — шелл из index.html, дальше титры интро без UI-пакета и без корпуса.
// Приложение грузится динамическим import() параллельно первому титру и появляется под титрами;
// завязка общая — шелл выбирает её и передаёт в startApp, поэтому обещание на карточке и в чате одно.
// Титры играют только в вебе: у витрин прогресс лежит в облаке, и «есть сохранение» до адаптера не узнать,
// а показать титры поверх восстановленной партии — обман (сами витрины, как и раньше, грузят приложение import()).
import { STARTS } from '../content/starts'
import { SAVE_KEY } from '../engine/keys'
import { fmtDate, fmtTime } from '../engine/time'
import { introLinesOf, introTextOf } from './cards'
import { mountIntro } from './mount'
import { attemptsDone, clearAttempts, MAIN_ATTEMPTS, markAttempt, nextAttempt, retryLine } from './retry'
import { shellIntroWanted } from './wanted'
import { analyticsGate } from '../analytics/gate'
import { armServiceWorker } from '../sw/register'
import type { AppHandle } from '../main'

// Сигнал сторожу холодной загрузки (index.html, #1477) — первым действием модуля: пока он не поставлен,
// сторож вправе считать, что загрузчик не доехал, и через 12 с показать текст отказа вместо живой игры.
;(window as unknown as { __alikBoot?: boolean }).__alikBoot = true

const q = new URLSearchParams(location.search)

/** Сборка без витрины (веб и GitHub Pages): их .env.* задают VITE_PLATFORM. */
const webBuild = !import.meta.env.VITE_PLATFORM || import.meta.env.VITE_PLATFORM === 'web'

/** Есть ли прогресс: тот же ключ, что читает игра. Приватный режим браузера — «нет сохранения». */
const hasSave = (): boolean => {
  try { return localStorage.getItem(SAVE_KEY) != null } catch { return false }
}

/** Час переписки так же, как его возьмёт партия: ?hour подменяет, иначе — реальное время. */
const clockMinutes = (): number =>
  (q.has('hour') ? Number(q.get('hour')) : new Date().getHours()) * 60 + new Date().getMinutes()

// Пакет приложения — единственный тяжёлый import() входа: три попытки с паузами (src/intro/retry.ts).
// Первую попытку игрок видит обычным индикатором шелла, повтор — строкой «дозваниваемся… N из 3»,
// после третьего отказа — текст и кнопка «Попробовать снова» вместо вечного «печатает…» (#1477).
const bootNode = (id: string): HTMLElement | null => document.getElementById(id)

const showRetryLine = (attempt: number): void => {
  const line = bootNode('boot-retry')
  if (!line) return
  line.textContent = retryLine(attempt)
  line.hidden = false
}

const showBootFailure = (): void => {
  // Серия кончилась: ручная перезагрузка или кнопка начнут её заново с первой попытки
  clearAttempts()
  const boot = bootNode('boot')
  const again = bootNode('boot-again')
  if (!boot || !again) return
  boot.classList.add('boot-failed')
  again.hidden = false
  again.addEventListener('click', () => location.reload(), { once: true })
}

/** Попытка, которую делает этот документ: повторы приходят перезагрузкой, номер пережил её в sessionStorage. */
const bootAttempt = attemptsDone()
if (bootAttempt > 1) showRetryLine(bootAttempt)

const app = (): Promise<typeof import('../main') | null> =>
  // Повтор — перезагрузка (см. src/intro/retry.ts): новый документ делает новый import(), а не кэш отказа
  import('../main')
    .then((module) => { clearAttempts(); return module })
    .catch((error: unknown) => {
      console.error(`[alik] пакет приложения не доехал: попытка ${bootAttempt} из ${MAIN_ATTEMPTS}`, error)
      const next = nextAttempt(bootAttempt)
      // Все попытки отказали: вместо вечного индикатора — текст и кнопка повтора
      if (!next) { showBootFailure(); return null }
      markAttempt(next.attempt)
      showRetryLine(next.attempt)
      window.setTimeout(() => location.reload(), next.delay)
      return null
    })

// Воркер (#1446): повторный визит и офлайн играются из app-shell кэша. Регистрация ждёт load
// и не мешает первому кадру; без API витрины или при отказе игра идёт как раньше (src/sw/register.ts).
// В dev воркера нет — sw.js появляется только сборкой, поэтому dev-сервер о нём не просит.
if (import.meta.env.PROD) armServiceWorker()

if (!shellIntroWanted({ noIntro: q.has('nointro'), web: webBuild, save: hasSave() })) {
  // Титров нет: игра сама решит про своё интро по отметке в сохранении, шелл отдаёт ей место
  void app().then((m) => { if (m) void m.startApp() })
} else {
  // Завязку выбирает шелл: её же получит партия, поэтому карточка 3 и пролог чата скажут одно обещание.
  // Отметку «показано» ставит конец титров (приложению он приходит сигналом onFinish), как у интро в приложении.
  const start = Math.floor(Math.random() * STARTS.length)
  let handle: AppHandle | null = null
  let ended = false

  const frame = document.createElement('div')
  frame.id = 'intro-frame'
  document.body.append(frame)
  // Пока титры на экране, приложение за ними не должно ловить ни фокус, ни нажатия
  const root = document.getElementById('root')
  root?.setAttribute('inert', '')

  mountIntro(frame, {
    lines: introLinesOf(introTextOf(STARTS[start])),
    date: fmtDate(0),
    clock: fmtTime(clockMinutes()),
    gate: true,
    // Пакет поехал с первым титром: до касания 322 кБ не скачивает никто
    onStart: () => {
      void app().then((m) => {
        // Все три попытки отказали: на экране уже текст и кнопка повтора, запускать нечего
        if (!m) return
        void m.startApp({ start, gesture: true, shellIntro: { ended: () => ended } })
          .then((h) => { handle = h })
          .catch((e: unknown) => console.error('[alik] приложение не запустилось', e))
      })
    },
    // «Мууу» — звук игры: без смонтированного приложения его не сыграть, титры идут дальше
    onMoo: () => handle?.moo(),
    // Отметку «показано» ставит приложение — концом титров, как у интро в приложении: фаза `left` остаётся «intro»
    onFinish: () => { ended = true; handle?.introEnded() },
    onGone: () => {
      root?.removeAttribute('inert')
      frame.remove()
    },
    trackNote: analyticsGate({ host: location.hostname, search: location.search }),
  })
}
