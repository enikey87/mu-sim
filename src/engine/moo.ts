// Голосовые «му»: фраза — сохранённое описание, а не выбор при нажатии.
// Повтор, сохранение и загрузка проигрывают то же описание: ритм, высота и длительность
// не переизобретаются и не тратят RNG партии (#1419).
import type { MooContext } from './audio'

export type MooKind = 'alik' | 'feast'

/** Один слог «му» внутри фразы. */
export interface MooSyllable {
  /** Начало слога во фразе, с. */
  at: number
  /** Длительность гласной, с. */
  dur: number
  /** Высота в начале слога, Гц. */
  f0: number
  /** Множитель высоты к концу слога: < 1 — спад, > 1 — подъём. */
  bend: number
  /** Раскрытие формант на входе: 1 — «у», больше — открытее «о». */
  open: number
}

/** Всё, от чего зависит звук голосового, — данные сообщения, а не состояние звуковой системы. */
export interface MooPhrase {
  kind: MooKind
  syllables: readonly MooSyllable[]
  /** Частота вибрато, Гц. */
  vib: number
  /** Слышимое затухание после последнего слога, с. */
  tail: number
}

/** Узкий контракт источника звука: играть описание, знать его фактическую длительность, остановить. */
export interface MooSource {
  /** Длительность воспроизведения описания, с — с паузами и слышимым затуханием. */
  duration(p: MooPhrase): number
  /** Сыграть описание; начатая прежде фраза останавливается. */
  play(p: MooPhrase): void
  /** Остановить начатую фразу и все её запланированные части. */
  stop(): void
}

/** Усиление голосовых: выходной уровень не выше фонового «Мууу» на слух, но слышимо громче (#1419). */
export const MOO_VOICE_VOL = 1

const VIB_DEPTH = 0.022

interface Shape {
  /** Сколько слогов во фразе. */
  count: readonly [number, number]
  /** Базовая высота, Гц: застолье ниже и груднее. */
  f0: readonly [number, number]
  /** Длительность слога, с. */
  dur: readonly [number, number]
  /** Пауза между слогами, с. */
  gap: readonly [number, number]
  /** Насколько открытее «о» на входе слога. */
  open: readonly [number, number]
  vib: readonly [number, number]
  /** Слышимое затухание после последнего слога, с. */
  tail: number
}

const SHAPES: Record<MooKind, Shape> = {
  // личное голосовое: короткая фраза, выше и живее
  alik: { count: [2, 3], f0: [124, 146], dur: [0.32, 0.52], gap: [0.05, 0.11], open: [1, 1.08], vib: [5.2, 6], tail: 0.18 },
  // застолье: длиннее, ниже, шире формантный ход «мо→ууу»
  feast: { count: [3, 4], f0: [94, 110], dur: [0.45, 0.68], gap: [0.08, 0.15], open: [1.1, 1.22], vib: [4.2, 4.8], tail: 0.24 },
}

/** Закрепить новый вариант фразы. RNG тратится один раз, при создании сообщения. */
export function makeMooPhrase(kind: MooKind, rnd: () => number): MooPhrase {
  const sh = SHAPES[kind]
  const n = sh.count[0] + Math.floor(rnd() * (sh.count[1] - sh.count[0] + 1))
  const base = sh.f0[0] + rnd() * (sh.f0[1] - sh.f0[0])
  const syllables: MooSyllable[] = []
  let at = 0
  for (let i = 0; i < n; i++) {
    const last = i === n - 1
    const dur = sh.dur[0] + rnd() * (sh.dur[1] - sh.dur[0])
    // интонация разговора: слоги слегка ведут вверх, последний падает
    const f0 = base * (1 + (i - (n - 1) / 2) * 0.03) * (1 + (rnd() - 0.5) * 0.02)
    const bend = (last ? 0.86 : 1) + rnd() * 0.06
    const open = sh.open[0] + rnd() * (sh.open[1] - sh.open[0])
    syllables.push({ at, dur, f0, bend, open })
    at += dur + (last ? 0 : sh.gap[0] + rnd() * (sh.gap[1] - sh.gap[0]))
  }
  return { kind, syllables, vib: sh.vib[0] + rnd() * (sh.vib[1] - sh.vib[0]), tail: sh.tail }
}

/** Фактическая длительность описания: паузы между слогами и хвост затухания входят в неё. */
export function mooPhraseDuration(p: MooPhrase): number {
  const last = p.syllables[p.syllables.length - 1]
  return last ? last.at + last.dur + p.tail : 0
}

/**
 * Синтез фразы на графе Web Audio: два расстроенных sawtooth и треугольная субоктава
 * → форманты /о/→/у/, глиссандо которых читается как «мо-о-уу»
 * → контур тона, «м» на входе (закрытый lowpass, который раскрывается в гласную)
 * → вибрато, раскачивающееся к середине слога. Тот же рецепт, что у mu-en (#1419).
 * Возвращает начатые источники: по ним источник звука останавливает фразу.
 */
export function scheduleMooPhrase(c: MooContext, p: MooPhrase, t0: number, vol = MOO_VOICE_VOL): OscillatorNode[] {
  const started: OscillatorNode[] = []
  const n = p.syllables.length
  for (let i = 0; i < n; i++) {
    const s = p.syllables[i]
    const last = i === n - 1
    const t = t0 + s.at
    const end = t + s.dur
    const stopAt = end + (last ? p.tail : 0) + 0.02

    const bus = c.createGain()
    bus.gain.value = 1
    const oscs: OscillatorNode[] = []
    for (const [type, k, g] of [['sawtooth', 1, 0.55], ['sawtooth', 1.009, 0.3], ['triangle', 0.5, 0.5]] as const) {
      const o = c.createOscillator()
      o.type = type
      o.frequency.setValueAtTime(s.f0 * k, t)
      o.frequency.linearRampToValueAtTime(s.f0 * k * 1.04, t + s.dur * 0.45)
      o.frequency.linearRampToValueAtTime(s.f0 * k * s.bend, end)
      const g2 = c.createGain()
      g2.gain.value = g
      o.connect(g2).connect(bus)
      oscs.push(o)
    }

    // вибрато подключается к частоте, а не к громкости: голос «ведёт», как живой
    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = p.vib
    const depth = c.createGain()
    depth.gain.setValueAtTime(0, t)
    depth.gain.setValueAtTime(0, t + Math.min(0.22, s.dur * 0.4))
    depth.gain.linearRampToValueAtTime(s.f0 * VIB_DEPTH, t + Math.min(0.6, s.dur * 0.8))
    lfo.connect(depth)
    for (const o of oscs) depth.connect(o.frequency)

    // формантная пара /у/: вход открытее, к концу слога закрывается в «ууу»
    const f1 = c.createBiquadFilter()
    f1.type = 'bandpass'
    f1.Q.value = 5
    f1.frequency.setValueAtTime(480 * s.open, t)
    f1.frequency.linearRampToValueAtTime(330, t + Math.min(0.15, s.dur * 0.6))
    const f1g = c.createGain()
    f1g.gain.value = 1
    const f2 = c.createBiquadFilter()
    f2.type = 'bandpass'
    f2.Q.value = 7
    f2.frequency.setValueAtTime(1000 * s.open, t)
    f2.frequency.linearRampToValueAtTime(720, t + Math.min(0.25, s.dur * 0.75))
    const f2g = c.createGain()
    f2g.gain.value = 0.7
    const sum = c.createGain()
    sum.gain.value = 1
    bus.connect(f1).connect(f1g).connect(sum)
    bus.connect(f2).connect(f2g).connect(sum)

    // «м»: рот закрыт — фильтр задушен и раскрывается вместе с гласной
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 0.8
    lp.frequency.setValueAtTime(260, t)
    lp.frequency.linearRampToValueAtTime(5200, t + 0.05)
    const amp = c.createGain()
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(vol, t + 0.06)
    amp.gain.setValueAtTime(vol, Math.max(t + 0.08, end - 0.06))
    amp.gain.linearRampToValueAtTime(0, end + (last ? p.tail : 0))
    sum.connect(lp).connect(amp).connect(c.destination)

    for (const o of [lfo, ...oscs]) {
      o.start(t)
      o.stop(stopAt)
      started.push(o)
    }
  }
  return started
}

/**
 * Синтезатор — реальный источник MVP. Записи встанут на эту же границу:
 * сюжет и карточка работают с описанием, а не с реализацией звука.
 */
export function synthMooSource(context: () => MooContext, now: () => number, vol = MOO_VOICE_VOL): MooSource {
  let voices: OscillatorNode[] = []
  const stop = (): void => {
    for (const o of voices) {
      try { o.stop() } catch { /* источник уже остановлен */ }
    }
    voices = []
  }
  return {
    duration: mooPhraseDuration,
    play(p) {
      stop()
      voices = scheduleMooPhrase(context(), p, now() + 0.03, vol)
    },
    stop,
  }
}
