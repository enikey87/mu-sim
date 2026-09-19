// Доски памяти (FactBlackboard / FactBlackboardHub): общая память мира и своя — у каждого персонажа.
import type { Facts, FactOp, Query, Scope, WriteScope } from './types'
import type { Resolver } from './criteria'

export interface Hub {
  world: Facts
  actor(id: string): Facts
}

/** Хаб поверх сохраняемых объектов: world и доски персонажей по id. */
export function makeHub(world: Facts, actors: Record<string, Facts>): Hub {
  return { world, actor: (id) => (actors[id] ??= {}) }
}

/** Поиск факта: явная доска или каскад event → target → sender → world. */
export function resolver(hub: Hub, q: Query, eventFacts: Facts): Resolver {
  const board = (s: Exclude<Scope, 'event'>): Facts | undefined =>
    s === 'world' ? hub.world : s === 'sender' ? (q.sender ? hub.actor(q.sender) : undefined) : (q.target ? hub.actor(q.target) : undefined)
  return (key, scope, actor) => {
    if (actor) return hub.actor(actor)[key]
    if (scope === 'event') return eventFacts[key]
    if (scope) return board(scope)?.[key]
    const order: Array<Facts | undefined> = [eventFacts, board('target'), board('sender'), hub.world]
    for (const f of order) if (f && f[key] !== undefined) return f[key]
    return undefined
  }
}

/** Доска для записи; null — если scope указывает на персонажа, которого у события нет. */
export function writeBoard(hub: Hub, q: Pick<Query, 'sender' | 'target'>, scope: WriteScope = 'world'): Facts | null {
  if (scope === 'world') return hub.world
  const id = scope === 'sender' ? q.sender : q.target
  return id ? hub.actor(id) : null
}

export function applyOp(board: Facts, o: FactOp): void {
  const cur = board[o.key]
  switch (o.op) {
    case '=': board[o.key] = o.value; break
    case '+': board[o.key] = Number(cur ?? 0) + Number(o.value ?? 1); break
    case '*': board[o.key] = Number(cur ?? 0) * Number(o.value ?? 1); break
    case '!': board[o.key] = cur ? 0 : 1; break
  }
}

export const actorOf = (q: Pick<Query, 'sender' | 'target'>, scope: WriteScope | undefined): string | undefined =>
  scope === 'sender' ? q.sender : scope === 'target' ? q.target : undefined

