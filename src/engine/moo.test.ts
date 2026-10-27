import { describe, it, expect } from 'vitest'
import {
  makeMooPhrase, mooPhraseDuration, scheduleMooPhrase, synthMooSource, MOO_VOICE_VOL,
  type MooKind, type MooPhrase,
} from './moo'
import type { MooContext } from './audio'
import { seededRng } from './rng'
import { level, renderOffline } from '../test/offline-audio'

const phraseOf = (kind: MooKind, seed: number): MooPhrase => {
  const rng = seededRng(seed)
  return makeMooPhrase(kind, () => rng.random())
}

/** Конец слышимой части: последний сэмпл громче порога. */
function audibleEnd(x: Float32Array, rate = 48000): number {
  let end = x.length
  while (end > 0 && Math.abs(x[end - 1]) < 1e-3) end--
  return end / rate
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

describe('описание фразы «му»', () => {
  it('закрепляется один раз: тот же seed — та же фраза, другой — другой', () => {
    expect(phraseOf('alik', 7)).toEqual(phraseOf('alik', 7))
    expect(phraseOf('alik', 7)).not.toEqual(phraseOf('alik', 8))
  })

  it('личное и застольное различимы по описанию: слоги, высота, длительность', () => {
    const alik = Array.from({ length: 40 }, (_, i) => phraseOf('alik', i + 1))
    const feast = Array.from({ length: 40 }, (_, i) => phraseOf('feast', i + 1))
    expect(mean(alik.map((p) => p.syllables.length))).toBeGreaterThanOrEqual(2)
    expect(mean(alik.map((p) => p.syllables.length))).toBeLessThanOrEqual(3)
    expect(mean(feast.map((p) => p.syllables.length))).toBeGreaterThanOrEqual(3)
    expect(mean(feast.map((p) => p.syllables.length))).toBeLessThanOrEqual(4)
    // независимые ожидаемые значения — диапазоны голосов из макета, не вывод из кода
    const f0 = (p: MooPhrase) => mean(p.syllables.map((s) => s.f0))
    expect(mean(alik.map(f0))).toBeGreaterThan(124)
    expect(mean(alik.map(f0))).toBeLessThan(146)
    expect(mean(feast.map(f0))).toBeGreaterThan(94)
    expect(mean(feast.map(f0))).toBeLessThan(110)
    // застолье ниже личного и заметно длиннее — их не спутать на слух
    expect(mean(feast.map(f0))).toBeLessThan(mean(alik.map(f0)) - 20)
    expect(mean(feast.map(mooPhraseDuration))).toBeGreaterThan(mean(alik.map(mooPhraseDuration)) + 0.6)
  })

  it('длительность — сумма пауз и слышимого затухания, а не выдуманное число', () => {
    const p = phraseOf('feast', 3)
    const last = p.syllables[p.syllables.length - 1]
    expect(mooPhraseDuration(p)).toBeCloseTo(last.at + last.dur + p.tail, 10)
    // паузы входят: длительность больше суммы слогов без хвоста
    const voiced = p.syllables.reduce((sum, s) => sum + s.dur, 0)
    expect(mooPhraseDuration(p) - p.tail).toBeGreaterThan(voiced)
  })
})

describe('синтез фразы «му»', () => {
  for (const kind of ['alik', 'feast'] as const) {
    it(`${kind}: реальный офлайн-рендер даёт непустой сигнал без клиппинга`, () => {
      const p = phraseOf(kind, 5)
      const dur = mooPhraseDuration(p)
      const x = renderOffline((c) => { scheduleMooPhrase(c, p, 0, MOO_VOICE_VOL) }, dur + 0.3)
      const lv = level(x)
      expect(lv.rms).toBeGreaterThan(0.02) // голос слышен, а не пустой рендер
      expect(lv.peak).toBeLessThan(0.6) // без клиппинга: пик ниже полной шкалы
    })

    it(`${kind}: слышимый конец совпадает с заявленной длительностью`, () => {
      const p = phraseOf(kind, 11)
      const dur = mooPhraseDuration(p)
      const x = renderOffline((c) => { scheduleMooPhrase(c, p, 0, MOO_VOICE_VOL) }, dur + 0.3)
      const end = audibleEnd(x)
      expect(end).toBeLessThanOrEqual(dur + 0.001)
      expect(end).toBeGreaterThan(dur - 0.05)
    })
  }

  it('повторное проигрывание того же описания даёт тот же сигнал: RNG не тратится', () => {
    const p = phraseOf('alik', 13)
    const render = () => renderOffline((c) => { scheduleMooPhrase(c, p, 0, MOO_VOICE_VOL) }, mooPhraseDuration(p) + 0.2)
    const a = render(), b = render()
    expect(a.length).toBe(b.length)
    let diff = 0
    for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]))
    expect(diff).toBe(0)
  })

  it('расписание не выходит за длительность и заканчивается её хвостом', () => {
    const p = phraseOf('feast', 2)
    const dur = mooPhraseDuration(p)
    const log = recordingContext()
    const t0 = 4
    scheduleMooPhrase(log.c, p, t0, MOO_VOICE_VOL)
    expect(log.osc.length).toBeGreaterThan(0)
    for (const o of log.osc) {
      for (const [, t] of o.freq) expect(t).toBeGreaterThanOrEqual(t0)
      for (const [, t] of o.freq) expect(t).toBeLessThanOrEqual(t0 + dur + 0.001)
      expect(o.stop).toBeGreaterThanOrEqual(t0)
      expect(o.stop).toBeLessThanOrEqual(t0 + dur + 0.03)
    }
    // последний запланированный звук — хвост затухания, а не обрыв на последнем слоге
    expect(Math.max(...log.osc.map((o) => o.stop))).toBeCloseTo(t0 + dur + 0.02, 6)
  })

  it('источник подменяет звук на том же контракте: играет описание и умеет остановиться', () => {
    const log = recordingContext()
    const source = synthMooSource(() => log.c, () => 1)
    const p = phraseOf('alik', 4)
    source.play(p)
    expect(source.duration(p)).toBeCloseTo(mooPhraseDuration(p), 10)
    expect(log.osc.length).toBeGreaterThan(0)
    expect(log.osc[0].start).toBeCloseTo(1.03, 6) // запас на планирование
    const stops = log.osc.map((o) => o.stop)
    expect(stops.every((t) => t > 1.03)).toBe(true)
    // новая фраза останавливает прежнюю, а не играет поверх
    const second = phraseOf('feast', 6)
    source.play(second)
    expect(log.immediateStops()).toBeGreaterThan(0)
    source.stop()
    expect(log.osc.every((o) => o.immediateStop)).toBe(true)
  })
})

/** Записывающий контекст: те же узлы, что у Web Audio, но с журналом расписания. */
function recordingContext() {
  const osc: { start: number; stop: number; immediateStop: boolean; freq: [number, number][] }[] = []
  const node = <T>(target: T): T => target
  const c = {
    destination: {},
    createOscillator() {
      const rec = { start: Infinity, stop: 0, immediateStop: false, freq: [] as [number, number][] }
      osc.push(rec)
      return {
        type: 'sine',
        frequency: {
          value: 0,
          setValueAtTime(v: number, t: number) { rec.freq.push([v, t]) },
          linearRampToValueAtTime(v: number, t: number) { rec.freq.push([v, t]) },
        },
        connect<T>(target: T): T { return node(target) },
        start(t: number) { rec.start = t },
        stop(t?: number) {
          if (t === undefined) rec.immediateStop = true
          else rec.stop = t
        },
      }
    },
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect<T>(target: T): T { return node(target) },
      }
    },
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        Q: { value: 0 },
        connect<T>(target: T): T { return node(target) },
      }
    },
  }
  return { c: c as unknown as MooContext, osc, immediateStops: () => osc.filter((o) => o.immediateStop).length }
}
