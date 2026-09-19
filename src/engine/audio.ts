// Звук и вибрация. Браузер блокирует их до первого касания — поэтому unlock() вызывается по жесту.
import { FEAST } from '../content/misc'
import { VOICE } from '../content/life'
import type { Period } from './time'

export interface Audio {
  unlock(): void
  setMuted(m: boolean): void
  beep(): void
  moo(): void
  speak(text: string, opts?: { pitch?: number; rate?: number; volume?: number }): void
  feast(pick: (arr: readonly string[]) => string): void
  alikVoice(pick: (arr: readonly string[]) => string): void
  vibrate(pattern: number | number[]): void
  ambient(period: Period): void
}

export const silentAudio: Audio = {
  unlock() {}, setMuted() {}, beep() {}, moo() {}, speak() {}, feast() {}, alikVoice() {}, vibrate() {}, ambient() {},
}

const DUDUK = [293.66, 311.13, 369.99, 392, 440, 466.16]

export function browserAudio(): Audio {
  let ac: AudioContext | null = null
  let gestured = false
  let muted = false
  const ctx = (): AudioContext => {
    if (!gestured) throw new Error('no gesture')
    return (ac ??= new AudioContext())
  }
  const safe = (fn: () => void) => {
    if (muted) return
    try { fn() } catch { /* до первого касания или без Web Audio */ }
  }

  function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', at = 0) {
    const c = ctx(), t = c.currentTime + at
    const o = c.createOscillator(), g = c.createGain()
    o.frequency.value = freq; o.type = type
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02)
  }
  function cow(vol: number) {
    const c = ctx(), t = c.currentTime, dur = 1.4 + Math.random() * 1.2
    const out = c.createGain()
    out.gain.setValueAtTime(0.0001, t)
    out.gain.exponentialRampToValueAtTime(vol, t + 0.25)
    out.gain.setValueAtTime(vol, t + dur - 0.4)
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    out.connect(c.destination)
    const f0 = 95 + Math.random() * 30
    for (const k of [1, 1.005]) {
      const o = c.createOscillator(); o.type = 'sawtooth'
      o.frequency.setValueAtTime(f0 * k, t)
      o.frequency.linearRampToValueAtTime(f0 * 1.25 * k, t + dur * 0.35)
      o.frequency.linearRampToValueAtTime(f0 * 0.8 * k, t + dur)
      for (const [freq, q] of [[320, 4], [800, 6]]) {
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q
        o.connect(f).connect(out)
      }
      o.start(t); o.stop(t + dur)
    }
  }
  function noiseHit(c: AudioContext, at: number) {
    const t = c.currentTime + at, len = 0.06
    const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800; g.gain.value = 0.05
    src.connect(f).connect(g).connect(c.destination); src.start(t)
  }
  function duduk() {
    const c = ctx(); let t = c.currentTime
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const dur = 0.6 + Math.random() * 0.9, f0 = DUDUK[Math.floor(Math.random() * DUDUK.length)]
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain()
      o.type = 'sawtooth'; o.frequency.value = f0; lfo.frequency.value = 5; lg.gain.value = 4
      lfo.connect(lg).connect(o.frequency)
      lp.type = 'lowpass'; lp.frequency.value = 1100
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.15)
      g.gain.setValueAtTime(0.035, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(lp).connect(g).connect(c.destination)
      o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur)
      t += dur
    }
  }

  const api: Audio = {
    unlock() {
      if (gestured) return
      gestured = true
      try { ctx().resume() } catch { /* ignore */ }
    },
    setMuted(m) {
      muted = m
      if (m) try { speechSynthesis.cancel() } catch { /* ignore */ }
    },
    beep: () => safe(() => { tone(1320, 0.1, 0.15); tone(1320, 0.1, 0.15, 'sine', 0.12) }),
    moo() {
      safe(() => cow(0.25))
      api.speak('М' + 'у'.repeat(5 + Math.floor(Math.random() * 6)), { pitch: 0.1, rate: 0.55, volume: 0.35 })
    },
    speak(text, { pitch = 1, rate = 1, volume = 0.5 } = {}) {
      if (muted || !gestured) return
      try {
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'ru-RU'; u.pitch = pitch; u.rate = rate; u.volume = volume
        speechSynthesis.speak(u)
      } catch { /* нет синтеза речи */ }
    },
    feast: (pick) => api.speak(pick(FEAST), { rate: 1.2 }),
    alikVoice(pick) {
      api.speak(pick(VOICE), { pitch: 0.55, rate: 0.8, volume: 0.6 })
      if (Math.random() < 0.3) setTimeout(() => api.moo(), 2500)
    },
    vibrate(p) {
      if (muted || !gestured) return
      try { navigator.vibrate?.(p) } catch { /* ignore */ }
    },
    // фон: днём стройка, вечером дудук, ночью сверчки
    ambient: (p) => safe(() => {
      if (p === 'night') { if (Math.random() < 0.25) for (let i = 0; i < 6; i++) tone(4200 + Math.random() * 300, 0.04, 0.012, 'sine', i * 0.09) }
      else if (p === 'evening' || p === 'friday') { if (Math.random() < 0.12) duduk() }
      else if (Math.random() < 0.15) { const c = ctx(); for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) noiseHit(c, i * 0.35) }
    }),
  }
  return api
}
