import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Game } from '../engine/game'

export const GameContext = createContext<Game | null>(null)

/** Текущая игра + перерисовка при любом её изменении. */
export function useGame(): Game {
  const game = useContext(GameContext)
  if (!game) throw new Error('useGame outside <GameContext>')
  useSyncExternalStore(game.subscribe, game.getVersion)
  return game
}
