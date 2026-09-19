import { useEffect, useRef, useState } from 'react'
import type { Game } from '../engine/game'
import { GameContext, useGame } from './useGame'
import { StatusBar, ChatHeader, StatsBar } from './Header'
import { Chat } from './Chat'
import { Choices } from './Input'
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

  // тряска телефона на «АЛИК!!!»
  useEffect(() => {
    const p = phone.current
    if (!p || !game.shakeId) return
    p.classList.remove('shake')
    void p.offsetWidth
    p.classList.add('shake')
  }, [game.shakeId])

  const setSheetOpen = (v: boolean) => { game.sheetOpen = v; setSheet(v) }
  const reset = () => {
    if (!confirm('Стереть всё и начать заново?')) return
    game.reset()
    onReset()
  }

  return (
    <div className="phone" ref={phone}>
      <StatusBar />
      <ChatHeader onInfo={() => setSheetOpen(true)} />
      <StatsBar />
      <Chat />
      <Choices />
      {sheet && <Sheet onClose={() => setSheetOpen(false)} onReset={reset} />}
      <Toast />
      <Notification />
      <DeadScreen />
      <EndingScreen onReset={reset} />
    </div>
  )
}
