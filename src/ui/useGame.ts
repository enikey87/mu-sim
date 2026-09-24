import { createContext, useContext, useSyncExternalStore } from 'react'
import type { GameUi } from './view'

export const GameContext = createContext<GameUi | null>(null)

/** Игра без подписки: для действий и чтения в memo-компонентах. */
export function useGameApi(): GameUi {
  const game = useContext(GameContext)
  if (!game) throw new Error('useGame outside <GameContext>')
  return game
}

/** Текущая игра + перерисовка при любом её изменении. */
export function useGame(): GameUi {
  const game = useGameApi()
  useSyncExternalStore(game.subscribe, game.getVersion)
  return game
}
