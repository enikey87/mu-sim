// Именованные условия (criterion() в kawaii-doom): переиспользуемые проверки с понятным именем.
import { named, is, gte } from '../fact'

/** Алик «пропал» после грубости. */
export const AlikOffline = named('AlikOffline', is('offline'))
/** Просроченных обещаний накопилось много. */
export const ThickJournal = named('ThickJournal', gte('lateCount', 5))
/** Порог амнистии обещаний — решение оператора (docs/design/promise-amnesty.md): 5. */
export const JournalForAmnesty = named('JournalForAmnesty', gte('lateCount', 5))
