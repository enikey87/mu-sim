import { describe, it, expect } from 'vitest'
import { makeHub, resolver, writeBoard, applyOp, actorOf } from './blackboard'
import type { Facts } from './types'

describe('доски памяти', () => {
  const setup = () => {
    const world: Facts = { mood: 'world', w: 1 }
    const actors: Record<string, Facts> = { karine: { mood: 'karine', k: 1 }, garik: { mood: 'garik' } }
    return { world, actors, hub: makeHub(world, actors) }
  }

  it('makeHub создаёт доску персонажа при первом обращении', () => {
    const { hub, actors } = setup()
    expect(hub.actor('boris')).toEqual({})
    expect(actors.boris).toBeDefined()
    hub.actor('boris').x = 1
    expect(actors.boris.x).toBe(1)
  })

  it('каскад без scope: event → target → sender → world', () => {
    const { hub } = setup()
    const get = resolver(hub, { event: 'E', sender: 'garik', target: 'karine' }, { e: 1 })
    expect(get('e')).toBe(1)
    expect(get('mood')).toBe('karine') // target раньше sender и world
    expect(get('w')).toBe(1)
    expect(get('none')).toBeUndefined()
    const noTarget = resolver(hub, { event: 'E', sender: 'garik' }, {})
    expect(noTarget('mood')).toBe('garik')
    const nobody = resolver(hub, { event: 'E' }, { mood: 'event' })
    expect(nobody('mood')).toBe('event')
  })

  it('явный scope и доска конкретного персонажа', () => {
    const { hub } = setup()
    const get = resolver(hub, { event: 'E', sender: 'garik', target: 'karine' }, { mood: 'event' })
    expect(get('mood', 'event')).toBe('event')
    expect(get('mood', 'world')).toBe('world')
    expect(get('mood', 'sender')).toBe('garik')
    expect(get('mood', 'target')).toBe('karine')
    expect(get('k', undefined, 'karine')).toBe(1)
    const bare = resolver(hub, { event: 'E' }, {})
    expect(bare('mood', 'sender')).toBeUndefined()
    expect(bare('mood', 'target')).toBeUndefined()
  })

  it('доска для записи: world по умолчанию, персонаж — если он есть у события', () => {
    const { hub, world, actors } = setup()
    expect(writeBoard(hub, {})).toBe(world)
    expect(writeBoard(hub, { sender: 'garik' }, 'sender')).toBe(actors.garik)
    expect(writeBoard(hub, { target: 'karine' }, 'target')).toBe(actors.karine)
    expect(writeBoard(hub, {}, 'sender')).toBeNull()
    expect(writeBoard(hub, {}, 'target')).toBeNull()
  })

  it('операции: = + * !', () => {
    const b: Facts = {}
    applyOp(b, { key: 'a', op: '=', value: 5 })
    applyOp(b, { key: 'a', op: '+', value: 2 })
    applyOp(b, { key: 'n', op: '+' })
    applyOp(b, { key: 'a', op: '*', value: 3 })
    applyOp(b, { key: 'm', op: '*' })
    applyOp(b, { key: 'f', op: '!' })
    applyOp(b, { key: 'a2', op: '!', value: 0 })
    expect(b).toEqual({ a: 21, n: 1, m: 0, f: 1, a2: 1 })
    applyOp(b, { key: 'f', op: '!' })
    expect(b.f).toBe(0)
  })

  it('actorOf', () => {
    expect(actorOf({ sender: 's', target: 't' }, 'sender')).toBe('s')
    expect(actorOf({ sender: 's', target: 't' }, 'target')).toBe('t')
    expect(actorOf({ sender: 's' }, 'world')).toBeUndefined()
    expect(actorOf({ sender: 's' }, undefined)).toBeUndefined()
  })
})
