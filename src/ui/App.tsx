import { useEffect, useRef, useState } from 'react'
import type { Game } from '../engine/game'
import { GameContext, useGame } from './useGame'
import { StatusBar, ChatHeader, StatsBar } from './Header'
import { Chat } from './Chat'
import { Choices, Composer } from './Input'
import { Sheet } from './Sheet'
import { Toast, Notification, DeadScreen, EndingScreen } from './Overlays'
import { DebugPanel } from './DebugPanel'

export function App({ game, onReset, debug = false }: { game: Game; onReset: () => void; debug?: boolean }) {
  // звук разрешается первым касанием; «вернулся к вкладке» — пачка непрочитанных
  useEffect(() => {
    const gesture = () => game.gesture()
    const vis = () => game.onVisibility(document.hidden)
    document.addEventListener('pointerdown', gesture)
    document.addEventListener('keydown', gesture)
    document.addEventListener('visibilitychange', vis)
    return () => {
      document.removeEventListener('pointerdown', gesture)
      document.removeEventListener('keydown', gesture)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [game])

  return (
    <GameContext.Provider value={game}>
      {debug ? (
        <div className="debug-layout"><Phone onReset={onReset} /><DebugPanel /></div>
      ) : (
        <Phone onReset={onReset} />
      )}
    </GameContext.Provider>
  )
}

function Phone({ onReset }: { onReset: () => void }) {
  const game = useGame()
  const [sheet, setSheet] = useState(false)
  const phone = useRef<HTMLDivElement>(null)

  // заголовок вкладки: «(3) Алик, где деньги?»
  useEffect(() => { document.title = game.title }, [game.title])

  // отклик на смысл ввода (без подписи категории); снимаем класс на animationend
  useEffect(() => {
    const p = phone.current
    if (!p || !game.feelId || !game.feel) return
    const cls = `feel-${game.feel}`
    p.classList.remove('feel-shake', 'feel-intimidate', 'feel-sorry', 'feel-moo')
    void p.offsetWidth
    p.classList.add(cls)
    const clear = (e: AnimationEvent) => {
      if (e.target !== p) return
      p.classList.remove(cls)
    }
    p.addEventListener('animationend', clear)
    return () => p.removeEventListener('animationend', clear)
  }, [game.feelId, game.feel])

  const setSheetOpen = (v: boolean) => { game.sheetOpen = v; setSheet(v) }

  useEffect(() => {
    if (!sheet) return
    return () => { game.sheetOpen = false }
  }, [sheet, game])

  useEffect(() => {
    if (game.S.ending || game.dead) setSheetOpen(false)
  }, [game.S.ending, game.dead])

  const reset = () => {
    if (!confirm('Стереть всё и начать заново?')) return
    game.reset()
    onReset()
  }

  const blocked = sheet || game.dead || !!game.S.ending

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
    </div>
  )
}
