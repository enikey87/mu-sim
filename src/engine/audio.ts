// Звук и вибрация. Браузер блокирует их до первого касания — поэтому unlock() вызывается по жесту.
import { FEAST } from '../content/misc'
import { VOICE } from '../content/life'
import type { WallTimer } from './clock'

export interface Audio {
  unlock(): void
  setMuted(m: boolean): void
  beep(): void
  moo(): void
  speak(text: string, opts?: { pitch?: number; rate?: number; volume?: number }): void
  feast(pick: (arr: readonly string[]) => string): void
  alikVoice(pick: (arr: readonly string[]) => string): void
  vibrate(pattern: number | number[]): void
  /** Остановить речь и отложенные колбэки (после dispose игры). */
  dispose(): void
}

export const silentAudio: Audio = {
  unlock() {}, setMuted() {}, beep() {}, moo() {}, speak() {}, feast() {}, alikVoice() {}, vibrate() {}, dispose() {},
}

export function browserAudio(): Audio {
  let ac: AudioContext | null = null
  let gestured = false
  let muted = false
  let disposed = false
  const pending = new Set<WallTimer>()
  const ctx = (): AudioContext => {
    if (!gestured) throw new Error('no gesture')
    return (ac ??= new AudioContext())
  }
  const safe = (fn: () => void) => {
    if (muted || disposed) return
    try { fn() } catch { /* до первого касания или без Web Audio */ }
  }
  const trackTimeout = (fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => {
      pending.delete(id)
      if (!disposed) fn()
    }, ms) as WallTimer
    pending.add(id)
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
  const api: Audio = {
    unlock() {
      if (disposed || gestured) return
      gestured = true
      try { ctx().resume() } catch { /* ignore */ }
    },
    setMuted(m) {
      muted = m
      if (m) try { speechSynthesis.cancel() } catch { /* ignore */ }
    },
    dispose() {
      disposed = true
      muted = true
      for (const id of pending) window.clearTimeout(id)
      pending.clear()
      try { speechSynthesis.cancel() } catch { /* ignore */ }
    },
    beep: () => safe(() => { tone(1320, 0.1, 0.15); tone(1320, 0.1, 0.15, 'sine', 0.12) }),
    moo() {
      safe(() => cow(0.25))
      api.speak('М' + 'у'.repeat(5 + Math.floor(Math.random() * 6)), { pitch: 0.1, rate: 0.55, volume: 0.35 })
    },
    speak(text, { pitch = 1, rate = 1, volume = 0.5 } = {}) {
      if (muted || disposed || !gestured) return
      try {
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'ru-RU'; u.pitch = pitch; u.rate = rate; u.volume = volume
        speechSynthesis.speak(u)
      } catch { /* нет синтеза речи */ }
    },
    feast: (pick) => api.speak(pick(FEAST), { rate: 1.2 }),
    alikVoice(pick) {
      if (disposed) return
      api.speak(pick(VOICE), { pitch: 0.55, rate: 0.8, volume: 0.6 })
      if (Math.random() < 0.3) trackTimeout(() => api.moo(), 2500)
    },
    vibrate(p) {
      if (muted || disposed || !gestured) return
      try { navigator.vibrate?.(p) } catch { /* ignore */ }
    },
  }
  return api
}
