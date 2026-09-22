import { useLayoutEffect, useRef, useState, useSyncExternalStore, memo, type ReactElement } from 'react'
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
/** Создание узлов и сколько индексов затронул sync — только в test. */
export const messageListBuildStats = { created: 0, touched: 0 }

/** Сколько последних сообщений держим в DOM (S.msgs не режем). */
export const LIVE_RENDER_CAP = 1000

type NodeCache = { len: number; nodes: ReactElement[]; windowStart: number }

/** С dirtyFrom: только хвост с изменённого индекса, без scan/copy префикса. */
function syncMessageNodes(cache: NodeCache, next: Msg[], dirtyFrom: number, windowStart: number): NodeCache {
  // окно сдвинулось на 1 при полной длине CAP — снять голову, дописать хвост
  if (
    cache.len > 0 &&
    next.length === cache.len &&
    windowStart === cache.windowStart + 1
  ) {
    const nodes = cache.nodes
    nodes.shift()
    const last = next[next.length - 1]!
    nodes.push(<Message key={last.id} m={last} />)
    if (import.meta.env.MODE === 'test') {
      messageListBuildStats.created = 1
      messageListBuildStats.touched = 1
    }
    return { len: next.length, nodes, windowStart }
  }
  if (cache.windowStart !== windowStart || cache.len === 0 || next.length < cache.len) {
    const nodes = next.map((m) => <Message key={m.id} m={m} />)
    if (import.meta.env.MODE === 'test') {
      messageListBuildStats.created = nodes.length
      messageListBuildStats.touched = nodes.length
    }
    return { len: next.length, nodes, windowStart }
  }
  const from = Math.min(Math.max(0, dirtyFrom), cache.len)
  const nodes = cache.nodes
  let created = 0
  if (next.length === cache.len) {
    for (let i = from; i < next.length; i++) {
      nodes[i] = <Message key={next[i].id} m={next[i]} />
      created++
    }
  } else {
    nodes.length = from
    for (let i = from; i < next.length; i++) {
      nodes.push(<Message key={next[i].id} m={next[i]} />)
      created++
    }
  }
  if (import.meta.env.MODE === 'test') {
    messageListBuildStats.created = created
    messageListBuildStats.touched = next.length - from
  }
  return { len: next.length, nodes, windowStart }
}

/** Список пузырей: подписан только на эпоху сообщений, не на status/typing. */
const MessageList = memo(function MessageList() {
  const game = useGameApi()
  const epoch = useSyncExternalStore(game.subscribe, game.getMsgsEpoch)
  if (import.meta.env.MODE === 'test') messageListRenderStats.count++
  const cache = useRef<NodeCache>({ len: 0, nodes: [], windowStart: 0 })
  const applied = useRef(-1)
  const all = game.S.msgs
  const windowStart = Math.max(0, all.length - LIVE_RENDER_CAP)
  const visible = windowStart > 0 ? all.slice(windowStart) : all
  if (applied.current !== epoch) {
    const dirtyAbs = game.getMsgsDirtyFrom()
    const dirtyRel = windowStart > 0 ? Math.max(0, dirtyAbs - windowStart) : dirtyAbs
    cache.current = syncMessageNodes(cache.current, visible, dirtyRel, windowStart)
    applied.current = epoch
  }
  useLayoutEffect(() => { game.ackMsgsDirty() }, [epoch, game])
  // новый массив — иначе React может не увидеть in-place push в кэш
  if (windowStart > 0) {
    return [<div key="__cap" className="sep" aria-hidden="true">···</div>, ...cache.current.nodes]
  }
  return cache.current.nodes.slice()
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
      <main className="chat" id="chat" ref={ref} onScroll={onScroll} role="log" aria-live="polite">
        <div className="moo-layer" aria-hidden="true">
          {game.moos.map((m) => (
            <div key={m.id} className="moo" style={{ left: `${m.left}%`, top: `${m.top}%` }}>{m.text}</div>
          ))}
        </div>
        <MessageList />
        {game.typing && (
          // внутри живой ленты «печатает…» дублировало бы каждое входящее — читалке достаточно самого сообщения
          <div className="typing-bubble" aria-hidden="true"><span /><span /><span /></div>
        )}
      </main>
      <div className="new-messages-slot" aria-live="polite">
        {unread > 0 && <button className="new-messages" onClick={scrollToBottom}>{unreadLabel(unread)}</button>}
      </div>
    </div>
  )
}
