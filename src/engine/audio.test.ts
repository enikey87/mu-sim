import { describe, it, expect, vi, afterEach } from 'vitest'
import { browserAudio, mooVoice, MOO_VOL, type MooContext } from './audio'
import { makeMooPhrase, mooPhraseDuration, type MooKind, type MooPhrase, type MooSource } from './moo'
import { seededRng } from './rng'
import { renderOffline, level } from '../test/offline-audio'

const phraseOf = (kind: MooKind): MooPhrase => {
  const rng = seededRng(1)
  return makeMooPhrase(kind, () => rng.random())
}

// #1420: браузерной речи в звуке игры больше нет — ни на голосовых, ни на застолье, ни в отложенных частях.
describe('браузерная речь снята со всех путей (#1420)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('исходники звука не упоминают синтез речи', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dirs = ['src']
    const hits: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) await walk(p)
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.tsx')) {
          const src = await fs.readFile(p, 'utf8')
          if (/speechSynthesis|SpeechSynthesisUtterance/.test(src)) hits.push(p)
        }
      }
    }
    for (const d of dirs) await walk(d)
    expect(hits).toEqual([])
  })
})

// #161: «Мууу» — один путь синтеза, и он под теми же гейтами (жест, mute)
function stubAudio() {
  const heard = {
    osc: [] as { type: string; from: number; to: number }[],
    filters: [] as { type: string; freq: number }[],
    gains: [] as number[],
  }
  vi.stubGlobal('AudioContext', class {
    currentTime = 0
    resume() { return Promise.resolve() }
    createOscillator() {
      const rec = { type: 'sawtooth', from: 0, to: 0 }
      heard.osc.push(rec)
      return {
        frequency: {
          set value(v: number) { rec.from = v },
          get value() { return rec.from },
          setValueAtTime(v: number) { rec.from = v; rec.to = v },
          linearRampToValueAtTime(v: number) { rec.to = v },
        },
        set type(t: string) { rec.type = t },
        get type() { return rec.type },
        connect() { return this },
        start() {},
        stop() {},
      }
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime(v: number) { heard.gains.push(v) },
          exponentialRampToValueAtTime(v: number) { heard.gains.push(v) },
        },
        connect() { return this },
      }
    }
    createBiquadFilter() {
      const rec = { type: 'lowpass', freq: 0 }
      heard.filters.push(rec)
      return {
        set type(t: string) { rec.type = t },
        get type() { return rec.type },
        frequency: { set value(v: number) { rec.freq = v }, get value() { return rec.freq } },
        Q: { value: 0 },
        connect() { return this },
      }
    }
    get destination() { return {} }
  })
  const speak = vi.fn()
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() })
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    lang = ''; pitch = 1; rate = 1; volume = 1
    constructor(public text: string) {}
  })
  return { heard, speak }
}

describe('browserAudio.moo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('один путь синтеза: один осциллятор через lowpass, речи нет', () => {
    const { heard, speak } = stubAudio()
    const audio = browserAudio()
    audio.unlock()
    audio.moo()
    expect(heard.osc).toHaveLength(1) // было два осциллятора плюс голос браузера
    expect(heard.osc[0].type).toBe('sawtooth')
    expect(heard.osc[0].from).toBeGreaterThan(110) // ориентир 120 Гц
    expect(heard.osc[0].to).toBeLessThan(heard.osc[0].from) // частота идёт вниз
    expect(heard.filters).toEqual([{ type: 'lowpass', freq: 700 }])
    expect(speak).not.toHaveBeenCalled() // синтеза речи поверх «Мууу» больше нет
  })

  it('без касания не звучит', async () => {
    const { heard } = stubAudio()
    vi.resetModules() // жест — свойство страницы: свежий модуль и есть страница без касания
    const fresh = await import('./audio')
    fresh.browserAudio().moo()
    expect(heard.osc).toEqual([])
  })

  it('при выключенном звуке не звучит', () => {
    const { heard } = stubAudio()
    const audio = browserAudio()
    audio.unlock()
    audio.setMuted(true)
    audio.moo()
    expect(heard.osc).toEqual([])
  })

  it('голосовое звучит синтезом «му», а не речью браузера', () => {
    const { heard, speak } = stubAudio()
    const audio = browserAudio()
    audio.unlock()
    audio.voice.play(phraseOf('alik'))
    expect(heard.osc.length).toBeGreaterThan(0) // слоги «му» — Web Audio
    expect(speak).not.toHaveBeenCalled()
  })
})

describe('browserAudio.жест страницы', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('новый экземпляр после «Начать заново» играет звук: жест — свойство страницы, не экземпляра', () => {
    const made: string[] = []
    class FakeAC {
      currentTime = 0
      resume() { return Promise.resolve() }
      createOscillator() {
        made.push('osc')
        return {
          frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
          type: 'sawtooth', connect() { return this }, start() {}, stop() {},
        }
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return this } }
      }
      createBiquadFilter() {
        return { type: 'bandpass', frequency: { value: 0 }, Q: { value: 0 }, connect() { return this } }
      }
      get destination() { return {} }
    }
    vi.stubGlobal('AudioContext', FakeAC)
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      lang = ''; pitch = 1; rate = 1; volume = 1
      constructor(public text: string) {}
    })

    const first = browserAudio()
    first.unlock() // касание на странице было (кнопка «Начать заново»)
    const afterReset = browserAudio() // новая игра — новый экземпляр
    afterReset.moo() // «Мууу» интро не должно срезаться гейтом жеста
    expect(made.length).toBeGreaterThan(0)
  })
})

/** Прежний «Мууу» до #243 (`cow(0.25)` из c7aeff1^, без синтеза речи поверх) — эталон уровня для #282. */
function oldCow(c: MooContext, t: number, vol: number, rnd: () => number) {
  const dur = 1.4 + rnd() * 1.2
  const out = c.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(vol, t + 0.25)
  out.gain.setValueAtTime(vol, t + dur - 0.4)
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  out.connect(c.destination)
  const f0 = 95 + rnd() * 30
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

describe('«Мууу»: выходной уровень (#282)', () => {
  // разброс длины и высоты: крайние и средние значения генератора
  const R = [0, 0.25, 0.5, 0.75, 0.999]
  const at = (build: (c: MooContext, rnd: () => number) => void) => R.map((r) => level(renderOffline((c) => build(c, () => r), 3)))

  it('рендер откалиброван: синус, пила, lowpass и полоса дают расчётные уровни', () => {
    const tone = (type: OscillatorType, hz: number, filter?: [BiquadFilterType, number, number]) => level(renderOffline((c) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = hz
      const g = c.createGain(); g.gain.value = 0.5
      if (filter) {
        const f = c.createBiquadFilter(); f.type = filter[0]; f.frequency.value = filter[1]; f.Q.value = filter[2]
        o.connect(f).connect(g)
      } else o.connect(g)
      g.connect(c.destination)
      o.start(0); o.stop(1)
    }, 1))
    expect(tone('sine', 1000).peak).toBeCloseTo(0.5, 2)
    expect(tone('sine', 1000).rms).toBeCloseTo(0.5 / Math.SQRT2, 2)
    expect(tone('sawtooth', 110).rms).toBeCloseTo(0.5 / Math.sqrt(3), 2)
    expect(tone('sine', 5000, ['lowpass', 700, 1]).rms).toBeLessThan(0.5 / Math.SQRT2 / 30) // 12 дБ/окт: −33 дБ
    expect(tone('sine', 320, ['bandpass', 320, 4]).rms).toBeCloseTo(0.5 / Math.SQRT2, 2) // центр полосы — усиление 1
  })

  it('пик и RMS нового не выше самого тихого прежнего; звук не пропал', () => {
    const old = at((c, rnd) => oldCow(c, 0, 0.25, rnd))
    const now = at((c, rnd) => mooVoice(c, 0, MOO_VOL, rnd))
    const quietPeak = Math.min(...old.map((x) => x.peak)), quietRms = Math.min(...old.map((x) => x.rms))
    expect(Math.max(...now.map((x) => x.peak))).toBeLessThanOrEqual(quietPeak)
    expect(Math.max(...now.map((x) => x.rms))).toBeLessThanOrEqual(quietRms)
    // пустой рендер прошёл бы «не громче» — нижняя граница: слышно, а не тишина
    expect(Math.min(...now.map((x) => x.rms))).toBeGreaterThan(quietRms / 2)
  }, 60_000)

  it('в браузере «Мууу» звучит с тем же усилением, что измерено', () => {
    const { heard } = stubAudio()
    const audio = browserAudio()
    audio.unlock()
    audio.moo()
    expect(Math.max(...heard.gains)).toBe(MOO_VOL)
  })

  // APK (docs/android.md): WebView без системного TTS — речи в звуке нет вовсе, партия идёт дальше
  it('WebView без синтеза речи: «Мууу» и голосовое играют, речи не требуется', () => {
    const { heard } = stubAudio()
    vi.stubGlobal('speechSynthesis', undefined) // ни движка, ни интерфейса: как в WebView без TTS
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    const audio = browserAudio()
    audio.unlock()
    audio.moo()
    expect(Math.max(...heard.gains)).toBe(MOO_VOL) // «Мууу» и SMS-писк — Web Audio
    expect(() => audio.voice.play(phraseOf('feast'))).not.toThrow()
    expect(heard.osc.length).toBeGreaterThan(1)
  })
})

/** Контекст голосовых: журнал осцилляторов и их start/stop — по нему видно, что звук остановлен. */
function voiceStub() {
  const oscs: { type: string; start: number[]; stop: (number | undefined)[] }[] = []
  vi.stubGlobal('AudioContext', class {
    currentTime = 10
    resume() { return Promise.resolve() }
    createOscillator() {
      const rec = { type: 'sine', start: [] as number[], stop: [] as (number | undefined)[] }
      oscs.push(rec)
      return {
        get type() { return rec.type },
        set type(t: string) { rec.type = t },
        frequency: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect<T>(target: T): T { return target },
        start(t: number) { rec.start.push(t) },
        stop(t?: number) { rec.stop.push(t) },
      }
    }
    createGain() {
      return {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect<T>(target: T): T { return target },
      }
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
        Q: { value: 0 },
        connect<T>(target: T): T { return target },
      }
    }
    get destination() { return {} }
  })
  const speak = vi.fn()
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() })
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    lang = ''; pitch = 1; rate = 1; volume = 1
    constructor(public text: string) {}
  })
  return { oscs, speak }
}

const stoppedNow = (o: { stop: (number | undefined)[] }) => o.stop.length > 0 && o.stop[o.stop.length - 1] === undefined

describe('browserAudio.voice: голосовые «му» (#1419)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('до касания звука нет', async () => {
    const { oscs, speak } = voiceStub()
    vi.resetModules() // жест — свойство страницы: свежий модуль и есть страница без касания
    const fresh = await import('./audio')
    fresh.browserAudio().voice.play(phraseOf('alik'))
    expect(oscs).toEqual([])
    expect(speak).not.toHaveBeenCalled()
  })

  it('mute останавливает начатые и запланированные слоги, включение их не воскрешает', () => {
    const { oscs, speak } = voiceStub()
    const audio = browserAudio()
    audio.unlock()
    const p = phraseOf('feast')
    audio.voice.play(p)
    expect(oscs.length).toBeGreaterThan(3) // несколько слогов и их вибрато запланированы сразу
    const afterPlay = oscs.length

    audio.setMuted(true)
    expect(oscs.every(stoppedNow)).toBe(true) // и звучащий слог, и будущие
    expect(speak).not.toHaveBeenCalled() // браузерная речь на этом пути не включалась

    audio.setMuted(false)
    expect(oscs.length).toBe(afterPlay) // старую фразу никто не перезапустил
    audio.voice.play(p)
    expect(oscs.length).toBeGreaterThan(afterPlay)
  })

  it('новая фраза останавливает прежнюю, dispose останавливает текущую', () => {
    const { oscs } = voiceStub()
    const audio = browserAudio()
    audio.unlock()
    audio.voice.play(phraseOf('alik'))
    const first = oscs.length
    audio.voice.play(phraseOf('feast'))
    expect(oscs.slice(0, first).every(stoppedNow)).toBe(true)
    audio.dispose()
    expect(oscs.every(stoppedNow)).toBe(true)
    const afterDispose = oscs.length
    audio.voice.play(phraseOf('alik'))
    expect(oscs.length).toBe(afterDispose)
  })

  it('без Web Audio игра не падает и не возвращает браузерную речь', () => {
    const { oscs, speak } = voiceStub()
    vi.stubGlobal('AudioContext', undefined)
    const audio = browserAudio()
    audio.unlock()
    expect(() => audio.voice.play(phraseOf('alik'))).not.toThrow()
    expect(oscs).toEqual([])
    expect(speak).not.toHaveBeenCalled()
  })

  it('источник звука подменяется на том же контракте, жест гейтит и его', async () => {
    const played: MooPhrase[] = []
    let stops = 0
    const fake: MooSource = { duration: () => 7, play: (p) => { played.push(p) }, stop: () => { stops++ } }
    vi.resetModules() // свежая страница без касания: гейт жеста принадлежит модулю
    const fresh = await import('./audio')
    const audio = fresh.browserAudio(fake)
    const p = phraseOf('alik')
    audio.voice.play(p)
    expect(played).toEqual([])
    audio.unlock()
    audio.voice.play(p)
    expect(played).toEqual([p])
    expect(audio.voice.duration(p)).toBe(7)
    audio.setMuted(true)
    expect(stops).toBe(1)
    audio.setMuted(false)
    expect(played).toHaveLength(1)
    audio.voice.play(p)
    expect(played).toHaveLength(2)
    audio.dispose()
    expect(stops).toBe(2)
  })

  it('длительность карточки — длительность описания', () => {
    voiceStub()
    const audio = browserAudio()
    const p = phraseOf('alik')
    expect(audio.voice.duration(p)).toBeCloseTo(mooPhraseDuration(p), 10)
  })
})
