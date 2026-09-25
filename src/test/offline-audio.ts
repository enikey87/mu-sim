// Офлайн-рендер графа Web Audio для тестов: node не умеет Web Audio, а громкость надо мерить по сигналу,
// а не по уставкам (#282). Только то, что строит «Мууу»: пила, биквад по формулам спеки, усиление, автоматизация.
import type { MooContext } from '../engine/audio'

type Ev = { kind: 'set' | 'lin' | 'exp'; t: number; v: number }

class Param {
  private evs: Ev[] = []
  constructor(public value: number) {}
  setValueAtTime(v: number, t: number) { this.evs.push({ kind: 'set', t, v }); return this }
  linearRampToValueAtTime(v: number, t: number) { this.evs.push({ kind: 'lin', t, v }); return this }
  exponentialRampToValueAtTime(v: number, t: number) { this.evs.push({ kind: 'exp', t, v }); return this }
  at(time: number): number {
    let prev: { t: number; v: number } | null = null
    for (const e of this.evs) {
      if (e.t <= time) { prev = e; continue }
      if (e.kind === 'set') break
      const from = prev ?? { t: 0, v: this.value }
      const k = (time - from.t) / (e.t - from.t)
      return e.kind === 'lin' ? from.v + (e.v - from.v) * k : from.v * Math.pow(e.v / from.v, k)
    }
    return prev ? prev.v : this.value
  }
}

abstract class Node {
  inputs: Node[] = []
  private memo = -1
  private last = 0
  connect<T extends Node>(n: T): T { n.inputs.push(this); return n }
  input(i: number, time: number): number { let s = 0; for (const n of this.inputs) s += n.out(i, time); return s }
  out(i: number, time: number): number {
    if (this.memo !== i) { this.last = this.process(i, time); this.memo = i }
    return this.last
  }
  abstract process(i: number, time: number): number
}

class Osc extends Node {
  type = 'sine'
  frequency = new Param(440)
  private phase = 0
  private from = Infinity
  private to = Infinity
  constructor(private rate: number) { super() }
  start(t: number) { this.from = t }
  stop(t: number) { this.to = t }
  process(_: number, time: number): number {
    if (time < this.from || time >= this.to) return 0
    const dt = this.frequency.at(time) / this.rate
    const p = this.phase
    this.phase = (p + dt) % 1
    if (this.type !== 'sawtooth') return Math.sin(2 * Math.PI * p)
    // пила с polyBLEP — ограниченная по полосе, как волновая таблица браузера
    let y = 2 * p - 1
    if (p < dt) { const x = p / dt; y -= x + x - x * x - 1 } else if (p > 1 - dt) { const x = (p - 1) / dt; y -= x * x + x + x + 1 }
    return y
  }
}

class Biquad extends Node {
  type = 'lowpass'
  frequency = new Param(350)
  Q = new Param(1)
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0
  constructor(private rate: number) { super() }
  process(i: number, time: number): number {
    const w = 2 * Math.PI * this.frequency.at(time) / this.rate
    const cos = Math.cos(w), sin = Math.sin(w)
    const q = this.Q.at(time)
    let b0: number, b1: number, b2: number, alpha: number
    if (this.type === 'lowpass') {
      alpha = sin / (2 * Math.pow(10, q / 20)) // у lowpass Q в децибелах (спека Web Audio)
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0
    } else {
      alpha = sin / (2 * q)
      b0 = alpha; b1 = 0; b2 = -alpha
    }
    const a0 = 1 + alpha
    const a1 = -2 * cos, a2 = 1 - alpha
    const x = this.input(i, time)
    const y = (b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2) / a0
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y
    return y
  }
}

class Gain extends Node {
  gain = new Param(1)
  process(i: number, time: number): number { return this.input(i, time) * this.gain.at(time) }
}

class Sum extends Node {
  process(i: number, time: number): number { return this.input(i, time) }
}

/** Отрендерить то, что `build` подключит к destination, за `seconds` при частоте `rate`. */
export function renderOffline(build: (c: MooContext) => void, seconds: number, rate = 48000): Float32Array {
  const destination = new Sum()
  const c = {
    destination,
    createOscillator: () => new Osc(rate),
    createBiquadFilter: () => new Biquad(rate),
    createGain: () => new Gain(),
  }
  build(c as unknown as MooContext)
  const out = new Float32Array(Math.ceil(seconds * rate))
  for (let i = 0; i < out.length; i++) out[i] = destination.out(i, i / rate)
  return out
}

/** Пик и RMS по звучащей части (сэмплы до последнего ненулевого). */
export function level(x: Float32Array): { peak: number; rms: number } {
  let end = x.length
  while (end > 0 && Math.abs(x[end - 1]) < 1e-6) end--
  let peak = 0, sum = 0
  for (let i = 0; i < end; i++) { peak = Math.max(peak, Math.abs(x[i])); sum += x[i] * x[i] }
  return { peak, rms: Math.sqrt(sum / Math.max(1, end)) }
}
