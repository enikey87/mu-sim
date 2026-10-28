// Повтор загрузки пакета (#1477): три попытки с паузами 2 и 5 с, отметка в sessionStorage и финальная
// кнопка. Проверяется то, чего не видно в jsdom: план следующей попытки и что номер переживает перезагрузку,
// а не сбрасывается в 1 (тогда цикл).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attemptsDone, clearAttempts, MAIN_DELAYS_MS, markAttempt, nextAttempt, RETRY_KEY, retryLine } from './retry'

/** Хранилище как Storage: нужных методов хватает, DOM не требуется. */
const storage = (): Storage => {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
  } as Storage
}

afterEach(() => vi.unstubAllGlobals())

describe('повтор загрузки пакета при отказе сети', () => {
  it('план повторной попытки: две паузы 2 и 5 с, после третьей — кнопка', () => {
    expect(nextAttempt(1)).toEqual({ attempt: 2, delay: MAIN_DELAYS_MS[0] })
    expect(nextAttempt(2)).toEqual({ attempt: 3, delay: MAIN_DELAYS_MS[1] })
    expect(nextAttempt(3)).toBeNull()
  })

  it('строка повтора называет номер попытки из трёх', () => {
    expect(retryLine(2)).toBe('дозваниваемся… 2 из 3')
    expect(retryLine(3)).toBe('дозваниваемся… 3 из 3')
  })

  it('без отметки документ делает первую попытку', () => {
    expect(attemptsDone(storage())).toBe(1)
  })

  it('номер переживает перезагрузку: следующий документ знает, что он второй', () => {
    const store = storage()
    markAttempt(2, store)
    expect(store.getItem(RETRY_KEY)).toBe('2')
    expect(attemptsDone(store)).toBe(2)
    markAttempt(3, store)
    expect(attemptsDone(store)).toBe(3)
  })

  it('пакет доехал — серия снята, следующий визит снова с первой попытки', () => {
    const store = storage()
    markAttempt(3, store)
    clearAttempts(store)
    expect(attemptsDone(store)).toBe(1)
  })

  it('испорченная или чужая отметка не запускает цикл: только 2 и 3 — валидные документы', () => {
    const store = storage()
    for (const bad of ['0', '4', '99', 'два', '']) {
      store.setItem(RETRY_KEY, bad)
      expect(attemptsDone(store), bad).toBe(1)
    }
  })

  it('хранилище недоступно (приватный режим): первая попытка, отметка молчит, падений нет', () => {
    const denied = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    } as unknown as Storage
    expect(attemptsDone(denied)).toBe(1)
    expect(() => markAttempt(2, denied)).not.toThrow()
    expect(() => clearAttempts(denied)).not.toThrow()
  })
})
