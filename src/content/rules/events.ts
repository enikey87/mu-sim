import type { Choice } from '../../engine/state'

/**
 * События игры — единственный список имён, по которому типизированы правила и `Game.fire`.
 * Опечатка в `event` иначе молчит с двух сторон: правило никогда не победит, вызов никого не найдёт.
 */
export type GameEvent =
  | 'PlayerSays' | 'PlayerMessage' | 'AlikTurn' | 'AlikIdle' | 'AlikAway' | 'AlikIgnores'
  | 'OfflineReturn'
  | 'StoryBeat' | 'PickScene' | 'PickQuest' | 'ArcFinale' | 'CheckEnding'
  | 'PaydayOutcome' | 'PaydayButton' | 'PromiseDue' | 'PromiseConditionMet'
  | 'BillDue' | 'BillWarn' | 'CreditDue'
  | 'PeriodLine' | 'RudeCool' | 'Mentioned' | 'BuildChoices'

/** Что предлагает правило-сборщик (BuildChoices): вариант ответа игрока или ничего. */
export type Offer = Choice | null

/**
 * Кто инициирует событие: ход самого игрока (`player`) или сама игра (`world`).
 *
 * В активном эпилоге мир молчит (#1704): из `world`-событий движок проводит только правила-глушилки
 * (`quiet`), а говорящие не берёт — поэтому новая реплика младшей специфичности не пролезет мимо
 * тишины. Record по всем `GameEvent` заставляет классифицировать каждое новое событие: забытая
 * запись — ошибка типов, а не тихая дыра.
 */
export const EVENT_SOURCE: Record<GameEvent, 'player' | 'world'> = {
  // ход игрока: реплика, кнопка, ответ на неё
  PlayerSays: 'player',
  PlayerMessage: 'player',
  AlikTurn: 'player',
  // «прочитано и молчит» — тоже ответ на ход игрока, а не инициатива мира
  AlikIgnores: 'player',
  // проверка конца идёт в конце хода игрока и только зажигает экран концовки — сама она не говорит
  CheckEnding: 'player',
  // возврат из пропажи открывает ход игрока; иначе `alikTurn` говорит пул возвращений без правила
  OfflineReturn: 'player',
  // варианты ходов собираются для игрока
  BuildChoices: 'player',
  // таймеры, расписание и фон — всё, что мир делает сам
  AlikIdle: 'world',
  AlikAway: 'world',
  // сюжетный ход зовётся только из хода игрока (после его реплики): это не инициатива мира,
  // а часть хода — в эпилоге он отдаёт колоду эпилога, как и `AlikTurn`
  StoryBeat: 'player',
  PickScene: 'world',
  PickQuest: 'world',
  ArcFinale: 'world',
  PaydayOutcome: 'world',
  PaydayButton: 'world',
  PromiseDue: 'world',
  PromiseConditionMet: 'world',
  BillDue: 'world',
  BillWarn: 'world',
  CreditDue: 'world',
  PeriodLine: 'world',
  RudeCool: 'world',
  Mentioned: 'world',
}
