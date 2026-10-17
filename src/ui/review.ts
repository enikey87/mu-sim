// Режим живого рецензирования (#872): заметки оператора прямо в партии и экспорт JSON с транскриптом.
// Заметки живут в sessionStorage (не в сохранении игры), переживают перезагрузку страницы и не уходят в аналитику.
// Формат транскрипта — тот же, что у плейтест-дампов (`transcript()` в `src/tools/playtest.ts`).
import type { Msg } from '../engine/state'

export type ReviewCategory = 'несостыковка' | 'плохой_вариант' | 'строка_на_переделку' | 'идея'
/** Типы сообщений, которые можно аннотировать: типы из ТЗ #872; `scene_button` — кнопка сцены, не сообщение ленты. */
export type ReviewTargetKind = 'player_choice' | 'answer_option' | 'alik_message' | 'system' | 'notification' | 'scene_button' | 'transfer' | 'voice' | 'photo'

export interface ReviewTarget { kind: ReviewTargetKind; text: string; offered: string[]; who: string }
export interface ReviewNote {
  id: number
  /** id сообщения ленты: по нему бейдж находит свою заметку (в ТЗ связь описана словами «привязана к сообщению»).
   *  У заметки о варианте ответа id нет — её якорь (ход, текст варианта) (#878). */
  msg?: number
  day: number
  turn: number
  type: ReviewCategory
  target: ReviewTarget
  note: string
}

export const REVIEW_KEY = 'review_notes'
export const REVIEW_PARAM = 'review'
/** Текст цели обрезан: заметка не тащит в экспорт целую простыню. */
export const TARGET_TEXT_MAX = 200

export const CATEGORIES: ReadonlyArray<{ id: ReviewCategory; icon: string; title: string }> = [
  { id: 'несостыковка', icon: '🔴', title: 'Несостыковка' },
  { id: 'плохой_вариант', icon: '🟡', title: 'Плохой вариант' },
  { id: 'строка_на_переделку', icon: '🔵', title: 'Строка на переделку' },
  { id: 'идея', icon: '💡', title: 'Идея' },
]
export const categoryIcon = (t: ReviewCategory): string => CATEGORIES.find((c) => c.id === t)?.icon ?? '🔴'

/** `?review` (можно `?review=1`) включает режим; без параметра интерфейс обычный. */
export const reviewRequested = (search: string): boolean => new URLSearchParams(search).has(REVIEW_PARAM)

/** Хранилище заметок: sessionStorage, но игра не падает, если его нет (приватный режим, чужая среда). */
type NoteStore = Pick<Storage, 'getItem' | 'setItem'>
const store = (): NoteStore | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}
export function loadNotes(s: NoteStore | null = store()): ReviewNote[] {
  try {
    const raw = s?.getItem(REVIEW_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as ReviewNote[]) : []
  } catch {
    return []
  }
}
export function saveNotes(notes: readonly ReviewNote[], s: NoteStore | null = store()): void {
  try {
    s?.setItem(REVIEW_KEY, JSON.stringify(notes))
  } catch {
    /* хранилище недоступно — заметки останутся в памяти до перезагрузки */
  }
}
/** Следующий id: заметки не удаляются молча, поэтому нумерация продолжается, а не переиспользуется. */
export const nextNoteId = (notes: readonly ReviewNote[]): number => notes.reduce((n, x) => Math.max(n, x.id), 0) + 1

/** Текст сообщения для заметки и экспорта: ровно то, что видно в ленте (#634 — без служебных префиксов). */
const textOf = (m: Msg): string => {
  switch (m.kind) {
    case 'text': case 'sys': case 'card': case 'photo': case 'fwd': case 'job': return m.text
    case 'transfer': return `💸 перевод ${m.amount ?? 50} ₽ — «${m.text}»`
    case 'voice': return `🎤 голосовое 0:${String(m.len).padStart(2, '0')}`
    case 'sticker': return `[стикер ${m.e} ${m.c}]`
    default: return ''
  }
}

/** Можно ли аннотировать сообщение: типы из ТЗ (кнопки сцен — не сообщения ленты, стикер и пересылка — не цель заметки). */
export const annotatable = (m: Msg): boolean =>
  m.kind === 'text' || m.kind === 'sys' || m.kind === 'card' || m.kind === 'transfer' || m.kind === 'voice' || m.kind === 'photo'

/** Что можно аннотировать: только перечисленные ТЗ типы; разделитель дня, стикер и пересылка — не цель заметки. */
export function reviewTargetOf(m: Msg, offered: readonly string[] = []): ReviewTarget | null {
  const who = m.kind === 'text' ? (m.from === 'me' ? 'me' : m.who ?? 'alik') : 'alik'
  const kind: ReviewTargetKind | null =
    m.kind === 'text' ? (m.from === 'me' ? 'player_choice' : 'alik_message')
      : m.kind === 'sys' ? 'system'
        : m.kind === 'card' ? 'notification'
          : m.kind === 'transfer' || m.kind === 'voice' || m.kind === 'photo' ? m.kind
            : null
  if (kind === null) return null
  return { kind, text: textOf(m).slice(0, TARGET_TEXT_MAX), offered: kind === 'player_choice' ? [...offered] : [], who }
}

/** Одна строка расшифровки: формат `line()` из плейтест-дампа (`src/tools/playtest.ts`). */
export function reviewLine(m: Msg, nameOf: (who?: string) => string): string {
  const t = m.time ? `[${m.time}] ` : ''
  switch (m.kind) {
    case 'sep': return `\n—— ${m.text} ——`
    case 'sys': return `[система] ${m.text}`
    case 'text': {
      const who = m.from === 'me' ? 'Я' : nameOf(m.who)
      const marks = [m.deleted && 'удалено', m.edited && 'изменено', m.react && `реакция Алика ${m.react}`].filter(Boolean)
      return `${t}${who}: ${m.text}${marks.length ? `  (${marks.join(', ')})` : ''}`
    }
    case 'transfer': return `${t}Алик: 💸 перевод ${m.amount ?? 50} ₽ — «${m.text}»`
    case 'voice': return `${t}Алик: 🎤 голосовое 0:${String(m.len).padStart(2, '0')}${m.feast ? ' (шум застолья)' : ''}`
    case 'photo': return `${t}Алик: 📷 фото «платёжки» (на снимке — баран на фоне Арарата), подпись: ${m.text}`
    case 'sticker': return `${t}Алик: [стикер ${m.e} ${m.c}]`
    case 'fwd': return `${t}Алик: ↪ переслано от «${m.f}»: ${m.text}`
    case 'doc': return `${t}Алик: 📄 ${m.title}: ${m.rows.map(([r, n]) => `${r} — ${n} ₽`).join('; ')}. Итого ${m.total} ₽`
    case 'job': return `${t}Алик: 🛠 допработа: ${m.text}${m.answered ? '' : ' (без ответа)'}`
    case 'card': {
      const btns = m.offer ? ` [кнопки: ${[m.offer.take, m.offer.sell, 'Не сейчас'].filter(Boolean).join(' / ')}]` : ''
      return `(карточка в ленте: ${m.icon} ${m.app} — ${[m.text, ...(m.lines ?? [])].join(' · ')}${btns}${m.result ? ` → ${m.result}` : ''})`
    }
    case 'lend50': return `${t}(карточка просьбы: 50 ₽ — ${m.text} → Перевести: ${m.link})`
  }
}

/** Переписка партии как текст: сообщения по порядку, перед репликой игрока — варианты, из которых он выбирал (ключ — id сообщения). */
export function reviewTranscript(
  msgs: readonly Msg[],
  offers: ReadonlyMap<number, readonly string[]>,
  nameOf: (who?: string) => string,
): string {
  const out: string[] = []
  msgs.forEach((m) => {
    const o = offers.get(m.id)
    if (o?.length && m.kind === 'text' && m.from === 'me') {
      out.push(`    варианты:\n    ${o.map((t) => `${t === m.text ? '▶' : ' '} ${t}`).join('\n    ')}`)
    }
    out.push(reviewLine(m, nameOf))
  })
  return out.join('\n')
}

/** Заметка о варианте ответа: якорь — ход и текст варианта, а не сообщение (варианты пересобираются за ход, #878). */
export const isOptionNote = (n: ReviewNote): boolean => n.target.kind === 'answer_option'

/** Отметка выбора для заметки о варианте: следующим ходом игрок отправил ровно этот текст? null — ход ещё не сделан. */
export function reviewChoiceOf(msgs: readonly Msg[], note: ReviewNote): boolean | null {
  if (!isOptionNote(note)) return null
  const mine = msgs.filter((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text' && m.from === 'me')
  // note.turn — счётчик ходов на момент заметки, то есть до отправки: выбор игрока — следующий его ход
  const sent = mine[note.turn]
  return sent ? sent.text === note.target.text : null
}

export interface ReviewSession { started: string; day: number; turns: number; build: string; endings: string[] }
/** Штамп времени в формате ТЗ: 2026-10-17T14:30 (минуты, без секунд). */
export const reviewStamp = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
/** Имя файла экспорта: review-YYYY-MM-DD-HHmm.json. */
export const reviewFileName = (d: Date): string =>
  `review-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.json`

/** Экспорт целиком: партия, заметки и полная расшифровка — чтобы аудитор сверил контекст заметки сам. */
export function reviewDump(session: ReviewSession, notes: readonly ReviewNote[], transcript: string, exported = new Date()): object {
  return { session: { ...session, exported: reviewStamp(exported) }, notes: [...notes], transcript }
}
