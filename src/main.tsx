// Вход приложения: игра создаётся вне React, интерфейс — React поверх неё.
// Модуль не запускается сам: его грузит вход страницы (src/intro/shell.ts) — динамическим import()
// параллельно титрам интро (#1444), поэтому до вызова startApp здесь ничего не происходит.
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Game } from './engine/game'
import { realClock } from './engine/clock'
import { browserAudio } from './engine/audio'
import { SAVE_KEY } from './engine/state'
import { App } from './ui/App'
import { enable, firstGesture, boot, shown } from './analytics/metrics'
import { bootPlatform, platform, safeStorage } from './platform'
import { Restore } from './ui/Restore'
import './styles.css'

// Параметры адреса: ?fast — паузы в ~30 раз короче, ?hour=3 — подменить час, ?away=90 — «не было 90 минут»,
// ?debug — панель «какое правило выбрано и почему», ?nointro — без интро новой партии (e2e, бот, плейтест),
// ?noidle — режим спокойного чата: инициативы Алика по бездействию не подаются
const q = new URLSearchParams(location.search)

export interface StartOptions {
  /** Завязка, выбранная титрами шелла: партия начнётся с неё, чтобы обещание в титрах и в чате совпали. */
  start?: number
  /** Первый жест был до загрузки этого файла (тап по титрам): тег аналитики идёт сразу, без ожидания второго. */
  gesture?: boolean
  /** Титры играет шелл: React их не рисует, а отметку «показано» ставит конец титров — как у интро в приложении. */
  shellIntro?: { ended: () => boolean }
}

/** Что титры шелла вправе попросить у уже смонтированного приложения. */
export interface AppHandle {
  /** «Мууууу» на титуле — тем же звуком игры. */
  moo: () => void
  /** Титры кончились или игрок их пропустил: партия помнит «показано» (один раз). */
  introEnded: () => void
}

/** Запуск приложения: адаптер витрины, хранение, игра, монтирование. Резолвится, когда чат отрисован. */
export function startApp(opts: StartOptions = {}): Promise<AppHandle> {
  // Игра создаётся вне React: StrictMode вызывает инициализаторы дважды, а у игры есть таймеры.
  // Сначала адаптер витрины: отказ SDK не должен оставить белый экран.
  return bootPlatform().then(() => {
    // Хранилище прогресса: у витрины своё (облако площадки, #1240), у веба и VK — localStorage.
    const storage = safeStorage(platform().storage?.())
    const hadSave = storage?.getItem(SAVE_KEY) != null
    // Перенос партии (#1488): канал есть только у Telegram-сборки с адресом воркера.
    // Токен из `?startapp=` показываем лишь на пустом устройстве — иначе нечем затирать живую партию.
    const transfer = platform().transfer?.() ?? null
    const restoreToken = hadSave ? null : transfer?.token() ?? null
    const newGame = (start?: number) => {
      const p = platform()
      const game = new Game({
        clock: realClock(q.has('fast') ? 0.03 : 1),
        audio: browserAudio(),
        hour: q.has('hour') ? Number(q.get('hour')) : null,
        away: q.has('away') ? Number(q.get('away')) : null,
        debug: q.has('debug'),
        noIdle: q.has('noidle'),
        storage,
        start,
        externalPay: p.externalPay,
        joinGroup: p.joinGroup != null,
        // где карточка «займи 50» — покупка, там имя витрины: текст карточки у Яндекса и Telegram разный
        pay50: p.pay50 != null && (p.id === 'yandex' || p.id === 'telegram') ? p.id : undefined,
      })
      // Незакрытую покупку адаптер закрыл при старте (п. 1.13.1) — спонсорский итог выдаём партии один раз.
      if (p.takeSponsor?.()) game.lend50Sponsor()
      ;(window as unknown as { __alik: Game }).__alik = game // API для scripts/playtest-tech.mjs (и консоли): что он вызывает, проверяет src/tools/window-api.test.ts
      return game
    }

    // Счётчик Метрики включает только вход страницы и только когда заданы номер, хост игры и адрес без debug/fast;
    // тег грузится первым жестом — тем же, что разрешает звук (docs/design/analytics.md).
    if (enable({ host: location.hostname, search: location.search })) {
      const onGesture = () => {
        firstGesture()
        // первый жест один: `boot` — про этот жест, а не про загрузку файла
        boot(hadSave ? 'yes' : 'no')
        document.removeEventListener('pointerdown', onGesture)
        document.removeEventListener('keydown', onGesture)
      }
      if (opts.gesture) onGesture() // жест случился по титрам шелла — этот файл его уже не застал
      else {
        document.addEventListener('pointerdown', onGesture)
        document.addEventListener('keydown', onGesture)
      }
      shown() // с этой секунды идут секунды видимости: до жеста страница тоже на экране
    }

    const first = newGame(opts.start)
    // Титры шелла: их конец ставит ту же отметку, что конец интро в приложении, — иначе React сыграет их второй раз.
    // Если приложение смонтировалось после титров, отметка ставится сразу.
    const shellIntro = opts.shellIntro
    const markIntro = (): void => first.introDone()
    if (shellIntro?.ended()) markIntro()

    function Root() {
      const [{ game, n }, setState] = useState({ game: first, n: 0 })
      const [pendingRestore, setPendingRestore] = useState(restoreToken)
      // Заход и уход — на сервер: копия партии для переноса и отметка «игрок вернулся» для напоминаний.
      // Локальная партия остаётся источником правды: не доехало — игра идёт дальше.
      useEffect(() => {
        if (!transfer) return
        const push = () => transfer.push(storage?.getItem(SAVE_KEY) ?? null, game.S.ending != null)
        push()
        const onHide = () => push()
        const onVisibility = () => { if (document.hidden) push() }
        document.addEventListener('pagehide', onHide)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          document.removeEventListener('pagehide', onHide)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [game])
      const onReset = () => {
        game.dispose()
        setState({ game: newGame(), n: n + 1 }) // новый key — сбросить и состояние интерфейса (открытое досье и т.п.)
      }
      // «Коснитесь, чтобы начать» — только когда в этой сессии ещё не было касания (первый запуск без сохранения);
      // после «Начать заново» касание уже было — анимация идёт сразу.
      // Титры первой партии играет шелл: интерфейсу остаётся перезапуск «Начать заново»
      const intro = !q.has('nointro') && !(shellIntro && n === 0)
      if (pendingRestore && transfer) {
        return (
          <Restore
            channel={transfer}
            token={pendingRestore}
            onSkip={() => setPendingRestore(null)}
            onRestore={(save) => {
              // сохранение кладётся туда, откуда его читает конструктор партии: игра стартует уже восстановленной
              storage?.setItem(SAVE_KEY, save)
              game.dispose()
              setPendingRestore(null)
              setState({ game: newGame(), n: n + 1 })
            }}
          />
        )
      }
      return <App key={n} game={game} onReset={onReset} debug={q.has('debug')} intro={intro} introGate={n === 0 && !hadSave} />
    }

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Root />
      </StrictMode>,
    )
    // «Мууу» титров — звуком той партии, что сейчас на экране: до «Начать заново» титры не доживают
    return { moo: () => first.audio.moo(), introEnded: markIntro }
  })
}
