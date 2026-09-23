// Эфемерное состояние интерфейса: живёт, пока жив Game, в сохранение не пишется.
// Пишут его методы Game и React-компоненты, читают компоненты; сброс — пересоздание Game.
import type { Trace } from './rules'

export interface TraceEntry extends Trace { id: number; day: number }
export interface Notif { id: number; icon: string; app: string; text: string }
export interface Moo { id: number; text: string; left: number; top: number }

/** Отклик на отправку: смысл понят, категория на экране не показывается. */
export type SendFeel = 'shake' | 'intimidate' | 'sorry' | 'moo'

export class UiState {
  status = { text: 'был недавно', cls: '' }
  typing: string | null = null
  toast: string | null = null
  notif: Notif | null = null
  moos: Moo[] = []
  busy = false
  dead = false
  charging: number | null = null
  unread = 0
  feel: SendFeel | null = null
  feelId = 0
  title = 'Алик, где деньги?'
  /** Последние выборы правил — debug-only, для DebugPanel (?debug). */
  trace: TraceEntry[] = []
  /** Флаг шторки: пишет App, читает onIdle. */
  sheetOpen = false
}
