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

let everGestured = false

/** Узлы Web Audio, которые строит «Мууу»: браузерный контекст или офлайн-рендер теста выходного уровня (#282). */
export type MooContext = Pick<BaseAudioContext, 'createOscillator' | 'createBiquadFilter' | 'createGain' | 'destination'>

/**
 * «Мууу»: один пилообразный осциллятор, частота вниз 120→95 Гц, lowpass 700 Гц — ориентир из макета интро (#161).
 * Разброс длины и высоты — чтобы не звучало одинаково.
 */
export function mooVoice(c: MooContext, t: number, vol: number, rnd: () => number): void {
  const dur = 1.6 + rnd() * 0.4
  const f0 = 114 + rnd() * 12
  const o = c.createOscillator(); o.type = 'sawtooth'
  o.frequency.setValueAtTime(f0, t)
  o.frequency.linearRampToValueAtTime(f0 * 95 / 120, t + dur)
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.25)
  g.gain.linearRampToValueAtTime(vol * 0.8, t + dur - 0.4)
  g.gain.linearRampToValueAtTime(0, t + dur)
  o.connect(f).connect(g).connect(c.destination)
  o.start(t); o.stop(t + dur + 0.02)
}
/** Усиление «Мууу»: выходной уровень не выше прежнего звука (офлайн-рендер, audio.test.ts, #282). */
export const MOO_VOL = 0.09

export function browserAudio(): Audio {
  let ac: AudioContext | null = null
  // жест — свойство страницы, а не экземпляра: звук не должен молчать в интро после «Начать заново»
  let gestured = everGestured
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
  const api: Audio = {
    unlock() {
      if (disposed || gestured) return
      gestured = true
      everGestured = true
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
    // синтеза речи поверх нет: голос браузера звучит по-разному на устройствах, а ориентир — без него (#161)
    moo: () => safe(() => { const c = ctx(); mooVoice(c, c.currentTime, MOO_VOL, Math.random) }),
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
