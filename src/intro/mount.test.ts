// @vitest-environment jsdom
// Один замок на всю загрузку (#1522): титры дорабатывают узел #lock-screen из index.html, а когда узла нет
// (перезапуск «Начать заново» внутри приложения) — создают его сами теми же классами. Здесь проверяется
// склейка: тот же узел, часы, низ замка, гейт первого касания и удержание титула до готовности чата.
// Что это видно в браузере — tests/e2e/intro-shell.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEAVE_MS, mountIntro, type IntroOptions } from './mount'
import { LINE_MS, TITLE_MS } from './cards'

/** Разметка замка как в index.html: часы, низ с уровнем и строкой отказа. */
const LOCK = `<div id="intro-frame"><div id="lock-screen" class="intro">
  <div class="intro-clock"><div class="intro-date">18 марта 2026 г.</div><div class="intro-time">--:--</div></div>
  <div class="intro-foot"><div class="lvl" aria-hidden="true"><span class="spr"></span></div><div class="fl">Алик не дозвонился.</div><button type="button" id="boot-again" hidden>Попробовать снова</button></div>
</div></div>`

const opts = (o: Partial<IntroOptions> = {}): IntroOptions => ({
  lines: ['строка 1', 'строка 2', 'строка 3', 'строка 4'],
  date: '18 марта 2026 г.',
  clock: '09:41',
  gate: false,
  onMoo: vi.fn(),
  onFinish: vi.fn(),
  onGone: vi.fn(),
  ...o,
})

const frame = (html = LOCK): HTMLElement => {
  document.body.innerHTML = html
  return document.querySelector<HTMLElement>('#intro-frame')!
}

const lock = (): HTMLElement | null => document.querySelector<HTMLElement>('#lock-screen')

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('замок и титры — один экран', () => {
  it('титры дорабатывают замок из разметки, а не строят второй', () => {
    const parent = frame()
    const born = lock()!
    mountIntro(parent, opts())

    expect(lock()).toBe(born)
    expect(document.querySelectorAll('.intro')).toHaveLength(1)
    expect(document.querySelectorAll('.intro-foot')).toHaveLength(1)
    // часы замка называют дату партии и время переписки
    expect(born.querySelector('.intro-date')!.textContent).toBe('18 марта 2026 г.')
    expect(born.querySelector('.intro-time')!.textContent).toBe('09:41')
  })

  it('классы шелла не стираются: booting и уровень остаются на месте', () => {
    const parent = frame()
    const born = lock()!
    born.classList.add('booting')
    mountIntro(parent, opts())
    expect(born.classList.contains('booting')).toBe(true)
    expect(born.querySelector('.lvl')).not.toBeNull()
  })

  it('без узла в разметке (перезапуск «Начать заново») замок создаётся сам теми же классами', () => {
    document.body.innerHTML = '<div id="host"></div>'
    mountIntro(document.getElementById('host')!, opts({ date: 'день 0' }))
    const born = lock()!
    expect(born.className).toContain('intro')
    expect(born.closest('#host')).not.toBeNull()
    expect(born.querySelector('.intro-clock')!.textContent).toContain('день 0')
    expect(born.querySelector('.intro-foot')).not.toBeNull()
  })

  it('гейт: до касания титр нет, подсказка стоит в низу замка', () => {
    const parent = frame()
    const o = opts({ gate: true, onStart: vi.fn() })
    mountIntro(parent, o)
    const hint = document.querySelector<HTMLElement>('.intro-hint')!
    expect(hint.textContent).toBe('Коснитесь, чтобы начать')
    expect(hint.parentElement!.className).toBe('intro-foot')
    expect(document.querySelector('.intro-line')).toBeNull()
    expect(o.onStart).not.toHaveBeenCalled()

    lock()!.click()
    expect(document.querySelector('.intro-hint')).toBeNull()
    expect(document.querySelector('.intro-line.on')).not.toBeNull()
    expect(o.onStart).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(LINE_MS)
    expect(document.querySelector('.intro-line.on')!.textContent).toBe('строка 2')
  })

  it('hold: титры кончились — титул держится, уезд ждёт leave()', () => {
    const parent = frame()
    const o = opts({ gate: true, hold: true })
    const intro = mountIntro(parent, o)
    lock()!.click()
    vi.advanceTimersByTime(LINE_MS * 4 + TITLE_MS)

    expect(o.onFinish).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.intro-title.on')).not.toBeNull()
    expect(document.querySelector('.intro-line')).toBeNull()
    expect(lock()).not.toBeNull()
    expect(o.onGone).not.toHaveBeenCalled()

    vi.advanceTimersByTime(LEAVE_MS)
    expect(o.onGone).not.toHaveBeenCalled()
    intro.leave()
    expect(lock()!.classList.contains('intro-leave')).toBe(true)
    vi.advanceTimersByTime(LEAVE_MS)
    expect(lock()).toBeNull()
    expect(o.onGone).toHaveBeenCalledTimes(1)
  })

  it('hold: касание на титрах пропускает к титулу и ждёт пакет', () => {
    const parent = frame()
    const o = opts({ gate: true, hold: true, onStart: vi.fn() })
    mountIntro(parent, o)
    lock()!.click() // касание снимает гейт
    vi.advanceTimersByTime(100)
    lock()!.click() // второе — пропуск карточек

    expect(o.onFinish).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.intro-title.on')).not.toBeNull()
    expect(lock()).not.toBeNull()
  })

  it('без hold приложение уже на экране: конец титр увозит замок сам', () => {
    const parent = frame()
    const o = opts()
    mountIntro(parent, o)
    vi.advanceTimersByTime(LINE_MS * 4 + TITLE_MS + LEAVE_MS)
    expect(o.onFinish).toHaveBeenCalledTimes(1)
    expect(o.onGone).toHaveBeenCalledTimes(1)
    expect(lock()).toBeNull()
  })

  it('касание во время титр — сразу чат, без уезда (экран приложения)', () => {
    const parent = frame()
    const o = opts({ gate: true })
    mountIntro(parent, o)
    lock()!.click()
    vi.advanceTimersByTime(1000)
    lock()!.click()
    expect(o.onFinish).toHaveBeenCalledTimes(1)
    expect(o.onGone).toHaveBeenCalledTimes(1)
    expect(lock()).toBeNull()
    expect(document.querySelector('.intro')).toBeNull()
  })

  it('reduced-motion: без уезда — замок меняется чатом мгновенно', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const parent = frame()
    const o = opts({ hold: true })
    const intro = mountIntro(parent, o)
    expect(lock()!.classList.contains('intro-reduced')).toBe(true)
    vi.advanceTimersByTime(LINE_MS * 4 + TITLE_MS)
    intro.leave()
    expect(lock()).toBeNull()
    expect(o.onGone).toHaveBeenCalledTimes(1)
  })

  it('leave() до конца титр — тот же уезд и одна отметка «показано»', () => {
    const parent = frame()
    const o = opts()
    const intro = mountIntro(parent, o)
    intro.leave()
    expect(o.onFinish).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(LEAVE_MS)
    expect(lock()).toBeNull()
    expect(o.onGone).toHaveBeenCalledTimes(1)
  })

  it('remove() снимает экран без уезда и без onGone — компонент размонтирован', () => {
    const parent = frame()
    const o = opts({ gate: true })
    const intro = mountIntro(parent, o)
    intro.remove()
    expect(lock()).toBeNull()
    expect(o.onGone).not.toHaveBeenCalled()
  })
})
