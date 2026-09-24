import { describe, it, expect, vi, afterEach } from 'vitest'
import { browserAudio } from './audio'

describe('browserAudio.dispose', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('отменяет delayed moo и вызывает speechSynthesis.cancel', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const speak = vi.fn()
    vi.stubGlobal('speechSynthesis', { speak, cancel })
    vi.stubGlobal('AudioContext', class {
      currentTime = 0
      resume() { return Promise.resolve() }
      createOscillator() {
        return {
          frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
          type: 'sine',
          connect() { return this },
          start() {},
          stop() {},
        }
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() { return this },
        }
      }
      createBiquadFilter() {
        return {
          type: 'bandpass',
          frequency: { value: 0 },
          Q: { value: 0 },
          connect() { return this },
        }
      }
      get destination() { return {} }
    })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      lang = ''
      pitch = 1
      rate = 1
      volume = 1
      constructor(public text: string) {}
    })
    vi.spyOn(Math, 'random').mockReturnValue(0) // < 0.3 → delayed moo

    const audio = browserAudio()
    audio.unlock()
    audio.alikVoice(() => 'тест')
    expect(speak).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    audio.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(cancel).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.getTimerCount()).toBe(0)
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

  it('один путь синтеза: один осциллятор через lowpass, речи нет, громкость не выше прежней', () => {
    const { heard, speak } = stubAudio()
    const audio = browserAudio()
    audio.unlock()
    audio.moo()
    expect(heard.osc).toHaveLength(1) // было два осциллятора плюс голос браузера
    expect(heard.osc[0].type).toBe('sawtooth')
    expect(heard.osc[0].from).toBeGreaterThan(110) // ориентир 120 Гц
    expect(heard.osc[0].to).toBeLessThan(heard.osc[0].from) // частота идёт вниз
    expect(heard.filters).toEqual([{ type: 'lowpass', freq: 700 }])
    expect(Math.max(...heard.gains)).toBeLessThanOrEqual(0.25) // прежняя громкость cow(0.25)
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

  it('голосовые по-прежнему говорят: убрали синтез только у «Мууу»', () => {
    const { speak } = stubAudio()
    const audio = browserAudio()
    audio.unlock()
    audio.alikVoice(() => 'тест')
    expect(speak).toHaveBeenCalled()
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
