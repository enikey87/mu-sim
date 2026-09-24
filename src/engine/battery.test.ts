// Батарея: разряд, смерть телефона, зарядка. Поведение защищено здесь, а не чтением game.ts.
import { describe, expect, it, vi } from 'vitest'
import { Battery, type BatteryHost } from './battery'
import { freshState } from './state'

type MockHost = BatteryHost & { low: ReturnType<typeof vi.fn>; dead: ReturnType<typeof vi.fn>; chargeDone: ReturnType<typeof vi.fn>; emit: ReturnType<typeof vi.fn>; sleep: ReturnType<typeof vi.fn> }

const makeHost = (over: Partial<BatteryHost> = {}): MockHost => ({
  low: vi.fn(),
  dead: vi.fn(),
  chargeDone: vi.fn(),
  sleep: vi.fn(async () => undefined),
  emit: vi.fn(),
  isDisposed: () => false,
  rnd: (n: number) => n - 1,
  ...over,
}) as MockHost

const makeBattery = (level = 100, over: Partial<BatteryHost> = {}) => {
  const S = freshState()
  S.battery = level
  const host = makeHost(over)
  return { S, host, battery: new Battery(S, host) }
}

describe('батарея телефона', () => {
  it('разряд вычитает и пишет в состояние', () => {
    const { S, battery } = makeBattery(50)
    battery.drain()
    expect(S.battery).toBe(49)
    battery.drain(5)
    expect(S.battery).toBe(44)
  })

  it('пересечение 15 % вниз уведомляет один раз; дальше — молча', () => {
    const { host, battery } = makeBattery(17)
    battery.drain(2) // 17 -> 15
    expect(host.low).toHaveBeenCalledTimes(1)
    expect(host.low).toHaveBeenCalledWith(15)
    battery.drain(1) // 15 -> 14, уже ниже порога
    expect(host.low).toHaveBeenCalledTimes(1)
  })

  it('ноль — телефон сел: флаг и колбек, повторный die() — ничего', () => {
    const { host, battery } = makeBattery(2)
    battery.drain(2)
    expect(battery.dead).toBe(true)
    expect(host.dead).toHaveBeenCalledTimes(1)
    battery.die()
    expect(host.dead).toHaveBeenCalledTimes(1)
  })

  it('севший телефон не разряжается дальше и не эмитит', () => {
    const { S, host, battery } = makeBattery(1)
    battery.drain(1)
    expect(battery.dead).toBe(true)
    host.emit.mockClear()
    battery.drain(5)
    expect(S.battery).toBe(0)
    expect(host.emit).not.toHaveBeenCalled()
  })

  it('зарядка: прогресс, 100 %, флаги сброшены, жизнь возобновлена', async () => {
    const { host, battery } = makeBattery(0)
    battery.die()
    const done = battery.charge()
    expect(battery.charging).toBe(1)
    await done
    expect(battery.charging).toBeNull()
    expect(battery.level).toBe(100)
    expect(battery.dead).toBe(false)
    expect(host.chargeDone).toHaveBeenCalledTimes(1)
    expect(host.sleep).toHaveBeenCalledTimes(12) // 1, 10, ..., 91, 100
  })

  it('зарядка не начинается живому, заряжающемуся или умирающему телефону', async () => {
    const a = makeBattery(50)
    await a.battery.charge()
    expect(a.host.chargeDone).not.toHaveBeenCalled()

    const b = makeBattery(0)
    b.battery.die()
    const first = b.battery.charge()
    await b.battery.charge() // уже заряжается — отказ
    await first
    expect(b.host.sleep).toHaveBeenCalledTimes(12)
    expect(b.host.chargeDone).toHaveBeenCalledTimes(1)

    const c = makeBattery(0, { isDisposed: () => true })
    c.battery.die()
    await c.battery.charge()
    expect(c.host.sleep).not.toHaveBeenCalled()
  })

  it('dispose во время зарядки обрывает её, не меняя состояние', async () => {
    let disposed = false
    const { battery } = makeBattery(0, { isDisposed: () => disposed })
    battery.die()
    const done = battery.charge()
    expect(battery.charging).toBe(1)
    disposed = true
    await done
    expect(battery.dead).toBe(true)
    expect(battery.charging).toBe(1) // оборвались на первом проценте
  })

  it('restore подзаряжает до 100 % без колбеков', () => {
    const { host, battery } = makeBattery(10)
    battery.restore()
    expect(battery.level).toBe(100)
    expect(host.emit).not.toHaveBeenCalled()
  })

  it('чужая ошибка из sleep пробрасывается, GameDisposed проглатывается', async () => {
    const boom = makeBattery(0, { sleep: vi.fn(async () => { throw new Error('сломалось') }) })
    boom.battery.die()
    await expect(boom.battery.charge()).rejects.toThrow('сломалось')

    const disposed = new Error('disposed')
    disposed.name = 'GameDisposed'
    const quiet = makeBattery(0, { sleep: vi.fn(async () => { throw disposed }) })
    quiet.battery.die()
    await quiet.battery.charge()
  })
})
