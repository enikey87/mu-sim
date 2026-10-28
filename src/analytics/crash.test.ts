// @vitest-environment jsdom
// #1482: маячок краха — одна цель `crash` во все приёмники, без текста ошибки и переписки.
import { describe, it, expect, beforeEach } from 'vitest'
import { enable, crash, watchCrashes, CRASH_STACK_MAX, GAME_HOST } from './metrics'

type YmCall = [number, string, ...unknown[]]
type PhCall = [string, ...unknown[]]

/** Подставные клиенты Метрики и PostHog: живая сеть прогон не трогает. */
const setup = () => {
  const ym: YmCall[] = []
  const ph: PhCall[] = []
  ;(globalThis as { ym?: unknown }).ym = (...args: unknown[]) => { ym.push(args as YmCall) }
  const client = { _i: [] as unknown[][], init: (...args: unknown[]) => { ph.push(['init', ...args]) }, capture: (...args: unknown[]) => { ph.push(['capture', ...args]) } }
  ;(globalThis as { posthog?: unknown }).posthog = client
  return { ym, ph }
}

const crashPayload = (ph: PhCall[]): Record<string, unknown> => {
  const call = ph.find((c) => c[0] === 'capture' && c[1] === 'crash')
  return (call?.[2] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  delete (globalThis as { ym?: unknown }).ym
  delete (globalThis as { posthog?: unknown }).posthog
  // модульное состояние приёмников — с нуля на каждый тест
  enable({ host: '', search: '', id: '' })
})

describe('маячок краха (#1482)', () => {
  it('одна цель crash во все приёмники: вид, имя ошибки, день партии и платформа', () => {
    const { ym, ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '4242', posthogKey: 'ph_key' })

    crash('ui', new Error('boom'), { day: 137, platform: 'telegram' })

    expect(ym).toContainEqual([4242, 'reachGoal', 'crash', expect.objectContaining({ kind: 'ui', name: 'Error', day: 137, platform: 'telegram' })])
    expect(ph).toContainEqual(['capture', 'crash', expect.objectContaining({ kind: 'ui', name: 'Error', day: 137, platform: 'telegram' })])
    expect(crashPayload(ph).stack).toContain('at ')
  })

  it('стек обрезан до потолка и не несёт текста ошибки — он может быть репликой игрока', () => {
    const { ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '', posthogKey: 'ph_key' })
    const secret = 'Мууу, брат, верни деньги'
    const error = new Error(secret)
    error.stack = `Error: ${secret}\n${'    at frame (src/x.ts:1:1)\n'.repeat(400)}`

    crash('global', error, { day: 3, platform: 'web' })

    const payload = crashPayload(ph)
    expect(payload.name).toBe('Error')
    expect(String(payload.stack).length).toBeLessThanOrEqual(CRASH_STACK_MAX)
    expect(JSON.stringify(ph)).not.toContain(secret)
  })

  it('не-Error: имя — тип, стека нет', () => {
    const { ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '', posthogKey: 'ph_key' })

    crash('global', 'упало', { day: 0, platform: 'web' })

    expect(crashPayload(ph)).toMatchObject({ kind: 'global', name: 'string', stack: '' })
  })

  it('приёмники выключены — маячок молчит', () => {
    const { ym, ph } = setup()

    crash('ui', new Error('boom'), { day: 1, platform: 'web' })

    expect(ym).toHaveLength(0)
    expect(ph).toHaveLength(0)
  })

  it('глобальные обработчики: window.onerror и unhandledrejection дают тот же маячок, ошибка ресурса — нет', () => {
    const { ph } = setup()
    enable({ host: GAME_HOST, search: '', id: '', posthogKey: 'ph_key' })
    watchCrashes(() => ({ day: 12, platform: 'web' }))

    // ошибка ресурса: у события нет `error` — страница жива, маячка нет
    window.dispatchEvent(new Event('error'))

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }))
    const rejection = new Event('unhandledrejection') as Event & { reason: unknown }
    rejection.reason = new Error('promise')
    window.dispatchEvent(rejection)

    const crashes = ph.filter((c) => c[0] === 'capture' && c[1] === 'crash')
    expect(crashes).toHaveLength(2)
    expect(crashes.map((c) => (c[2] as Record<string, unknown>).kind)).toEqual(['global', 'global'])
    expect(crashes.map((c) => (c[2] as Record<string, unknown>).day)).toEqual([12, 12])
  })
})
