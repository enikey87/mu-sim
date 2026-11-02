import { D, MUEN_CARD, MUEN_LINK } from '../excuses'
import { muenAsked, muenAt } from '../memkeys'
import { set } from '../fact'
import type { ContentApi } from '../../engine/game'

/** Коровья реплика Алика: пока признания не было — версии-отрицания COW_A/COW_B, после признания
 *  источник назван и любая версия противоречила бы факту, поэтому отвечает линия Бынича (#1697). */
export function cowAnswer(game: ContentApi): string {
  if (game.mem()[muenAt] === undefined) return game.X.cow()
  return String(game.draw('MUEN_COW', D.MUEN_COW))
}

/** Признание «это я учу английский» + карточка курса mu-en — эскалация мычания.
 *  Один раз за партию, не раньше второго мычания (факт moo) и второго вопроса
 *  про корову/фон. Счётчик вопросов ведёт сам (muenAsked): его считают оба пути
 *  коровьего ответа — тон «корова» (Tone_Cow) и интент «voice» («что на фоне»),
 *  а remember движка ложится в факты после respond и в момент ответа ненадёжен.
 *  `muenAt` — ход признания (#1410): по нему `muenFresh` открывает окно отклика, и он же
 *  держит однократность карточки, поэтому ответ игрока его не стирает (потребление — `muen.answered`).
 *  true — ход исчерпан признанием; ответ после признания идёт через `cowAnswer`. */
export async function muenTurn(game: ContentApi, facts: Record<string, unknown>): Promise<boolean> {
  const asked = Number(game.mem()[muenAsked] ?? 0) + 1
  game.applyFacts([set(muenAsked, asked)])
  if (game.mem()[muenAt] !== undefined) return false
  if (Number(facts.moo ?? 0) < 2 || asked < 2) return false
  game.applyFacts([set(muenAt, Number(facts.sent))])
  await game.say([game.draw('MUEN_A', D.MUEN_A), game.draw('MUEN_B', D.MUEN_B)])
  game.push({ kind: 'muen', text: MUEN_CARD, link: MUEN_LINK })
  return true
}
