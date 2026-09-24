import type { Choice } from '../../engine/state'

/**
 * События игры — единственный список имён, по которому типизированы правила и `Game.fire`.
 * Опечатка в `event` иначе молчит с двух сторон: правило никогда не победит, вызов никого не найдёт.
 */
export type GameEvent =
  | 'PlayerSays' | 'PlayerMessage' | 'AlikTurn' | 'AlikIdle' | 'AlikAway' | 'AlikIgnores'
  | 'StoryBeat' | 'PickScene' | 'PickQuest' | 'ArcFinale' | 'CheckEnding'
  | 'PaydayOutcome' | 'PaydayButton' | 'PromiseDue' | 'PromiseConditionMet'
  | 'PeriodLine' | 'RudeCool' | 'Mentioned' | 'BuildChoices'

/** Что предлагает правило-сборщик (BuildChoices): вариант ответа игрока или ничего. */
export type Offer = Choice | null
