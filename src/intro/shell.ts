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
// сторож вправе считать, что загрузчик не доехал, перезагрузить страницу и показать строку отказа.
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

/** Шелл (#1476): первое окно — уровень, второе (титры кончились) — «Алик печатает…», отказ сети — строка. */
const boot = document.getElementById('boot')
const bootShow = (mode: 'wait' | 'fail'): void => {
  if (!boot) return
  // отказ сети важнее ожидания: упавшая загрузка уже не доедет
  if (mode === 'wait' && boot.classList.contains('failed')) return
  boot.classList.toggle('waiting', mode === 'wait')
  boot.classList.toggle('failed', mode === 'fail')
}

// Пакет приложения — единственный тяжёлый import() входа: три попытки с паузами (src/intro/retry.ts, #1477).
// Первую попытку игрок видит обычным индикатором, повтор — строкой «дозваниваемся… N из 3» на месте
// «Алик печатает…», после третьего отказа — строка про сеть и кнопка повтора вместо вечного индикатора.
const wtLine = document.querySelector<HTMLElement>('#boot .wt span')
const again = document.getElementById('boot-again')

/** Повтор виден: второе окно шелла говорит, что дозвон продолжается, а не молчит до перезагрузки. */
const showRetryLine = (attempt: number): void => {
  if (wtLine) wtLine.textContent = retryLine(attempt)
  bootShow('wait')
}

/** Серия кончилась: строка про сеть и кнопка, которая начинает её заново. */
const bootGiveUp = (): void => {
  clearAttempts()
  bootShow('fail')
  if (!again) return
  again.hidden = false
  again.addEventListener('click', () => location.reload(), { once: true })
}

/** Отказ не import()-а (старт приложения): вечный индикатор врёт о причине — в шелле строка про сеть. */
const bootFail = (e: unknown): void => {
  console.error('[alik] приложение не запустилось', e)
  bootShow('fail')
}

/** Попытка, которую делает этот документ: повторы приходят перезагрузкой, номер пережил её в sessionStorage. */
const bootAttempt = attemptsDone()
/** Документ повтора: жест уже был до перезагрузки, поэтому титры идут без гейта и пакет качается сразу. */
const retrying = bootAttempt > 1
if (retrying) showRetryLine(bootAttempt)

const app = (): Promise<typeof import('../main') | null> =>
  // Повтор — перезагрузка (src/intro/retry.ts): новый документ делает новый import(), а не кэш отказа
  import('../main')
    .then((module) => { clearAttempts(); return module })
    .catch((error: unknown) => {
      console.error(`[alik] пакет приложения не доехал: попытка ${bootAttempt} из ${MAIN_ATTEMPTS}`, error)
      const next = nextAttempt(bootAttempt)
      if (!next) { bootGiveUp(); return null }
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
  void app().then((m) => { if (m) void m.startApp().catch(bootFail) })
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
    // повтор после отказа сети: игрок уже начинал игру, второй раз просить касание незачем
    gate: !retrying,
    // Пакет поехал с первым титром: до касания 322 кБ не скачивает никто
    onStart: () => {
      void app().then((m) => {
        // Все три попытки отказали: на экране уже строка про сеть и кнопка, запускать нечего
        if (!m) return
        void m.startApp({ start, gesture: true, shellIntro: { ended: () => ended } })
          .then((h) => { handle = h })
          .catch(bootFail)
      })
    },
    // «Мууу» — звук игры: без смонтированного приложения его не сыграть, титры идут дальше
    onMoo: () => handle?.moo(),
    // Отметку «показано» ставит приложение — концом титров, как у интро в приложении: фаза `left` остаётся «intro»
    onFinish: () => { ended = true; handle?.introEnded(); bootShow('wait') },
    onGone: () => {
      root?.removeAttribute('inert')
      frame.remove()
    },
    trackNote: analyticsGate({ host: location.hostname, search: location.search }),
  })
}
