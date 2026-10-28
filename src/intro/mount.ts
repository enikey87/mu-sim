// Экран блокировки один на всю загрузку (#1522): в шелле его рождает index.html, а титры дорабатывают этот
// же узел (hand-shake по #lock-screen), а не строят второй; когда узла нет (перезапуск «Начать заново»
// внутри приложения) — создают его сами теми же классами. Модуль без UI-пакета: шелл берёт его целиком,
// а компоненту-обёртке отдаёт готовый DOM. Поведение проверяет ui.test.tsx, склейку с шеллом —
// tests/e2e/intro-shell.spec.ts.
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
  /** Не уезжать концом титр: владелец позовёт leave(), когда отрисован первый кадр чата (#1522). */
  hold?: boolean
}

export interface IntroHandle {
  /** Уход в чат: тот же уезд 450 мс, что у титр; reduced-motion — мгновенная подмена. */
  leave: () => void
  /** Снять экран без уезда: компонент размонтирован. */
  remove: () => void
}

/** Уезд в чат: титры уезжают вверх за это время (CSS .intro-leave). */
export const LEAVE_MS = 450

/** reduced: уезда и охоты пузырька нет — замок меняется чатом мгновенно (#1522). */
export const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Замок: у шелла узел уже стоит в index.html, у приложения — свой, теми же классами и id (#1522). */
const lockOf = (parent: HTMLElement): HTMLElement => {
  const existing = parent.querySelector<HTMLElement>('#lock-screen')
  if (existing) return existing
  const lock = el('div', 'intro')
  lock.id = 'lock-screen'
  parent.append(lock)
  return lock
}

/** Часы замка: дата — день 0 партии, время — часы переписки; узлы уже есть у замка из разметки. */
const clockOf = (lock: HTMLElement, date: string, clock: string): void => {
  let node = lock.querySelector<HTMLElement>('.intro-clock')
  if (!node) { node = el('div', 'intro-clock'); lock.prepend(node) }
  let dateEl = node.querySelector<HTMLElement>('.intro-date')
  if (!dateEl) { dateEl = el('div', 'intro-date'); node.append(dateEl) }
  let timeEl = node.querySelector<HTMLElement>('.intro-time')
  if (!timeEl) { timeEl = el('div', 'intro-time'); node.append(timeEl) }
  dateEl.textContent = date
  timeEl.textContent = clock
}

/** Низ замка: подсказка, уровень и строки отказа стоят в одном месте у обоих входов (#1522). */
const footOf = (lock: HTMLElement): HTMLElement => {
  const existing = lock.querySelector<HTMLElement>('.intro-foot')
  if (existing) return existing
  const foot = el('div', 'intro-foot')
  lock.append(foot)
  return foot
}

/**
 * Монтирует титры в замок внутри `parent` и возвращает ручку: leave() — уезд в чат, remove() — снять без
 * уезда. Владелец решает, что делать в onFinish/onGone; сам модуль только рисует, ведёт цепочку карточек
 * и снимает свой узел.
 */
export function mountIntro(parent: HTMLElement, opts: IntroOptions): IntroHandle {
  const reduced = prefersReducedMotion()
  const root = lockOf(parent)
  root.classList.add('intro')
  root.classList.toggle('intro-reduced', reduced)
  root.setAttribute('role', 'button')
  root.tabIndex = 0
  root.setAttribute('aria-label', 'Интро: коснитесь, чтобы пропустить')
  clockOf(root, opts.date, opts.clock)

  const foot = footOf(root)
  // порядок низа: строка о счётчике, подсказка, дальше — уровень и строки отказа, если они есть в разметке
  if (opts.trackNote) foot.prepend(el('p', 'track-note', TRACK_NOTE))
  let hint: HTMLElement | null = null
  if (opts.gate) {
    hint = el('div', 'intro-hint', 'Коснитесь, чтобы начать')
    const note = foot.querySelector<HTMLElement>('.track-note')
    if (note) note.after(hint)
    else foot.prepend(hint)
  }

  let started = !opts.gate
  let card = 0
  let phase: 'in' | 'out' = 'in'
  let leaving = false
  let done = false
  let gone = false
  let scheduled = false
  const timers: number[] = []

  let line: HTMLElement | null = null
  let lineCard = -1
  let title: HTMLElement | null = null
  let moo: HTMLElement | null = null

  const later = (ms: number, f: () => void): void => { timers.push(window.setTimeout(f, ms)) }
  const clearTimers = (): void => { for (const t of timers) window.clearTimeout(t); timers.length = 0 }

  /** Приводит DOM к текущему состоянию: одна строка на экране, титул на карточке 4, подсказка до касания. */
  const sync = (): void => {
    for (let i = 0; i < 5; i++) root.classList.toggle(`card-${i}`, card === i)
    root.classList.toggle('intro-leave', leaving)
    root.classList.toggle('intro-reduced', reduced)
    // строка: новая карточка — новый узел, иначе анимация появления не играет заново
    if (started && card < 4) {
      if (!line || lineCard !== card) {
        line?.remove()
        line = el('div', 'intro-line on', opts.lines[card])
        line.dataset.phase = phase
        lineCard = card
        root.insertBefore(line, title ?? null)
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
        root.append(title)
      }
      title.className = `intro-title${card === 4 ? ' on' : ''}`
      // «Мууу» приходит вместе с титулом — и звук, и надпись (карточка 5 макета)
      if (card === 4 && !moo) {
        moo = el('div', 'intro-moo', 'Мууууу')
        title.append(moo)
      }
    }
  }

  const remove = (): void => {
    if (gone) return
    gone = true
    clearTimers()
    root.remove()
  }

  /** Титры кончились: отметка «показано» и титул на месте — держим его, если ждём пакет. */
  const finish = (): void => {
    if (done) return
    done = true
    clearTimers()
    card = 4
    phase = 'in'
    sync()
    opts.onFinish()
    if (!opts.hold) leave()
  }

  /** Пропуск касанием: сразу в чат, но при hold — на титуле ждём готовности пакета. */
  const skip = (): void => {
    if (done) return
    done = true
    clearTimers()
    card = 4
    phase = 'in'
    sync()
    opts.onFinish()
    if (opts.hold) return
    remove()
    opts.onGone()
  }

  /** Уезд в чат: тот же переход 450 мс, что у титр; reduced — мгновенная подмена замка чатом. */
  const leave = (): void => {
    if (gone || leaving) return
    if (!done) finish()
    if (gone || leaving) return
    if (reduced) {
      remove()
      opts.onGone()
      return
    }
    leaving = true
    sync()
    later(LEAVE_MS, () => { remove(); opts.onGone() })
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
    later(LINE_MS * 4 + TITLE_MS, finish)
  }

  const tap = (): void => {
    if (!started) {
      started = true
      sync()
      start()
      return
    }
    skip()
  }

  root.addEventListener('click', tap)
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    tap()
  })

  sync()
  if (started) start()

  return { leave, remove }
}
