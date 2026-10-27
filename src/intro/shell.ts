// Вход страницы (#1444): первый кадр — шелл из index.html, дальше титры интро без React и без корпуса.
// Приложение грузится динамическим import() параллельно первому титру и появляется под титрами;
// завязка общая — шелл выбирает её и передаёт в startApp, поэтому обещание на карточке и в чате одно.
// Титры играют только в вебе: у витрин прогресс лежит в облаке, и «есть сохранение» до адаптера не узнать,
// а показать титры поверх восстановленной партии — обман (сами витрины, как и раньше, грузят приложение import()).
import { STARTS } from '../content/starts'
import { SAVE_KEY } from '../engine/keys'
import { fmtDate, fmtTime } from '../engine/time'
import { introLinesOf, introTextOf } from './cards'
import { mountIntro } from './mount'
import { shellIntroWanted } from './wanted'
import { analyticsGate } from '../analytics/gate'
import type { AppHandle } from '../main'

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

const app = () => import('../main')

if (!shellIntroWanted({ noIntro: q.has('nointro'), web: webBuild, save: hasSave() })) {
  // Титров нет: игра сама решит про своё интро по отметке в сохранении, шелл отдаёт ей место
  void app().then((m) => m.startApp())
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
      app()
        .then((m) => m.startApp({ start, gesture: true, shellIntro: { ended: () => ended } }))
        .then((h) => { handle = h })
        // Сеть не отдала пакет: на экране остаётся индикатор «Алик печатает…» из шелла — но не молча
        .catch((e: unknown) => console.error('[alik] пакет приложения не загрузился', e))
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
