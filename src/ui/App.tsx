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
import { uiOf, viewOf, introOf, reviewOffersOf, reviewSessionOf, reviewTranscriptOf } from './view'
import { ReviewMenu, ReviewModal, ReviewProvider, type ReviewApi, type ReviewDraft } from './Review'
import { clearNotes, isOptionNote, loadNotes, nextNoteId, reviewChoiceOf, reviewDump, reviewFileName, reviewRequested, reviewTargetOf, saveNotes, TARGET_TEXT_MAX, type ReviewNote, type ReviewTarget } from './review'
import { platform } from '../platform'
import { crash } from '../analytics/metrics'

/** Корень: единственный компонент с Game в руках — отдаёт дереву фасад, а живую игру только DebugPanel. */
export function App({ game, onReset, debug = false, intro = false, introGate = false }: { game: Game; onReset: () => void; debug?: boolean; intro?: boolean; introGate?: boolean }) {
  const ui = uiOf(game)
  // звук разрешается первым касанием; «вернулся к вкладке» — пачка непрочитанных
  useEffect(() => { platform().ready() }, [])

  useEffect(() => {
    const gesture = () => ui.gesture()
    const vis = () => void ui.onVisibility(document.hidden)
    // закрытие страницы не всегда присылает visibilitychange — тот же путь отрезка (#612)
    const hide = () => void ui.onVisibility(true)
    document.addEventListener('pointerdown', gesture)
    document.addEventListener('keydown', gesture)
    document.addEventListener('visibilitychange', vis)
    document.addEventListener('pagehide', hide)
    return () => {
      document.removeEventListener('pointerdown', gesture)
      document.removeEventListener('keydown', gesture)
      document.removeEventListener('visibilitychange', vis)
      document.removeEventListener('pagehide', hide)
    }
  }, [ui])

  // битое сохранение — самый вероятный виновник падения, поэтому стираем его до новой игры
  const hardReset = () => { clearNotes(); ui.reset(); onReset() }

  // --- режим живого рецензирования (#872): заметки в sessionStorage, партия не тронута ---
  const [reviewOn, setReviewOn] = useState(() => reviewRequested(window.location.search))
  const [notes, setNotes] = useState<ReviewNote[]>(() => loadNotes())
  const [menuFor, setMenuFor] = useState<{ msg?: number; day: number; turn: number; meAt?: number; target: ReviewTarget } | null>(null)
  const [draft, setDraft] = useState<ReviewDraft | null>(null)
  const started = useRef(new Date())

  const review = useMemo<ReviewApi>(() => ({
    enabled: reviewOn,
    notes,
    noteOf: (msg) => notes.find((n) => n.msg === msg),
    menu: (m) => {
      const target = reviewTargetOf(m, reviewOffersOf(game).get(m.id) ?? [])
      if (target) setMenuFor({ msg: m.id, day: game.S.day, turn: game.S.stats.sent, target })
    },
    menuChoice: (text) => {
      // якорь варианта — (ход, текст): пересборка вариантов за ход заметку не теряет (#878)
      const meAt = game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'me').length
      setMenuFor({ day: game.S.day, turn: game.S.stats.sent, meAt, target: { kind: 'answer_option', text: text.slice(0, TARGET_TEXT_MAX), offered: game.choices.map((c) => c.text), who: 'me' } })
    },
    optionNote: (text) => notes.find((n) => isOptionNote(n) && n.turn === game.S.stats.sent && n.target.text === text),
    edit: (id) => {
      const n = notes.find((x) => x.id === id)
      if (n) setDraft({ msg: n.msg, day: n.day, turn: n.turn, meAt: n.meAt, target: n.target, note: n.note, type: n.type, editId: n.id })
    },
    toggle: () => setReviewOn((v) => !v),
    exportNow: () => {
      // отметка выбора считается из партии: заметка о варианте знает, отправил ли игрок ровно этот текст (#878)
      const marked = notes.map((n) => (isOptionNote(n) ? { ...n, chosen: reviewChoiceOf(game.S.msgs, n, game.S.stats.sent) } : n))
      const dump = reviewDump(reviewSessionOf(game, started.current), marked, reviewTranscriptOf(game, reviewOffersOf(game)))
      const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = reviewFileName(new Date())
      a.click()
      URL.revokeObjectURL(url)
    },
  }), [reviewOn, notes, game])

  const saveDraft = (d: ReviewDraft) => {
    const note: ReviewNote = { id: d.editId ?? nextNoteId(notes), msg: d.msg, day: d.day, turn: d.turn, meAt: d.meAt, type: d.type, target: d.target, note: d.note }
    const next = d.editId === undefined ? [...notes, note] : notes.map((n) => (n.id === d.editId ? note : n))
    setNotes(next)
    saveNotes(next)
    setDraft(null)
  }

  return (
    <Crash game={game} onReset={hardReset}>
      <GameContext.Provider value={ui}>
        <ReviewProvider value={review}>
          {debug ? (
            <div className="debug-layout"><Phone onReset={onReset} intro={intro} introGate={introGate} /><DebugPanel game={game} /></div>
          ) : (
            <Phone onReset={onReset} intro={intro} introGate={introGate} />
          )}
          {reviewOn && menuFor && (
            <ReviewMenu
              onNote={() => {
                // у заметки о варианте категория по умолчанию — «плохой_вариант» (#878)
                const option = menuFor.target.kind === 'answer_option'
                setDraft({ ...menuFor, note: '', type: option ? 'плохой_вариант' : 'несостыковка' })
                setMenuFor(null)
              }}
              onClose={() => setMenuFor(null)}
            />
          )}
          {reviewOn && draft && <ReviewModal draft={draft} onSave={saveDraft} onCancel={() => setDraft(null)} />}
        </ReviewProvider>
      </GameContext.Provider>
    </Crash>
  )
}

/** Падение отрисовки: без границы — белый экран без единой кнопки. Партия живёт вне React,
 *  поэтому первая кнопка перемонтирует интерфейс, а не стирает сохранение (#1482). */
class Crash extends Component<{ game: Game; onReset: () => void; children: ReactNode }, { failed: boolean; crashes: number }> {
  state = { failed: false, crashes: 0 }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) {
    console.error('[alik] интерфейс упал', error)
    this.setState((s) => ({ crashes: s.crashes + 1 }))
    // до маячка форсируем сохранение: потерять последние ходы хуже упавшего экрана.
    // Сломанное состояние может бросить и здесь — тогда партия остаётся только в памяти.
    let day = 0
    try {
      this.props.game.save()
      day = this.props.game.S.day
    } catch { /* сохранение не сложилось */ }
    crash('ui', error, { day, platform: platform().id })
  }
  private retry = () => this.setState({ failed: false })
  render() {
    if (!this.state.failed) return this.props.children
    // второй подряд: перемонтирование не помогло — подсвечиваем запасную кнопку, но цикл не заводим
    const twice = this.state.crashes >= 2
    return (
      <div className="crash">
        <p>Что-то сломалось. Партия цела — перезагрузите интерфейс.</p>
        <button autoFocus onClick={this.retry}>Перезагрузить интерфейс</button>
        <button className={twice ? 'recommended' : undefined} onClick={this.props.onReset}>Стереть сохранение и начать заново</button>
        {twice && <p className="crash-hint">Если и после перезагрузки не открывается, остаётся стереть сохранение.</p>}
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
    clearNotes()
    game.reset()
    onReset()
  }

  const introUp = !!introData && !introGone
  const blocked = sheet || game.battery.dead || !!endingId || introUp

  useEffect(() => {
    const sync = () => {
      if (!blocked && !document.hidden) platform().gameplayStart()
      else platform().gameplayStop()
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      platform().gameplayStop()
    }
  }, [blocked])

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
