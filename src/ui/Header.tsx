import { useEffect, useRef, useState } from 'react'
import { useGame } from './useGame'
import { viewOf } from './view'

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Доезд числа: фиксированное время независимо от величины сдвига — большое не растягивается и не считает каждый рубль. */
export const DEBT_MS = 600

/** От показанного значения к новому, вниз и вверх; reduced-motion и первый показ — сразу. */
function useArriving(target: number): number {
  const reduced = useRef(reducedMotion()).current
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)
  const raf = useRef(0)
  // reduced: подмена во время рендера — ни одного кадра со старой суммой
  if (reduced && shown !== target) { shownRef.current = target; setShown(target) }
  useEffect(() => {
    if (reduced || shownRef.current === target) return
    cancelAnimationFrame(raf.current)
    const from = shownRef.current
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DEBT_MS)
      const k = 1 - (1 - p) ** 3
      const value = Math.round(from + (target - from) * k)
      shownRef.current = value
      setShown(value)
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, reduced])
  return shown
}

export function StatusBar() {
  const game = useGame()
  const low = game.battery.level <= 15
  return (
    <div className="statusbar">
      <span id="clock">{game.clockText}</span>
      <span id="gameDate">{game.gameDate}</span>
      <span>📶 <span id="bat" className={low ? 'low' : ''}>{game.battery.level}% {low ? '⚠️' : '🔋'}</span></span>
    </div>
  )
}

export function ChatHeader({ onInfo }: { onInfo: () => void }) {
  const game = useGame()
  const v = viewOf(game)
  // Бритьё перекрывает барана: оба факта остаются в партии (ачивки, досье), а на аватаре — «без усов».
  const look = v.shaved ? 'shaved' : v.ram ? 'ram' : ''
  return (
    <header className="chat-head">
      <div
        className={'avatar' + (look ? ' ' + look : '')}
        id="avatar"
        aria-label={look === 'shaved' ? 'Алик без усов' : undefined}
      >
        {look === 'ram' ? '🐏' : look === 'shaved' ? <><span className="shaved-letter">А</span><span className="shaved-cap">без усов</span></> : 'А'}
      </div>
      <div className="who">
        <div className="name">Алик Воздухонесян</div>
        <div className={'status ' + game.ui.status.cls} id="status">{game.ui.status.text}</div>
      </div>
      <button
        className="icon-btn"
        id="muteBtn"
        title="Звук"
        aria-label={v.muted ? 'Звук выключен' : 'Звук включён'}
        aria-pressed={!v.muted}
        onClick={() => game.toggleMute()}
      >{v.muted ? '🔇' : '🔊'}</button>
      <button className="icon-btn" id="infoBtn" title="Обещания и ачивки" aria-label="Обещания и ачивки" onClick={onInfo}>📋</button>
    </header>
  )
}

const days = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дня' : 'дней')

export function StatsBar() {
  const game = useGame()
  const v = viewOf(game)
  const debt = useArriving(v.debt)
  return (
    <div className="stats">
      <span>Долг: <b id="debt">{debt.toLocaleString('ru-RU')} ₽</b></span>
      <span>Дней после сдачи: <b id="days">{v.day}</b></span>
      {/* День выплаты: отсчёт накануне и счётчик «к выплате», который тает на глазах */}
      {v.payday.daysLeft !== null && <span id="paydayAt">До выплаты: <b>{v.payday.daysLeft} {days(v.payday.daysLeft)}</b></span>}
      {v.payday.sum !== null && <span id="paydaySum" className="payday-sum">К выплате: <b>{v.payday.sum.toLocaleString('ru-RU')} ₽</b></span>}
    </div>
  )
}
