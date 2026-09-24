import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Game } from '../engine/game'
import { GameContext, useGame } from './useGame'
import { StatusBar, ChatHeader, StatsBar } from './Header'
import { Chat } from './Chat'
import { Choices, Composer } from './Input'
import { Sheet } from './Sheet'
import { Toast, Notification, DeadScreen, EndingScreen } from './Overlays'
import { DebugPanel } from './DebugPanel'
import { Intro } from './Intro'
import { uiOf, viewOf, introOf } from './view'

/** Корень: единственный компонент с Game в руках — отдаёт дереву фасад, а живую игру только DebugPanel. */
export function App({ game, onReset, debug = false, intro = false, introGate = false }: { game: Game; onReset: () => void; debug?: boolean; intro?: boolean; introGate?: boolean }) {
  const ui = uiOf(game)
  // звук разрешается первым касанием; «вернулся к вкладке» — пачка непрочитанных
  useEffect(() => {
    const gesture = () => ui.gesture()
    const vis = () => void ui.onVisibility(document.hidden)
    document.addEventListener('pointerdown', gesture)
    document.addEventListener('keydown', gesture)
    document.addEventListener('visibilitychange', vis)
    return () => {
      document.removeEventListener('pointerdown', gesture)
      document.removeEventListener('keydown', gesture)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [ui])

  // битое сохранение — самый вероятный виновник падения, поэтому стираем его до новой игры
  const hardReset = () => { ui.reset(); onReset() }

  return (
    <Crash onReset={hardReset}>
      <GameContext.Provider value={ui}>
        {debug ? (
          <div className="debug-layout"><Phone onReset={onReset} intro={intro} introGate={introGate} /><DebugPanel game={game} /></div>
        ) : (
          <Phone onReset={onReset} intro={intro} introGate={introGate} />
        )}
      </GameContext.Provider>
    </Crash>
  )
}

/** Падение отрисовки: без границы — белый экран без единой кнопки. */
class Crash extends Component<{ onReset: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error('[alik] интерфейс упал', error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="crash">
        <p>Что-то сломалось. Начать заново?</p>
        <button onClick={this.props.onReset}>Стереть сохранение и начать заново</button>
      </div>
    )
  }
}

function Phone({ onReset, intro, introGate }: { onReset: () => void; intro: boolean; introGate: boolean }) {
  const game = useGame()
  const [sheet, setSheet] = useState(false)
  const phone = useRef<HTMLDivElement>(null)
  // пролог не меняется по ходу партии — снимок интро стабилен, цепочка анимации не перезапускается
  const introData = useMemo(() => (intro ? introOf(game) : null), [game, intro])
  const [introGone, setIntroGone] = useState(false)

  // заголовок вкладки: «(3) Алик, где деньги?»
  useEffect(() => { document.title = game.ui.title }, [game.ui.title])

  // отклик на смысл ввода (без подписи категории); снимаем класс на animationend
  useEffect(() => {
    const p = phone.current
    if (!p || !game.ui.feelId || !game.ui.feel) return
    const cls = `feel-${game.ui.feel}`
    p.classList.remove('feel-shake', 'feel-intimidate', 'feel-sorry', 'feel-moo')
    void p.offsetWidth
    p.classList.add(cls)
    const clear = (e: AnimationEvent) => {
      if (e.target !== p) return
      p.classList.remove(cls)
    }
    p.addEventListener('animationend', clear)
    return () => p.removeEventListener('animationend', clear)
  }, [game.ui.feelId, game.ui.feel])

  const setSheetOpen = useCallback((v: boolean) => { game.ui.sheetOpen = v; setSheet(v) }, [game])

  useEffect(() => {
    if (!sheet) return
    return () => { game.ui.sheetOpen = false }
  }, [sheet, game])

  const endingId = viewOf(game).endingId
  useEffect(() => {
    if (endingId || game.battery.dead) setSheetOpen(false)
  }, [endingId, game.battery.dead, setSheetOpen])

  const reset = () => {
    if (!confirm('Стереть всё и начать заново?')) return
    game.reset()
    onReset()
  }

  const introUp = !!introData && !introGone
  const blocked = sheet || game.battery.dead || !!endingId || introUp

  return (
    <div className="phone" ref={phone}>
      <div className="phone-surface" inert={blocked || undefined}>
        <div className="phone-main">
          <StatusBar />
          <ChatHeader onInfo={() => setSheetOpen(true)} />
          <StatsBar />
          <Chat />
          <Choices />
          <Composer />
        </div>
        <Notification />
      </div>
      <Toast />
      <DeadScreen />
      <EndingScreen onReset={reset} />
      {sheet && <Sheet onClose={() => setSheetOpen(false)} onReset={reset} />}
      {introData && !introGone && <Intro data={introData} gate={introGate} onDone={() => setIntroGone(true)} />}
    </div>
  )
}
