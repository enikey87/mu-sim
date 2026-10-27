import { isOn } from '../analytics/metrics'
import { TRACK_NOTE } from '../analytics/gate'

/** Строка игроку о счётчике: пока он включён. Баннера нет — он съедает интро (docs/design/analytics.md). */
export function TrackNote() {
  if (!isOn()) return null
  return <p className="track-note">{TRACK_NOTE}</p>
}
