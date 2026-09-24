import { useState, useSyncExternalStore } from 'react'
import type { Game } from '../engine/game'
import type { TraceEntry } from '../engine/ui-state'

// Факты, которые почти всегда есть и только шумят
const NOISY = /^(once\.|said\.|cb\.|caught\.)/

/** Отладочная панель (?debug): какое правило выбрано на каждое событие и почему. */
export function DebugPanel({ game }: { game: Game }) {
  useSyncExternalStore(game.subscribe, game.getVersion)
  const [open, setOpen] = useState<number | null>(null)
  const [showMem, setShowMem] = useState(false)
  const mem = Object.entries(game.S.mem).filter(([k]) => showMem || !NOISY.test(k))

  return (
    <aside className="debug" aria-label="Отладка правил">
      <div className="debug-head">
        <b>Правила</b>
        <span>{game.rules.all.length} правил · показаны последние {game.ui.trace.length} выборов</span>
      </div>

      <details className="debug-mem">
        <summary>Память ({Object.keys(game.S.mem).length})</summary>
        <label><input type="checkbox" checked={showMem} onChange={(e) => setShowMem(e.target.checked)} /> показать служебные (said., once., cb.)</label>
        <table>
          <tbody>{mem.map(([k, v]) => <tr key={k}><td>{k}</td><td>{String(v)}</td></tr>)}</tbody>
        </table>
      </details>

      <ol className="debug-list">
        {game.ui.trace.map((t) => <Entry key={t.id} t={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />)}
      </ol>
    </aside>
  )
}

const rank = (t: TraceEntry, c: TraceEntry['candidates'][number]) => (t.chosen.includes(c.name) ? 2 : c.ok ? 1 : 0)

function Entry({ t, open, onToggle }: { t: TraceEntry; open: boolean; onToggle: () => void }) {
  const passed = t.candidates.filter((c) => c.ok)
  const facts = Object.entries(t.facts).filter(([k, v]) => v !== undefined && v !== null && v !== false && v !== '' && !NOISY.test(k))
  return (
    <li className={'debug-entry' + (t.chosen.length ? '' : ' none')}>
      <button className="debug-row" onClick={onToggle} aria-expanded={open}>
        <span className="ev">{t.event}{t.target ? ` → ${t.target}` : ''}</span>
        <span className="win">{t.chosen.length ? t.chosen.join(', ') : t.mode === 'collect' ? '— только общие реплики' : '— ничего не подошло'}</span>
        <span className="cnt">{passed.length}/{t.candidates.length}</span>
      </button>
      {open && (
        <div className="debug-body">
          <div className="cands">
            {/* сначала выбранные, потом подошедшие, потом остальные — по специфичности */}
            {[...t.candidates].sort((a, b) => rank(t, b) - rank(t, a) || b.specificity - a.specificity).map((c) => (
              <div key={c.name} className={'cand' + (t.chosen.includes(c.name) ? ' chosen' : c.ok ? ' ok' : '')}>
                <span className="sp">{c.specificity}</span>
                <span className="nm">{c.name}</span>
                <span className="why">{c.ok ? (t.chosen.includes(c.name) ? 'выбрано' : 'подошло') : c.blocked === 'odds' ? 'не повезло (шанс)' : c.blocked === 'once' ? 'уже было (once)' : c.failed.join(' · ')}</span>
              </div>
            ))}
          </div>
          <div className="facts">
            {facts.map(([k, v]) => <span key={k}><b>{k}</b>={String(v)}</span>)}
          </div>
        </div>
      )}
    </li>
  )
}
