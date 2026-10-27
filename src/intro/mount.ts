// Экран интро: титры на приглушённом экране блокировки. Одна копия разметки, таймингов и поведения
// на два входа — React новой партии (src/ui/Intro.tsx: «Начать заново», витрины) и титры шелла
// холодной загрузки (src/intro/shell.ts, #1444: первый запуск в вебе). Поведение проверяет ui.test.tsx.
// Модуль без React: шелл берёт его целиком, а React-обёртке он отдаёт готовый DOM.
import { TRACK_NOTE } from '../analytics/gate'
import { FADE_MS, LINE_MS, TITLE_MS } from './cards'

export interface IntroOptions {
  /** Четыре строки-титра: карточки 1–4 по порядку (src/intro/cards.ts). */
  lines: readonly [string, string, string, string]
  /** Дата и время в углу: день 0 партии и время переписки. */
  date: string
  clock: string
  /** Первый запуск: до касания титры стоят на месте — касание разрешает и звук. */
  gate: boolean
  /** Титры пошли (касание сняло гейт) — один раз: шелл с этого момента грузит приложение. */
  onStart?: () => void
  /** «Мууу» на титуле: звук зовёт владелец экрана (игра — своим звуком, шелл — через приложение). */
  onMoo: () => void
  /** Титры кончились или игрок их пропустил — один раз, до уезда: владелец ставит отметку «показано». */
  onFinish: () => void
  /** Экран убран (модуль уже снял свой узел): владельцу пора отдать место чату. */
  onGone: () => void
  /** Строка о счётчике — на экране, пока аналитика включена (docs/design/analytics.md). */
  trackNote?: boolean
}

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Уезд в чат: титры уезжают вверх за это время (CSS .intro-leave). */
const LEAVE_MS = 450

/**
 * Монтирует титры в `parent` и возвращает уборку. Владелец решает, что делать в onFinish/onGone;
 * сам модуль только рисует, ведёт цепочку карточек и снимает свой узел.
 */
export function mountIntro(parent: HTMLElement, opts: IntroOptions): () => void {
  const reduced = reducedMotion()
  const root = el('div', `intro card-0${reduced ? ' intro-reduced' : ''}`)
  root.setAttribute('role', 'button')
  root.tabIndex = 0
  root.setAttribute('aria-label', 'Интро: коснитесь, чтобы пропустить')

  const clock = el('div', 'intro-clock')
  clock.append(el('div', 'intro-date', opts.date), el('div', 'intro-time', opts.clock))
  root.append(clock)
  const note = opts.trackNote ? el('p', 'track-note', TRACK_NOTE) : null
  // строка о счётчике — последний узел всегда: остальные вставляются перед ней, пока она на месте
  if (note) root.append(note)

  let started = !opts.gate
  let card = 0
  let phase: 'in' | 'out' = 'in'
  let leaving = false
  let done = false
  let scheduled = false
  const timers: number[] = []

  let line: HTMLElement | null = null
  let lineCard = -1
  let title: HTMLElement | null = null
  let moo: HTMLElement | null = null
  let hint: HTMLElement | null = null

  const later = (ms: number, f: () => void): void => { timers.push(window.setTimeout(f, ms)) }

  /** Приводит DOM к текущему состоянию: одна строка на экране, титул на карточке 4, подсказка до касания. */
  const sync = (): void => {
    root.className = `intro card-${card}${leaving ? ' intro-leave' : ''}${reduced ? ' intro-reduced' : ''}`
    // строка: новая карточка — новый узел, иначе анимация появления не играет заново
    if (started && card < 4) {
      if (!line || lineCard !== card) {
        line?.remove()
        line = el('div', 'intro-line on', opts.lines[card])
        line.dataset.phase = phase
        lineCard = card
        root.insertBefore(line, title ?? hint ?? note)
      }
      line.className = `intro-line ${phase === 'out' ? 'out' : 'on'}`
      line.dataset.phase = phase
    } else {
      line?.remove()
      line = null
      lineCard = -1
    }
    if (started) {
      hint?.remove()
      hint = null
      if (!title) {
        title = el('div', 'intro-title')
        const big = el('div', 'intro-title-big')
        big.innerHTML = 'Алик,<br>где деньги?'
        title.append(big)
        root.insertBefore(title, note)
      }
      title.className = `intro-title${card === 4 ? ' on' : ''}`
      // «Мууу» приходит вместе с титулом — и звук, и надпись (карточка 5 макета)
      if (card === 4 && !moo) {
        moo = el('div', 'intro-moo', 'Мууууу')
        title.append(moo)
      }
    }
    if (!started && !hint) {
      hint = el('div', 'intro-hint', 'Коснитесь, чтобы начать')
      root.insertBefore(hint, note)
    }
  }

  const finish = (slide: boolean): void => {
    if (done) return
    done = true
    for (const t of timers) window.clearTimeout(t)
    timers.length = 0
    opts.onFinish()
    if (slide && !reduced) {
      leaving = true
      sync()
      later(LEAVE_MS, () => { remove(); opts.onGone() })
    } else {
      remove()
      opts.onGone()
    }
  }

  /** Цепочка: удержание → затухание → следующая (без наложения). Reduced — мгновенная смена. */
  const start = (): void => {
    if (scheduled) return
    scheduled = true
    opts.onStart?.()
    for (let i = 1; i <= 4; i++) {
      if (!reduced) later(LINE_MS * i - FADE_MS, () => { phase = 'out'; sync() })
      later(LINE_MS * i, () => {
        card = i
        phase = 'in'
        sync()
        if (i === 4) opts.onMoo()
      })
    }
    later(LINE_MS * 4 + TITLE_MS, () => finish(!reduced))
  }

  const tap = (): void => {
    if (!started) {
      started = true
      sync()
      start()
    } else finish(false)
  }

  const remove = (): void => { for (const t of timers) window.clearTimeout(t); timers.length = 0; root.remove() }

  root.addEventListener('click', tap)
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    tap()
  })

  sync()
  parent.append(root)
  if (started) start()

  return remove
}
