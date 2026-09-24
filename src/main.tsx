import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Game } from './engine/game'
import { realClock } from './engine/clock'
import { browserAudio } from './engine/audio'
import { SAVE_KEY } from './engine/state'
import { App } from './ui/App'
import './styles.css'

// Параметры адреса: ?fast — паузы в ~30 раз короче, ?hour=3 — подменить час, ?away=90 — «не было 90 минут»,
// ?debug — панель «какое правило выбрано и почему», ?nointro — без интро новой партии (e2e, бот, плейтест)
const q = new URLSearchParams(location.search)
const hadSave = typeof localStorage !== 'undefined' && localStorage.getItem(SAVE_KEY) !== null
const newGame = () => {
  const game = new Game({
    clock: realClock(q.has('fast') ? 0.03 : 1),
    audio: browserAudio(),
    hour: q.has('hour') ? Number(q.get('hour')) : null,
    away: q.has('away') ? Number(q.get('away')) : null,
    debug: q.has('debug'),
  })
  ;(window as unknown as { __alik: Game }).__alik = game // API для scripts/playtest-tech.mjs (и консоли): что он вызывает, проверяет src/tools/window-api.test.ts
  return game
}

// Игра создаётся вне React: StrictMode вызывает инициализаторы дважды, а у игры есть таймеры
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
