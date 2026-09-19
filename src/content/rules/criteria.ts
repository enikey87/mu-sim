// Именованные условия (criterion() в kawaii-doom): переиспользуемые проверки с понятным именем.
import { named, is, gte } from '../../engine/rules'

/** Алик «пропал» после грубости. */
export const AlikOffline = named('AlikOffline', is('offline'))
/** Просроченных обещаний накопилось много. */
export const ThickJournal = named('ThickJournal', gte('lateCount', 5))
