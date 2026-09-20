import { useLayoutEffect, useRef, useState, useSyncExternalStore, memo } from 'react'
import { useGame, useGameApi } from './useGame'
import { Message } from './Message'
import type { Msg } from '../engine/state'

const BOTTOM_SLOP = 24
const isMine = (m: Msg): boolean => m.kind === 'text' && m.from === 'me'
const isIncoming = (m: Msg): boolean => m.kind !== 'sep' && !isMine(m)
const atBottom = (el: HTMLElement): boolean => el.scrollHeight - el.clientHeight - el.scrollTop <= BOTTOM_SLOP
const unreadLabel = (n: number): string => {
  if (n === 1) return '↓ Новое сообщение'
  const lastTwo = n % 100
  const last = n % 10
  return `↓ ${n} ${lastTwo >= 11 && lastTwo <= 14 ? 'новых сообщений' : last >= 2 && last <= 4 ? 'новых сообщения' : 'новых сообщений'}`
}

/** Счётчик пересборок списка — только в test. */
export const messageListRenderStats = { count: 0 }

/** Список пузырей: подписан только на эпоху сообщений, не на status/typing. */
const MessageList = memo(function MessageList() {
  const game = useGameApi()
  useSyncExternalStore(game.subscribe, game.getMsgsEpoch)
  if (import.meta.env.MODE === 'test') messageListRenderStats.count++
  return game.S.msgs.map((m) => <Message key={m.id} m={m} />)
})

/** Лента сообщений + «печатает…» + всплывающие «Мууу». */
export function Chat() {
  const game = useGame()
  const ref = useRef<HTMLElement>(null)
  const following = useRef(true)
  const previousCount = useRef(game.S.msgs.length)
  const [unread, setUnread] = useState(0)
  const count = game.S.msgs.length
  const version = game.getVersion()

  const scrollToBottom = () => {
    const el = ref.current
    if (!el) return
    following.current = true
    setUnread(0)
    // Мгновенно: плавный scroll временно выглядит как уход от низа и может потерять сообщение из быстрой серии.
    el.scrollTop = el.scrollHeight
  }

  // Пока игрок у нижнего края, держим там чат при любом обновлении игры: это включает замену
  // коротких «???» на многострочные варианты, которая уменьшает высоту ленты уже после ответа.
  useLayoutEffect(() => {
    const previous = previousCount.current
    const added = count >= previous ? game.S.msgs.slice(previous) : []
    previousCount.current = count
    if (added.some(isMine)) following.current = true // собственная реплика возвращает к текущему диалогу

    const incoming = added.filter(isIncoming).length
    if (following.current) scrollToBottom()
    else if (incoming) setUnread((n) => n + incoming)
  }, [version])

  // Клавиатура, поворот телефона и переносы текста тоже меняют доступную высоту без нового сообщения.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { if (following.current) el.scrollTop = el.scrollHeight })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    following.current = atBottom(el)
    if (following.current) setUnread(0)
  }

  return (
    <div className="chat-shell">
      <main className="chat" id="chat" ref={ref} onScroll={onScroll}>
        <div className="moo-layer">
          {game.moos.map((m) => (
            <div key={m.id} className="moo" style={{ left: `${m.left}%`, top: `${m.top}%` }}>{m.text}</div>
          ))}
        </div>
        <MessageList />
        {game.typing && (
          <div className="typing-bubble" aria-label={game.typing}><span /><span /><span /></div>
        )}
      </main>
      <div className="new-messages-slot" aria-live="polite">
        {unread > 0 && <button className="new-messages" onClick={scrollToBottom}>{unreadLabel(unread)}</button>}
      </div>
    </div>
  )
}
