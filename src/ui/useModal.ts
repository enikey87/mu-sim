import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

const focusables = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[inert]'))

/** Фокус в диалог при открытии, Tab внутри, Esc, возврат фокуса при закрытии. */
export function useModal(opts: {
  active: boolean
  dialogRef: RefObject<HTMLElement | null>
  onEscape?: () => void
  returnFocus?: () => HTMLElement | null
}): void {
  const { active, dialogRef, onEscape, returnFocus } = opts
  const onEscapeRef = useRef(onEscape)
  const returnFocusRef = useRef(returnFocus)
  onEscapeRef.current = onEscape
  returnFocusRef.current = returnFocus

  useEffect(() => {
    if (!active) return
    const dialog = dialogRef.current
    if (!dialog) return
    const prev = (document.activeElement instanceof HTMLElement) ? document.activeElement : null
    const list = focusables(dialog)
    ;(list[0] ?? dialog).focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.preventDefault()
        e.stopPropagation()
        onEscapeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = focusables(dialog)
      if (!nodes.length) { e.preventDefault(); return }
      const i = nodes.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey) {
        if (i <= 0) { e.preventDefault(); nodes[nodes.length - 1].focus() }
      } else if (i === nodes.length - 1 || i < 0) {
        e.preventDefault()
        nodes[0].focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const back = returnFocusRef.current?.() ?? prev
      if (back?.isConnected) back.focus()
    }
  }, [active, dialogRef])
}
