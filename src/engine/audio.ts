// Звук и вибрация. Браузер блокирует их до первого касания — поэтому unlock() вызывается по жесту.
import { mooPhraseDuration, synthMooSource, type MooSource } from './moo'

export interface Audio {
  unlock(): void
  setMuted(m: boolean): void
  beep(): void
  moo(): void
  /** Голосовое «му»: звук задан описанием сообщения, а не выбирается при нажатии (#1419). */
  voice: MooSource
  vibrate(pattern: number | number[]): void
  /** Остановить звук и отложенные колбэки (после dispose игры). */
  dispose(): void
}

export const silentAudio: Audio = {
  unlock() {}, setMuted() {}, beep() {}, moo() {},
  voice: { duration: mooPhraseDuration, play() {}, stop() {} },
  vibrate() {}, dispose() {},
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

export function browserAudio(voiceSource?: MooSource): Audio {
  let ac: AudioContext | null = null
  // жест — свойство страницы, а не экземпляра: звук не должен молчать в интро после «Начать заново»
  let gestured = everGestured
  let muted = false
  let disposed = false
  const ctx = (): AudioContext => {
    if (!gestured) throw new Error('no gesture')
    return (ac ??= new AudioContext())
  }
  const source = voiceSource ?? synthMooSource(ctx, () => ctx().currentTime)
  // источник не знает про жест и mute игры: их держит аудиосистема, а не звук (#1419)
  const voice: MooSource = {
    duration: (p) => source.duration(p),
    play(p) {
      if (muted || disposed || !gestured) return
      try { source.play(p) } catch { /* нет Web Audio */ }
    },
    stop() {
      try { source.stop() } catch { /* звука ещё не было */ }
    },
  }
  const safe = (fn: () => void) => {
    if (muted || disposed) return
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
  const api: Audio = {
    unlock() {
      if (disposed || gestured) return
      gestured = true
      everGestured = true
      try { ctx().resume() } catch { /* ignore */ }
    },
    setMuted(m) {
      muted = m
      if (m) voice.stop()
    },
    dispose() {
      disposed = true
      muted = true
      voice.stop()
    },
    beep: () => safe(() => { tone(1320, 0.1, 0.15); tone(1320, 0.1, 0.15, 'sine', 0.12) }),
    // синтеза речи в игре нет: голос браузера звучит по-разному на устройствах, а ориентир — без него (#161/#1420)
    moo: () => safe(() => { const c = ctx(); mooVoice(c, c.currentTime, MOO_VOL, Math.random) }),
    voice,
    vibrate(p) {
      if (muted || disposed || !gestured) return
      try { navigator.vibrate?.(p) } catch { /* ignore */ }
    },
  }
  return api
}
