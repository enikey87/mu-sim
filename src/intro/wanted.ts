// Играть ли титры шелла на этом входе — одно условие в одном месте: титры идут на первом запуске веба,
// без ?nointro и без сохранения. У витрин прогресс лежит в облаке, и «есть сохранение» до адаптера
// не узнать, а показать титры поверх восстановленной партии — обман (docs/design/intro.md).
export interface ShellIntroInput {
  /** В адресе есть `?nointro` — титров нет (e2e, бот, плейтест). */
  noIntro: boolean
  /** Сборка без витрины (`VITE_PLATFORM` пуст или `web`). */
  web: boolean
  /** В браузере уже лежит сохранение партии. */
  save: boolean
}

export const shellIntroWanted = (i: ShellIntroInput): boolean => i.web && !i.noIntro && !i.save
