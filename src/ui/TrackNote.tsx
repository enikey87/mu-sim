import { isOn } from '../analytics/metrics'

/** Строка игроку о счётчике: пока он включён. Баннера нет — он съедает интро (docs/design/analytics.md). */
export function TrackNote() {
  if (!isOn()) return null
  return <p className="track-note">Ходы считаются, текст сообщений — нет.</p>
}