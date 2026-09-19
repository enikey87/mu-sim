import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Game } from './engine/game'
import { realClock } from './engine/clock'
import { browserAudio } from './engine/audio'
import { App } from './ui/App'
import './styles.css'

// Параметры адреса для тестов: ?fast — паузы в ~30 раз короче, ?hour=3 — подменить час, ?away=90 — «не было 90 минут»
const q = new URLSearchParams(location.search)
const newGame = () => {
  const game = new Game({
    clock: realClock(q.has('fast') ? 0.03 : 1),
    audio: browserAudio(),
    hour: q.has('hour') ? Number(q.get('hour')) : null,
    away: q.has('away') ? Number(q.get('away')) : null,
  })
  ;(window as unknown as { __alik: Game }).__alik = game // для отладки из консоли
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
  return <App key={n} game={game} onReset={onReset} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
