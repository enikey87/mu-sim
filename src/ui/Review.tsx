// Режим живого рецензирования (#872): контекст, мини-меню «Заметка», модалка заметки и бейдж на сообщении.
// Состояние заметок держит App (у него живая игра); здесь — только представление и общий доступ к нему.
import { createContext, useContext, useRef, useState } from 'react'
import type { Msg } from '../engine/state'
import { CATEGORIES, SEVERITIES, categoryIcon, type ReviewCategory, type ReviewNote, type ReviewSeverity, type ReviewTarget } from './review'
import { useModal } from './useModal'

/** Черновик заметки: что аннотируем и чем это было в партии. */
export interface ReviewDraft {
  msg: number
  day: number
  turn: number
  target: ReviewTarget
  note: string
  type: ReviewCategory
  severity: ReviewSeverity
  /** id правимой заметки: бейдж открывает модалку в режиме правки. */
  editId?: number
}

export interface ReviewApi {
  enabled: boolean
  notes: readonly ReviewNote[]
  noteOf: (msg: number) => ReviewNote | undefined
  /** Правый клик или долгий тап: мини-меню сообщения. */
  menu: (m: Msg) => void
  /** Клик по бейджу: правка заметки. */
  edit: (id: number) => void
  toggle: () => void
  exportNow: () => void
}

const Ctx = createContext<ReviewApi | null>(null)
/** Режим рецензирования: вне него компоненты ведут себя как обычно (заметок и бейджей нет). */
export const useReview = (): ReviewApi | null => useContext(Ctx)
export const ReviewProvider = Ctx.Provider

/** Мини-меню сообщения: один пункт — «Заметка» (#872). */
export function ReviewMenu({ onNote, onClose }: { onNote: () => void; onClose: () => void }) {
  return (
    <div className="review-menu" role="menu" aria-label="Действия с сообщением" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <button type="button" role="menuitem" className="review-menu-item" onClick={onNote}>📝 Заметка</button>
      <button type="button" role="menuitem" className="review-menu-item" onClick={onClose}>Отмена</button>
    </div>
  )
}

/** Модалка заметки: текст, категория, важность; «Сохранить» пишет заметку, «Отмена» — ничего не меняет. */
export function ReviewModal({ draft, onSave, onCancel }: { draft: ReviewDraft; onSave: (d: ReviewDraft) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [note, setNote] = useState(draft.note)
  const [type, setType] = useState<ReviewCategory>(draft.type)
  const [severity, setSeverity] = useState<ReviewSeverity>(draft.severity)
  useModal({ active: true, dialogRef: ref, onEscape: onCancel })

  return (
    <div className="review-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="review-modal" ref={ref} role="dialog" aria-modal="true" aria-label="Заметка рецензента" tabIndex={-1}>
        <div className="review-quote">{draft.target.text || '—'}</div>
        <textarea
          className="review-text"
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Что не так?"
          aria-label="Текст заметки"
        />
        <div className="review-chips" role="radiogroup" aria-label="Категория">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={type === c.id} className={'review-chip' + (type === c.id ? ' on' : '')} onClick={() => setType(c.id)}>
              {c.icon} {c.title}
            </button>
          ))}
        </div>
        <div className="review-chips" role="radiogroup" aria-label="Важность">
          {SEVERITIES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={severity === s} className={'review-chip' + (severity === s ? ' on' : '')} onClick={() => setSeverity(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="review-actions">
          <button type="button" className="review-save" onClick={() => onSave({ ...draft, note, type, severity })}>Сохранить</button>
          <button type="button" className="review-cancel" onClick={onCancel}>Отмена</button>
        </div>
      </div>
    </div>
  )
}

/** Бейдж заметки на сообщении: иконка категории и номер; клик открывает правку. */
export function ReviewBadge({ note, onEdit }: { note: ReviewNote; onEdit: () => void }) {
  return (
    <button
      type="button"
      className="review-badge"
      title={`${note.type} · ${note.severity}`}
      aria-label={`Заметка ${note.id}: ${note.type}`}
      onClick={onEdit}
    >
      {categoryIcon(note.type)} {note.id}
    </button>
  )
}
