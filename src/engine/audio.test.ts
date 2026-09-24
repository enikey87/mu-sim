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
