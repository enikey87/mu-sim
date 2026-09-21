import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Game } from '../engine/game'

export const GameContext = createContext<Game | null>(null)

/** Игра без подписки: для действий и чтения в memo-компонентах. */
export function useGameApi(): Game {
  const game = useContext(GameContext)
  if (!game) throw new Error('useGame outside <GameContext>')
  return game
}

/** Текущая игра + перерисовка при любом её изменении. */
export function useGame(): Game {
  const game = useGameApi()
  useSyncExternalStore(game.subscribe, game.getVersion)
  return game
}
