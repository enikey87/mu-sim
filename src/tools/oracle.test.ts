// Оракул аудита: проверки — классы фактов, а не строки. Тесты держат три вещи:
//   1) фикстуры двух веток (обрезанные окна смерти, поле fixture в дампе объясняет происхождение);
//   2) негативный контроль — каждую проверку видно красной на партии, собранной в этом же тесте;
//   3) опорные фразы оракула всё ещё живут в исходниках игры.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Game } from '../engine/game'
import type { Criterion } from '../engine/rules'
import { playtest, transcript, worldDump } from './playtest'

const ORACLE = '.claude/skills/playtest-audit/oracle.py'
const FIXTURES = '.claude/skills/playtest-audit/fixtures'
/** Фикстура `main` — один сид с окном смерти на текущем коде; имя файла — какой сид дал окно. */
const MAIN = readdirSync(join(FIXTURES, 'main')).find((n) => n.endsWith('.world.json'))!.replace('.world.json', '')

interface Verdict { violations: Record<string, number>; games_affected: Record<string, number>; coverage: Record<string, number> }

/** Прогон оракула по каталогу; падение питона — не «чисто», а ошибка теста. */
function oracle(dir: string, env: Record<string, string> = {}): { code: number | null; verdict: Verdict | null; err: string } {
  const r = spawnSync('python3', [ORACLE, dir], { env: { ...process.env, ...env }, encoding: 'utf8' })
  expect(r.error, 'python3 недоступен — оракул нельзя проверить').toBeUndefined()
  return { code: r.status, verdict: r.stdout ? (JSON.parse(r.stdout) as Verdict) : null, err: r.stderr }
}

/** Партия как каталог для оракула: расшифровка и дамп фактов рядом, как их пишет npm run playtest. */
async function dump(seed: number, turns: number, watch?: (game: Game) => void | Promise<void>): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-'))
  const p = await playtest(seed, turns, undefined, watch)
  writeFileSync(join(dir, `seed-${seed}.txt`), transcript(p))
  writeFileSync(join(dir, `seed-${seed}.world.json`), JSON.stringify(worldDump(p)))
  return dir
}

/** Партия, собранная руками: строки расшифровки и кадры — ровно то, что нужно одной проверке. */
function synthetic(lines: string[], world: object = { frames: [], rules: { deathGated: ['Says_WhileDead'] }, coverage: {} }): string {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-'))
  writeFileSync(join(dir, 'seed-1.txt'), ['Партия 1: сообщений игрока — 1', ...lines].join('\n'))
  writeFileSync(join(dir, 'seed-1.world.json'), JSON.stringify(world))
  return dir
}

describe('оракул: фикстуры двух веток', () => {
  it('на ed718f8 находит смерть, кончившуюся по таймеру; на main (окно смерти на текущем коде) — чисто', () => {
    const old = oracle(join(FIXTURES, 'ed718f8')).verdict!
    const now = oracle(join(FIXTURES, 'main')).verdict!
    expect(old.violations.dead_fact_lost).toBe(1)
    expect(old.coverage.dead_lost_frames).toBeGreaterThan(0) // окно осталось открытым — это и есть класс
    expect(now.violations).toEqual({})
    expect(now.coverage.games_with_dead).toBe(1) // то же окно смерти в выборке есть: чисто не от пустоты
  })

  it('на ed718f8 находит мьют «как в первый раз» повторно; на main того же сида — чисто', () => {
    const old = oracle(join(FIXTURES, 'mute-ed718f8')).verdict!
    const now = oracle(join(FIXTURES, 'mute-main')).verdict!
    expect(old.violations.mute_as_first_repeat).toBe(3) // первый мьют + три повторных с тем же текстом
    expect(old.coverage.mute_events).toBe(4) // окно не пусто: события мьюта в выборке есть
    expect(now.violations).toEqual({})
    expect(now.coverage.mute_events).toBe(4)
  })

  it('пустое окно называет себя, а не выглядит нулём нарушений', () => {
    const v = oracle(join(FIXTURES, 'main')).verdict!
    expect(v.coverage.blood_unexercised).toBe(1)
    const req = oracle(join(FIXTURES, 'main'), { ORACLE_REQUIRE: 'blood' })
    expect(req.code).not.toBe(0)
    expect(req.err).toMatch(/blood/)
    expect(oracle(join(FIXTURES, 'main'), { ORACLE_REQUIRE: 'dead' }).code).toBe(0)
  })
})

/** Фикстура с одной нарочно сломанной чертой — так проверку видно красной на настоящем кадре. */
function mutate(from: string, to: string, change: (d: { frames: Frame[]; rules: { deathGated: string[] } }) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-'))
  const d = JSON.parse(readFileSync(join(FIXTURES, from, `${MAIN}.world.json`), 'utf8'))
  change(d)
  writeFileSync(join(dir, `${MAIN}.world.json`), JSON.stringify(d))
  writeFileSync(join(dir, `${MAIN}.txt`), readFileSync(join(FIXTURES, to, `${MAIN}.txt`)))
  return dir
}

interface Said { w: string; k: string; r: string | null }
interface Frame { before: Record<string, unknown>; mem: Record<string, unknown>; said: Said[]; fired: { event: string; chosen: string[] }[]; away: string[] }
const deadFrame = (d: { frames: Frame[]; rules: { deathGated: string[] } }): Frame => {
  const gated = new Set(d.rules.deathGated)
  const f = d.frames.find((x) => x.before.alik_dead && x.mem.alik_dead && x.said.some((s) => s.w !== 'me' && s.r && gated.has(s.r)))!
  expect(f, 'в фикстуре не нашлось мёртвого хода с речью по гейтнутому правилу — контролю нечего ломать').toBeDefined()
  return f
}

describe('оракул: негативный контроль', () => {
  it('речь в окне смерти судится по правилу сообщения: чужое правило — находка, даже когда в ходе выбраны гейтнутые кнопка и Quiet', () => {
    const clean = oracle(join(FIXTURES, 'main')).verdict!
    expect(clean.violations.dead_speech).toBeUndefined()
    // кнопка игрока и молчащее Quiet_* остаются в fired — раньше они оправдывали весь ход
    const dir = mutate('main', 'main', (d) => {
      const f = deadFrame(d)
      expect(f.fired.some((h) => h.chosen.some((n) => /^(Opt_|Quiet_)/.test(n)))).toBe(true)
      for (const s of f.said) if (s.w !== 'me') s.r = 'Says_request'
    })
    expect(oracle(dir).verdict!.violations.dead_speech).toBeGreaterThan(0)
    // речь вне правил (r = null) — тоже находка
    const stray = mutate('main', 'main', (d) => { for (const s of deadFrame(d).said) if (s.w !== 'me') s.r = null })
    expect(oracle(stray).verdict!.violations.dead_speech).toBeGreaterThan(0)
  })

  it('сообщение самого игрока в мёртвом ходе — не речь Алика', () => {
    const dir = mutate('main', 'main', (d) => { const f = deadFrame(d); f.said = f.said.filter((s) => s.w === 'me').concat([{ w: 'me', k: 'text', r: null }]) })
    expect(oracle(dir).verdict!.violations.dead_speech).toBeUndefined()
    expect(oracle(dir).verdict!.coverage.games_with_dead).toBe(1)
  })

  it('снятый гейт смерти у правила хода или ответа — оракул краснеет на реальной партии', async () => {
    const { allRules } = await import('../content/rules')
    const ungate = (names: string[]) => {
      const saved = names.map((n) => { const r = allRules.find((x) => x.name === n)!; expect(r, n).toBeDefined(); return [r, r.when] as const })
      for (const [r] of saved) r.when = r.when.filter((c: Criterion) => c.key !== 'alik_dead')
      return () => { for (const [r, when] of saved) r.when = when }
    }
    // смерть — с первого хода: снятый гейт меняет траекторию, и естественная смерть может не наступить
    const dead = (g: Game) => { g.S.mem.alik_dead = true }
    const clean = oracle(await dump(9, 40, dead)).verdict!
    expect(clean.coverage.games_with_dead).toBe(1)
    expect(clean.violations.dead_speech).toBeUndefined()
    for (const names of [['Says_WhileDead'], ['Turn_WhileDead', 'Tone_WhileDead']]) {
      const restore = ungate(names)
      try {
        const v = oracle(await dump(9, 40, dead)).verdict!
        expect(v.coverage.games_with_dead, names.join()).toBe(1)
        expect(v.violations.dead_speech, names.join()).toBeGreaterThan(0)
      } finally { restore() }
    }
  }, 120_000)

  it('дамп без атрибуции речи (старый формат) не судит и говорит об этом', () => {
    const dir = mutate('main', 'main', (d) => { for (const f of d.frames) for (const s of f.said) delete (s as Partial<Said>).r })
    const v = oracle(dir).verdict!
    expect(v.violations.dead_speech).toBeUndefined()
    expect(v.coverage.games_without_speech_rules).toBe(1)
  })

  it('факт смерти, пропавший без шага серии, — находка; шаг серии тот же кадр оправдывает', () => {
    const dir = mutate('main', 'main', (d) => {
      const i = d.frames.findIndex((f) => f.before.alik_dead && !f.mem.alik_dead)!
      expect(i, 'в фикстуре не нашлось хода возвращения — контролю нечего ломать').toBeGreaterThan(0)
      d.frames[i].mem['arc.alik_death'] = d.frames[i].before['arc.alik_death'] // серия не шагнула
    })
    expect(oracle(dir).verdict!.violations.dead_fact_lost).toBe(1)
    expect(oracle(join(FIXTURES, 'main')).verdict!.violations.dead_fact_lost).toBeUndefined()
  })

  it('пачка непрочитанных при мёртвом Алике молчит по правилу — событие в дампе есть, сообщений нет', async () => {
    const dir = await dump(3, 2, async (g) => {
      g.S.mem['alik_dead'] = true
      await g.awayBurst(2, 1, 'Пока телефон заряжался')
    })
    const v = oracle(dir).verdict!
    expect(v.violations.dead_away_loud).toBeUndefined()
    expect(v.coverage.away_events).toBe(2) // окно не пусто: пачку пытались доставить дважды
    expect(v.coverage.away_messages).toBe(0)
    expect(v.coverage.away_unexercised).toBeUndefined()
  })

  it('сообщения пачки в кадре смерти — находка: проверка не зависит от того, каким путём они пришли', () => {
    const dir = mutate('main', 'main', (d) => {
      const f = d.frames.find((x) => x.before.alik_dead)!
      expect(f, 'в фикстуре не нашлось кадра смерти — контролю нечего ломать').toBeDefined()
      f.away = ['[12:00] Алик: Эээ, брат, ты спишь?']
    })
    expect(oracle(dir).verdict!.violations.dead_away_loud).toBe(1)
  })

  it('уведомление, показанное мимо выборщика, ловится по своему же условию', async () => {
    const text = 'Спасибо, что пришли сдать кровь! Вы наш герой. Приходите ещё.'
    const dir = await dump(5, 2, (g) => g.notify('🩸', 'Донорский центр', text))
    const v = oracle(dir).verdict!
    expect(v.violations.notif_gate_false).toBe(1)
    // та же партия без обхода гейта — чисто: проверка различает показанное и объявленное
    const clean = await dump(5, 2)
    expect(oracle(clean).verdict!.violations.notif_gate_false).toBeUndefined()
  })

  it('ход смерти через движок правил: дамп называет гейты — судить есть чем', async () => {
    const dir = await dump(9, 6, (g) => { g.S.mem['alik_dead'] = true })
    const v = oracle(dir).verdict!
    expect(v.coverage.games_with_dead).toBe(1)
    expect(v.coverage.games_without_rule_gates).toBeUndefined()
  })
})

/** Каждая проверка оракула — на партии из одной строки: выключил проверку — тест красный. */
const dead = (mem: Record<string, unknown>, extra: Partial<Frame> = {}) => ({
  frames: [{ at: 0, before: { alik_dead: true }, mem: { alik_dead: true, ...mem }, said: [], fired: [], sys: [], away: [], notif: [], ...extra }],
  rules: { deathGated: ['Says_WhileDead'] }, coverage: { dead_frames: 1 },
})
const muteFrame = (before: number, after: number, sys: string[]) => ({
  frames: [{ at: 0, before: { 'endgame.mutes': before }, mem: { 'endgame.mutes': after }, said: [], fired: [], sys, away: [], notif: [] }],
  rules: { deathGated: [] }, coverage: { had_mute: true },
})
const CASES: Record<string, { lines: string[]; world?: object; clean?: { lines?: string[]; world?: object } }> = {
  greet_off_hours: { lines: ['[10:00] Я: Добрый вечер, Алик'], clean: { lines: ['[19:00] Я: Добрый вечер, Алик'] } },
  boris_before_meet: { lines: ['[10:00] Алик: Борис передаёт привет'], clean: { lines: ['[10:00] Алик: Смотри, новый баран. Борис зовут', '[10:01] Алик: Борис передаёт привет'] } },
  arsen_before_meet: { lines: ['[10:00] Алик: Арсен уже едет'], clean: { lines: ['[10:00] Алик: Это мой племянник Арсен', '[10:01] Алик: Арсен уже едет'] } },
  meet_repeat: { lines: ['[10:00] Нуне (бухгалтер): Здравствуйте. Я Нуне', '[10:01] Нуне (бухгалтер): Здравствуйте. Я Нуне'], clean: { lines: ['[10:00] Нуне (бухгалтер): Здравствуйте. Я Нуне'] } },
  boris_writes_again: { lines: ['[10:00] Борис 🐏: Бее', '[10:01] Борис 🐏: Это Борис тебе написал. Сам!'], clean: { lines: ['[10:00] Борис 🐏: Это Борис тебе написал. Сам!', '[10:01] Борис 🐏: Бее'] } },
  once_scene_repeat: { lines: ['[10:00] Алик: Займи 5000 до пятницы', '[10:01] Алик: Займи 5000 до пятницы'], clean: { lines: ['[10:00] Алик: Займи 5000 до пятницы'] } },
  read_before_send: { lines: ['[10:30] Я: Алик, где деньги?', '[система] Прочитано в 09:03'], clean: { lines: ['[10:30] Я: Алик, где деньги?', '', '—— 2 марта 2027 г. ——', '[система] Прочитано в 09:03'] } },
  notif_event_repeat: { lines: ['(уведомление телефона: 🏦 Банк — Штраф за терпение)', '(уведомление телефона: 🏦 Банк — Штраф за терпение)'], clean: { lines: ['(уведомление телефона: 🏦 Банк — Штраф за терпение)'] } },
  same_day_repeat: {
    lines: ['(уведомление телефона: 🏦 Банк — Списание 550 ₽. Связь. Баланс: 9 700 ₽)', '(уведомление телефона: 🏦 Банк — Списание 550 ₽. Связь. Баланс: 9 150 ₽)'],
    clean: { lines: ['(уведомление телефона: 🏦 Банк — Списание 550 ₽. Связь. Баланс: 9 700 ₽)', '', '—— 2 марта 2027 г. ——', '(уведомление телефона: 🏦 Банк — Списание 550 ₽. Связь. Баланс: 9 150 ₽)'] },
  },
  notif_flood: {
    lines: ['[10:00] Алик: Завтра', '(уведомление телефона: 🏦 Банк — Списание 550 ₽. Связь. Баланс: 9 700 ₽)'],
    clean: { lines: ['[10:00] Алик: Завтра', '[10:01] Алик: Честно', '[10:02] Борис 🐏: Бее', '[10:03] Алик: Мамой клянусь', '(уведомление телефона: 🏦 Банк — Списание 550 ₽. Связь. Баланс: 9 700 ₽)'] },
  },
  landlord_after_evict: { lines: ['[10:00] Алик: Выселяю тебя, брат', '(уведомление телефона: 🏠 Хозяин — Жду до пятницы)'], clean: { lines: ['(уведомление телефона: 🏠 Хозяин — Жду до пятницы)'] } },
  friday_without_fact: {
    lines: ['[10:00] Алик: Вы же обещали в пятницу'],
    world: { frames: [{ at: 5, before: {}, mem: {}, said: [], fired: [] }], rules: { deathGated: [] }, coverage: {} },
    clean: { world: { frames: [{ at: 5, before: { 'said.friday': true }, mem: {}, said: [], fired: [] }], rules: { deathGated: [] }, coverage: {} } },
  },
  dead_payday: { lines: [], world: dead({ 'payday.at': 400 }), clean: { world: dead({}) } },
  mute_as_first_repeat: { lines: [], world: muteFrame(1, 2, ['Вы отключили уведомления']), clean: { world: muteFrame(0, 1, ['Вы отключили уведомления']) } },
  mute_second_as_first: { lines: [], world: muteFrame(0, 1, ['Вы отключили их ещё раз']), clean: { world: muteFrame(1, 2, ['Вы отключили их ещё раз']) } },
}

describe('оракул: сторож у каждой проверки', () => {
  for (const [name, c] of Object.entries(CASES)) {
    it(`${name}: одна строка — находка; та же без дефекта — чисто`, () => {
      expect(oracle(synthetic(c.lines, c.world)).verdict!.violations[name], name).toBeGreaterThanOrEqual(1)
      const clean = c.clean ?? {}
      expect(oracle(synthetic(clean.lines ?? c.lines, clean.world ?? c.world)).verdict!.violations[name], `${name} без дефекта`).toBeUndefined()
    })
  }
  it('счётчик Дня выплаты растёт в один день — это механика, а не повтор', () => {
    const payday = ['[система] К выплате: 90 000 ₽', '[система] К выплате: 210 000 ₽']
    expect(oracle(synthetic(payday)).verdict!.violations.same_day_repeat).toBeUndefined()
    expect(oracle(synthetic(['[система] Алик скрыл от вас статус', '[система] Алик скрыл от вас статус'])).verdict!.violations.same_day_repeat).toBe(1)
  })
  it('Поступление — повторяемое; два перевода подряд не notif_event_repeat', () => {
    const lines = [
      '(уведомление телефона: 🏦 Банк — Поступление 50 ₽. Перевод от Алика. Баланс: 12 450 ₽)',
      '(уведомление телефона: 🏦 Банк — Поступление 50 ₽. Перевод от Алика. Баланс: 12 500 ₽)',
    ]
    expect(oracle(synthetic(lines)).verdict!.violations.notif_event_repeat).toBeUndefined()
  })
  it('факты на момент сообщения: после последнего кадра — его «после», а не пустота', () => {
    const late = (mem: Record<string, unknown>) => ({ frames: [{ at: 0, before: {}, mem, said: [], fired: [] }], rules: { deathGated: [] }, coverage: {} })
    const line = ['[10:00] Алик: Вы же обещали в пятницу']
    expect(oracle(synthetic(line, late({ 'said.friday': true }))).verdict!.violations.friday_without_fact).toBeUndefined()
    expect(oracle(synthetic(line, late({}))).verdict!.violations.friday_without_fact).toBe(1)
  })
  it('партий нет — ошибка, а не «чисто»; опечатка в ORACLE_REQUIRE — ошибка, а не тихий ноль', () => {
    const empty = oracle(mkdtempSync(join(tmpdir(), 'oracle-')))
    expect(empty.code).not.toBe(0)
    expect(empty.err).toMatch(/нет партий/)
    const typo = oracle(join(FIXTURES, 'main'), { ORACLE_REQUIRE: 'daed' })
    expect(typo.code).not.toBe(0)
    expect(typo.err).toMatch(/неизвестное окно/)
  })
})

describe('оракул: опорные фразы', () => {
  const src = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? src(p) : /\.(ts|tsx)$/.test(n) ? [readFileSync(p, 'utf8')] : []
    })

  it('каждая фраза оракула всё ещё есть в исходниках игры — иначе проверка осиротела молча', () => {
    const r = spawnSync('python3', [ORACLE, '--markers'], { encoding: 'utf8' })
    const { markers, anchors } = JSON.parse(r.stdout) as { markers: Record<string, string>; anchors: Record<string, string> }
    expect(Object.keys(anchors).sort()).toEqual(Object.keys(markers).sort())
    const game = src('src').join('\n')
    const dead = Object.entries(anchors).filter(([, a]) => !game.includes(a)).map(([k]) => k)
    expect(dead, 'фразы исчезли из игры — обнови MARKERS в oracle.py').toEqual([])
  })
})
