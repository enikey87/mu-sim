import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Game } from './engine/game'
import { realClock } from './engine/clock'
import { browserAudio } from './engine/audio'
import { SAVE_KEY } from './engine/state'
import { App } from './ui/App'
import { enable, firstGesture, boot, shown } from './analytics/metrics'
import { bootPlatform, platform, safeStorage } from './platform'
import './styles.css'

// Параметры адреса: ?fast — паузы в ~30 раз короче, ?hour=3 — подменить час, ?away=90 — «не было 90 минут»,
// ?debug — панель «какое правило выбрано и почему», ?nointro — без интро новой партии (e2e, бот, плейтест)
const q = new URLSearchParams(location.search)

// Игра создаётся вне React: StrictMode вызывает инициализаторы дважды, а у игры есть таймеры.
// Сначала адаптер витрины: отказ SDK не должен оставить белый экран.
void bootPlatform().then(() => {
  // Хранилище прогресса: у витрины своё (облако площадки, #1240), у веба и VK — localStorage.
  const storage = safeStorage(platform().storage?.())
  const hadSave = storage?.getItem(SAVE_KEY) != null
  const newGame = () => {
    const p = platform()
    const game = new Game({
      clock: realClock(q.has('fast') ? 0.03 : 1),
      audio: browserAudio(),
      hour: q.has('hour') ? Number(q.get('hour')) : null,
      away: q.has('away') ? Number(q.get('away')) : null,
      debug: q.has('debug'),
      storage,
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
    const gesture = () => {
      firstGesture()
      // первый жест один: `boot` — про этот жест, а не про загрузку файла
      boot(hadSave ? 'yes' : 'no')
      document.removeEventListener('pointerdown', gesture)
      document.removeEventListener('keydown', gesture)
    }
    document.addEventListener('pointerdown', gesture)
    document.addEventListener('keydown', gesture)
    shown() // с этой секунды идут секунды видимости: до жеста страница тоже на экране
  }

  const first = newGame()

  function Root() {
    const [{ game, n }, setState] = useState({ game: first, n: 0 })
    const onReset = () => {
      game.dispose()
      setState({ game: newGame(), n: n + 1 }) // новый key — сбросить и состояние интерфейса (открытое досье и т.п.)
    }
    // «Коснитесь, чтобы начать» — только когда в этой сессии ещё не было касания (первый запуск без сохранения);
    // после «Начать заново» касание уже было — анимация идёт сразу
    return <App key={n} game={game} onReset={onReset} debug={q.has('debug')} intro={!q.has('nointro')} introGate={n === 0 && !hadSave} />
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
})
