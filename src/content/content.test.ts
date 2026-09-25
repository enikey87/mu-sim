// Целостность контента: ссылки сцен, ачивки, словари, генератор отмазок.
import { describe, it, expect } from 'vitest'
import { make, D } from './excuses'
import { makeScenes, type Line } from './scenes'
import { ARCS, ARC_DONE, CAST, GROUP } from './arcs'
import { ACH } from './achievements'
import { FINALES, ENDINGS } from './finales'
import * as L from './life'
import { allRules } from './rules'
import { Decks } from '../engine/deck'
import { seededRng } from '../engine/rng'
import { Gated, valueOf, type Entry } from '../engine/rules'

const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const allSource = Object.values(sources).join('\n')

const api = (seed = 1, tier = 0) => {
  const decks = new Decks({}, seededRng(seed))
  // весь словарь, без требований мира: проверяется сам текст
  return make(<T>(k: string, a: readonly Entry<T>[], nr?: boolean) => decks.draw(k, a.map(valueOf), nr), () => tier, seededRng(seed + 1))
}

describe('scenes', () => {
  const scenes = makeScenes(api())
  it('every start node and every option target exists', () => {
    for (const [sid, sc] of Object.entries(scenes)) {
      expect(sc.nodes[sc.start], `${sid}.start`).toBeDefined()
      for (const [nid, n] of Object.entries(sc.nodes)) {
        for (const o of n.opts ?? []) {
          if (o.go === null) continue
          const [s2, n2] = o.go.includes(':') ? o.go.split(':') : [sid, o.go]
          expect(scenes[s2]?.nodes[n2], `${sid}.${nid} → ${o.go}`).toBeDefined()
        }
      }
    }
  })
  it('every node says or shows something; achievements exist', () => {
    const base = { v: 1, n: 'баран', p: 'x', rows: [['a', 1]], total: 1, r: ['a', 'b', 'c'] }
    const all = <T,>(arr: readonly Entry<T>[]) => arr.map(valueOf)
    for (const [sid, sc] of Object.entries(scenes)) {
      const vars = { ...base, ...sc.init?.(seededRng(1), all, 200) }
      const txt = (l: Line) => (typeof l === 'function' ? l(vars) : l)
      for (const [nid, n] of Object.entries(sc.nodes)) {
        const has = n.a || n.a2 || n.sys || n.sys2 || n.opts || n.then || n.doc || n.hook
        expect(has, `${sid}.${nid}`).toBeTruthy()
        for (const l of [...(n.a ?? []), ...(n.a2 ?? [])]) expect(txt(valueOf(l)).length, `${sid}.${nid}`).toBeGreaterThan(1)
        if (n.fx?.ach) expect(ACH[n.fx.ach], `${sid}.${nid} ach`).toBeDefined()
        if (n.who) expect(CAST[n.who]).toBeDefined()
      }
    }
  })
  it('scene init functions produce the vars their lines use', () => {
    const rng = seededRng(1)
    const all = <T,>(arr: readonly Entry<T>[]) => arr.map(valueOf)
    expect(scenes.barter.init!(rng, all, 200)).toMatchObject({ n: expect.any(String), v: expect.any(Number) })
    const inv = scenes.invoice.init!(rng, all, 200)
    expect(inv.total).toBe(inv.rows.reduce((n: number, r: [string, number]) => n + r[1], 0))
    expect(scenes.choice.init!(rng, all, 200).r).toHaveLength(3)
  })
})

describe('arcs and cast', () => {
  it('у каждого сериала есть вопрос «Как там…?», уместный при любом положении', () => {
    for (const [id, a] of Object.entries(ARCS)) expect(a.follow.some((f) => !(f instanceof Gated)), id).toBe(true)
  })
  it('arcs are well-formed, last episode unlocks an existing achievement, done-lines exist', () => {
    for (const [id, a] of Object.entries(ARCS)) {
      expect(a.eps.length, id).toBeGreaterThanOrEqual(5)
      expect(a.follow.length, id).toBeGreaterThanOrEqual(2)
      expect(ACH[a.eps[a.eps.length - 1].fx?.ach ?? ''], `${id} final ach`).toBeDefined()
      expect(ARC_DONE[id]?.length, `${id} ARC_DONE`).toBeGreaterThan(0)
      for (const ep of a.eps) for (const m of ep.m.map(valueOf)) if (typeof m !== 'string') expect(CAST[m.w], `${id} who ${m.w}`).toBeDefined()
    }
    for (const w of Object.keys(GROUP)) expect(CAST[w], `group ${w}`).toBeDefined()
    // реплики семейного чата не совпадают с репликами сериалов (иначе — повтор в переписке)
    const arcLines = new Set(Object.values(ARCS).flatMap((a) => a.eps.flatMap((e) => e.m.map(valueOf).map((m) => (typeof m === 'string' ? m : m.t)))))
    for (const t of Object.values(GROUP).flat().map(valueOf)) expect(arcLines.has(t), t).toBe(false)
  })
})

describe('achievements', () => {
  it('every unlocked key exists, every achievement is reachable from code/content', () => {
    const used = new Set<string>()
    for (const m of allSource.matchAll(/unlock\('(\w+)'\)/g)) used.add(m[1])
    for (const m of allSource.matchAll(/ach: '(\w+)'/g)) used.add(m[1])
    for (const t of [1, 2, 3]) used.add('tier' + t) // unlock('tier' + t)
    used.add('rude').add('threat') // unlock(tone) в Game.send
    for (const [arc, fs] of Object.entries(FINALES)) for (const f of fs) used.add(`fin_${arc}_${f.id}`) // unlock в playFinale
    for (const e of ENDINGS) used.add('end_' + e.id) // unlock в reachEnding
    for (const k of used) expect(ACH[k], `unknown achievement ${k}`).toBeDefined()
    for (const k of Object.keys(ACH)) expect(used.has(k), `unreachable achievement ${k}`).toBe(true)
  })
})

describe('dictionaries', () => {
  it('every D key referenced in code exists and is non-empty', () => {
    const refs = new Set<string>()
    for (const m of allSource.matchAll(/\bD\.([A-Z][A-Z0-9_]+)/g)) refs.add(m[1])
    for (const m of allSource.matchAll(/fromD\(g, '([A-Z0-9_]+)'/g)) refs.add(m[1])
    for (const m of allSource.matchAll(/P2\('([A-Z0-9_]+)', '([A-Z0-9_]+)'\)/g)) { refs.add(m[1]); refs.add(m[2]) }
    expect(refs.size).toBeGreaterThan(20)
    for (const k of refs) {
      expect(Array.isArray(D[k]), `D.${k}`).toBe(true)
      expect(D[k].length, `D.${k}`).toBeGreaterThan(0)
    }
  })
  it('life pools are non-empty; notifications are well-formed', () => {
    for (const k of ['IDLE', 'STICKERS', 'FWD', 'DELETED', 'EDIT_WHEN', 'IDLE_Q', 'IDLE_A', 'VOICE', 'NOTIF', 'SPEND'] as const) {
      expect((L[k] as unknown[]).length, k).toBeGreaterThan(0)
    }
    for (const n of L.NOTIF) {
      expect(n.icon && n.app, n.t).toBeTruthy()
      // подстановки — только у трат с карты
      expect(/\{\w+\}/.test(n.t), n.t).toBe(!!n.spend)
    }
    // одноразовые уведомления не выдают того, чего не было: карта продолжает списывать и дальше
    const blood = L.NOTIF.find((n) => n.app === 'Донорский центр')!
    expect(blood.t).not.toMatch(/снова/)
    const bankFifty = L.NOTIF.find((n) => n.app === 'Банк' && /это хобби/.test(n.t))!
    expect(bankFifty.t).not.toMatch(/заблокирован/)
  })
  it('player templates only use known placeholders', () => {
    for (const k of Object.keys(D).filter((k) => k.startsWith('P_'))) {
      for (const s of (D[k] as Entry<string>[]).map(valueOf)) for (const m of s.matchAll(/\{(\w+)\}/g)) expect(['t', 'T', 'n', 's', 'date', 'days', 'amount'], `${k}: ${s}`).toContain(m[1])
    }
  })
})

describe('excuse generator', () => {
  it('produces clean, mostly unique texts at every tier', () => {
    for (const tier of [0, 1, 2, 3]) {
      const X = api(tier + 1, tier)
      const seen = new Set<string>()
      for (let i = 0; i < 3000; i++) {
        const e = X.excuse({ preferLong: i % 2 === 0 })
        expect(e.texts.length).toBeGreaterThan(0)
        for (const t of e.texts) {
          expect(t, t).not.toMatch(/undefined|null|NaN|\[object|\s,|\s\.\s| {2}/)
          expect(t.length).toBeGreaterThan(2)
        }
        if (e.p) expect(e.texts.join(' ').toLowerCase()).toContain(e.p.t.toLowerCase())
        seen.add(e.texts.join('|'))
      }
      expect(seen.size / 3000, `tier ${tier}`).toBeGreaterThan(0.97)
    }
  }, 60_000) // 12 000 отмазок: время растёт с корпусом, а не с числом проверок
  it('higher tiers use escalated excuses', () => {
    const X = api(5, 3)
    const esc = ([...D.ESC1, ...D.ESC2, ...D.ESC3] as Entry<string>[]).map(valueOf)
    let hits = 0
    for (let i = 0; i < 500; i++) if (esc.some((e) => X.excuse().texts.join(' ').includes(e))) hits++
    expect(hits).toBeGreaterThan(50)
    const X0 = api(5, 0)
    for (let i = 0; i < 300; i++) expect(esc.some((e) => X0.excuse().texts.join(' ').includes(e))).toBe(false)
  })
  it('constr:true только если constr() взял из CONSTR, не из ESC', () => {
    const esc = ([...D.ESC1, ...D.ESC2, ...D.ESC3] as Entry<string>[]).map(valueOf)
    const X = api(11, 3)
    let escOnSite = 0, flagged = 0
    for (let i = 0; i < 3000; i++) {
      const e = X.excuse()
      const text = e.texts.join(' ')
      // шаблон «я на объекте. …» — два слота constr(); «время на объекте» в сроке не считается
      if (!/я на объекте\./i.test(text)) continue
      if (!esc.some((s) => text.includes(s))) continue
      if (e.constr) flagged++
      else escOnSite++
    }
    expect(escOnSite, 'ESC на объекте без флага').toBeGreaterThan(0)
    expect(flagged, 'флаг на чистом ESC').toBe(0)
  })
  it('оправдание просрочки не ссылается на общий опыт игрока', () => {
    expect(D.PREV_B.map(valueOf).join(' ')).not.toMatch(/ты сам видел/)
  })
  it('legendary excuses appear and never repeat', () => {
    const X = api(9)
    const legends: string[] = []
    for (let i = 0; i < 8000; i++) { const e = X.excuse(); if (e.legendary) legends.push(e.texts[0]) }
    expect(legends.length).toBeGreaterThan(50)
    expect(new Set(legends).size).toBe(legends.length)
  })
  it('helper generators produce text', () => {
    const X = api(3)
    for (const f of [X.short, X.offended, X.threat, X.cow, X.back, X.jobYes, X.jobNo, X.photo, X.legendQ, X.sorry]) {
      expect(f()).toMatch(/\S/)
    }
    expect(X.transferQ().text).not.toBe('')
    expect(X.shortQ('Завтра.')).toMatch(/^«Завтра»/)
    expect(X.whyRel({ n: 'дядя Самвел', g: 'дяди Самвела' }).text).toMatch(/Дядя Самвел/)
    expect(X.fill('{t}-{x}', { t: 'a' })).toBe('a-')
  })
})

describe('rules content', () => {
  it('rule names unique and every rule has respond or offer', () => {
    const names = allRules.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
    for (const r of allRules) expect(r.respond || r.offer, r.name).toBeTruthy()
  })
  it('every intent offered by a choice rule has a reply rule', () => {
    const intents = new Set<string>()
    for (const m of allSource.matchAll(/act: '(\w+)'/g)) intents.add(m[1])
    const replies = new Set(allRules.filter((r) => r.event === 'PlayerSays').flatMap((r) => r.when.filter((c) => c.key === 'intent').map((c) => String(c.value))))
    for (const i of intents) expect(replies.has(i), `no reply for intent ${i}`).toBe(true)
  })
})
