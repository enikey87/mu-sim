// Вход страницы (#1444, #1522): первый кадр — экран блокировки из index.html. Титры дорабатывают этот же
// узел (#lock-screen), а не строят второй, и тем же узлом уезжают в чат. Пакет приложения грузится
// динамическим import() параллельно первому титру и появляется под титрами; завязка общая — шелл выбирает
// её и передаёт в startApp, поэтому обещание на карточке и в чате одно. Титры играют только в вебе:
// у витрин прогресс лежит в облаке, и «есть сохранение» до адаптера не узнать, а показать титры поверх
// восстановленной партии — обман (сами витрины, как и раньше, грузят приложение import()).
import { STARTS } from '../content/starts'
import { SAVE_KEY } from '../engine/keys'
import { fmtDate, fmtTime } from '../engine/time'
import { introLinesOf, introTextOf } from './cards'
import { LEAVE_MS, mountIntro, prefersReducedMotion, type IntroHandle } from './mount'
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

/** Замок (#1522): один узел на всю загрузку — его дорабатывают титры, его увозит уход в чат. */
const frame = document.getElementById('intro-frame')
const lock = document.getElementById('lock-screen')
const root = document.getElementById('root')
const again = document.getElementById('boot-again')

/** Часы: загрузчик ставит реальное время первым делом; до него в разметке прочерк. */
const clock = lock?.querySelector<HTMLElement>('.intro-time')
if (clock) clock.textContent = fmtTime(clockMinutes())

/** Пока замок на экране, приложение под ним не ловит ни фокус, ни нажатия. */
root?.setAttribute('inert', '')

/** Загрузка пошла: уровень проявляется сам — порог задаёт CSS-переменная --boot-hint-delay (#1522). */
const bootStart = (): void => { lock?.classList.add('booting') }

/** Строка повтора в низу замка (#1477): каждая попытка называет себя, уровень на это время уходит. */
const message = lock?.querySelector<HTMLElement>('.fl')
/** Текст отказа — оттуда же, откуда его берёт сторож: в разметке он стоит с первого байта. */
const failText = message?.textContent ?? ''
const showRetryLine = (attempt: number): void => {
  if (!message) return
  message.textContent = retryLine(attempt)
  lock?.classList.add('msg')
}

/** Строка про сеть в низу замка: уровень и повтор уходят, остаётся текст отказа. */
const showFail = (): void => {
  if (message) message.textContent = failText
  lock?.classList.remove('msg')
  lock?.classList.add('failed')
}

/** Серия кончилась: строка про сеть и кнопка, которая начинает её заново. */
const bootGiveUp = (): void => {
  clearAttempts()
  showFail()
  if (!again) return
  again.hidden = false
  // кнопка — перезагрузка: касание по ней не должно ещё и начинать титры (обработчик замка)
  again.addEventListener('click', (e) => { e.stopPropagation(); location.reload() }, { once: true })
}

/** Отказ не import()-а (старт приложения): вечный уровень врёт о причине — в низу замка строка про сеть. */
const bootFail = (e: unknown): void => {
  console.error('[alik] приложение не запустилось', e)
  showFail()
}

/** Замок убран: место отдано чату. */
const gone = (): void => {
  frame?.remove()
  root?.removeAttribute('inert')
}

/** Мгновенная подмена замка чатом: ?nointro (боты, e2e) и reduced-motion не играют уезд (#1522). */
const revealNow = (): void => { gone() }

/** Уход в чат: тот же уезд 450 мс, что у титр. */
const goChat = (): void => {
  if (!frame) return
  if (prefersReducedMotion()) { gone(); return }
  lock?.classList.add('intro-leave')
  window.setTimeout(gone, LEAVE_MS)
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

/** Первый кадр чата отрисован: два кадра — render() реакта успевает закоммититься и нарисоваться. */
const afterPaint = (f: () => void): void => {
  if (typeof requestAnimationFrame !== 'function') { window.setTimeout(f, 0); return }
  requestAnimationFrame(() => requestAnimationFrame(f))
}

// Воркер (#1446): повторный визит и офлайн играются из app-shell кэша. Регистрация ждёт load
// и не мешает первому кадру; без API витрины или при отказе игра идёт как раньше (src/sw/register.ts).
// В dev воркера нет — sw.js появляется только сборкой, поэтому dev-сервер о нём не просит.
if (import.meta.env.PROD) armServiceWorker()

if (!shellIntroWanted({ noIntro: q.has('nointro'), web: webBuild, save: hasSave() })) {
  // Титров нет: замок только прикрывает загрузку. ?nointro снимает его сразу, тёплая загрузка уезжает
  // тем же уездом, что интро, — когда отрисован первый кадр чата.
  bootStart()
  void app().then((m) => {
    if (!m) return
    afterPaint(() => {
      void m.startApp()
        .then(() => { if (q.has('nointro')) revealNow(); else goChat() })
        .catch(bootFail)
    })
  })
} else {
  // Завязку выбирает шелл: её же получит партия, поэтому карточка 3 и пролог чата скажут одно обещание.
  // Отметку «показано» ставит конец титр (приложению он приходит сигналом onFinish), как у интро в приложении.
  const start = Math.floor(Math.random() * STARTS.length)
  let handle: AppHandle | null = null
  let titlesDone = false
  let ready = false
  let revealed = false
  let intro: IntroHandle | null = null

  /** Чат готов и титры кончились — только теперь уезд: второй индикатор не нужен (#1522). */
  const toChat = (): void => {
    if (revealed || !titlesDone || !ready) return
    revealed = true
    intro?.leave()
  }

  intro = mountIntro(frame ?? document.body, {
    lines: introLinesOf(introTextOf(STARTS[start])),
    date: fmtDate(0),
    clock: fmtTime(clockMinutes()),
    // повтор после отказа сети: игрок уже начинал игру, второй раз просить касание незачем
    gate: !retrying,
    // титры кончились раньше пакета — держим титул, пока не отрисован чат (#1522)
    hold: true,
    // Пакет поехал с первым титром: до касания 322 кБ не скачивает никто
    onStart: () => {
      bootStart()
      void app().then((m) => {
        // Все три попытки отказали: на экране уже строка про сеть и кнопка, запускать нечего
        if (!m) return
        void m.startApp({ start, gesture: true, shellIntro: { ended: () => titlesDone } })
          .then((h) => { handle = h; ready = true; afterPaint(toChat) })
          .catch(bootFail)
      })
    },
    // «Мууу» — звук игры: без смонтированного приложения его не сыграть, титры идут дальше
    onMoo: () => handle?.moo(),
    // Отметку «показано» ставит приложение — концом титров, как у интро в приложении: фаза `left` остаётся «intro»
    onFinish: () => { titlesDone = true; handle?.introEnded(); toChat() },
    onGone: gone,
    trackNote: analyticsGate({ host: location.hostname, search: location.search }),
  })
}
