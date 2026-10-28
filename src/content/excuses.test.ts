// #731: имя говорящего в начале реплики не теряет заглавную после префикса.
// Префикс («Алик, », «Слушайте, »…) клеится декором (playerDecor/alikDecor в game.ts), и `low`
// понижает первую букву — кроме имён из NAME_RE. Корпус — CAST, не список-образец: новый говорящий
// в CAST без записи в NAME_RE краснит тест, а не молчит в партии.
import { describe, expect, it } from 'vitest'
import { CAST } from './arcs'
import { D, low, make, type DrawFn } from './excuses'
import { valueOf, type Entry } from './fact'
import { PLAYER_ADDRESSEES } from './misc'
import { allPlayerPools, PLAYER_CHOICE_POOLS, PLAYER_PAIR_POOLS } from './player-pools'
import { forEachSceneOpt } from './scene-walk'
import { makeGame } from '../test/helpers'

it('холодное обращение подходит благодарности при входе в режим и выходе из него', () => {
  expect(D.ADDR_COLD.length).toBeGreaterThan(0)
  for (let i = 0; i < D.ADDR_COLD.length; i++) {
    let cold = false
    const draw: DrawFn = (key, pool) => valueOf(pool[key === 'ADDR_COLD' ? i : 0])
    const x = make(draw, undefined, undefined, () => cold)
    const relative = x.rel()
    const warm = x.congrats(relative)
    cold = true
    const thanks = x.congrats(relative)
    expect(thanks).toMatch(/^Спасибо, [^!]+! /)
    expect(thanks).not.toMatch(/^Спасибо, (?:к сведению|по существу|официально)!/)
    expect(thanks).not.toBe(warm)
    cold = false
    expect(x.congrats(relative)).toBe(warm)
  }
})

/** Имя говорящего — последнее слово с заглавной в отображаемом имени: «Заказчик Грант» → «Грант».
 *  Роль-титул (Заказчик, Прораб, Мама, Коллекторы…) именем не считается: «…, Мама рядом стоит…»,
 *  «…, Коллекторы приехали…» — там это обычное слово, и заглавная в середине фразы была бы ошибкой. */
const speakerName = (display: string): string => {
  const words = display.match(/[А-ЯЁ][А-Яа-яЁё-]*/g) ?? []
  return words[words.length - 1] ?? ''
}

describe('имя говорящего после префикса (#731)', () => {
  it('у каждого говорящего из CAST имя переживает low — иначе строка звучит «Алик, тарон звонил»', () => {
    for (const c of Object.values(CAST)) {
      const name = speakerName(c.name)
      expect(name, `не нашлось имени в «${c.name}»`).not.toBe('')
      expect(low(`${name} проверил`), `${c.name}: ${name}`).toBe(`${name} проверил`)
    }
  })
})

describe('кот Алика в репликах введён на месте (#937)', () => {
  // Плейтест 67 (сид 161117): «Даже кот ушёл из комнаты» без ввода кота — реплика ссылалась
  // на кота, которого в партии не было. В личных пулах (обиженные ответы и разовые заявления)
  // кот в строке обязан вводиться здесь же («мой кот», «а он мой»), либо кота в строке нет;
  // кот игрока — не аргумент для комнаты Алика. Пул EVENT не смотрим: это события деревни
  // («похороны кота, очень уважаемый был кот») — про чужих котов, ввода не требуют.
  it('упоминание кота самодостаточно: «мой кот» / «он мой», либо кота нет', () => {
    const walk = (x: unknown): string[] => {
      if (typeof x === 'string') return [x]
      if (Array.isArray(x)) return x.flatMap(walk)
      if (x && typeof x === 'object') {
        if ('t' in (x as Record<string, unknown>)) return walk((x as Record<string, unknown>).t)
        return []
      }
      return []
    }
    const personal = ['OFF_A', 'OFF_B', 'OFF_ONCE'].flatMap((k) => walk(D[k]))
    expect(personal.length, 'личные пулы не пусты — проверка была бы пустой').toBeGreaterThan(10)
    // граница слова по-кириллически: JS \b кириллицу словом не считает
    const hasCat = /(^|[^а-яё])кот([^а-яё]|$)/i
    for (const line of personal) {
      if (!hasCat.test(line)) continue
      expect(line, `кот без ввода: «${line}»`).toMatch(/мой кот|он мой/i)
    }
  })
})

describe('сервиз тёти Гоар — только после тамада-квеста (#1046)', () => {
  const line = 'Ты мне сердце разбил. Как сервиз тёти Гоар.'
  it('знакомства по козе мало; после q_tamada строка открывается', async () => {
    const { game } = makeGame()
    expect(D.OFF_A.map(valueOf), 'строки нет в пуле — проверка пустеет').toContain(line)
    await game.enterNode('q_goat', 'ask') // реальный путь знакомства: коза на крыше, тамады не было
    expect(game.S.mem['intro.goar'], 'Гоар не вошла в историю — проверка пустеет').toBe(true)
    expect(game.S.ach['q_tamada'], 'тамада уже сыграна — проверка не про то').toBeUndefined()
    expect(game.open(D.OFF_A), 'сервиз-строка без тамада-сюжета').not.toContain(line)
    await game.enterNode('q_tamada', 'yes') // сервиз разбит: ачивка q_tamada
    expect(game.S.ach['q_tamada'], 'тамада-квест не сыграл').toBeDefined()
    expect(game.open(D.OFF_A), 'сервиз-строка после тамады').toContain(line)
  })
})

// #1108: строка кнопки, которая сама обращается к третьему лицу («Тарон, я всё прочитал…»), не должна
// получать префикс-обращение к Алику: иначе адресатов двое. Список ведёт misc.PLAYER_ADDRESSEES,
// а корпус проверки — пулы кнопок и сцены: имя касты, прозвучавшее вокативом, обязано быть в списке.
describe('вокатив третьему лицу не адресуется Алику (#1108)', () => {
  const castNames = new Set(Object.values(CAST).map((c) => speakerName(c.name)))

  /** Строки кнопок игрока из всех источников, которые рисует buildChoices. */
  const playerLines = (): string[] => {
    const out: string[] = []
    const add = (e: unknown): void => {
      const v = valueOf(e as never) as unknown
      if (typeof v === 'string') { out.push(v); return }
      if (Array.isArray(v)) { if (v.length) add(v[0]); return } // пара [игрок, Алик] — берём реплику игрока
      if (v && typeof v === 'object' && 't' in v) {
        const t = (v as { t: unknown }).t
        if (typeof t === 'string') out.push(t)
      }
    }
    for (const arr of allPlayerPools().values()) for (const e of arr) add(e)
    for (const arr of Object.values(PLAYER_CHOICE_POOLS)) for (const e of arr as readonly unknown[]) add(e)
    for (const arr of Object.values(PLAYER_PAIR_POOLS)) for (const e of arr as readonly unknown[]) add(e)
    forEachSceneOpt(({ text }) => { add(text) })
    return out
  }

  it('имя касты в начале строки-пула — в списке PLAYER_ADDRESSEES', () => {
    const lines = playerLines()
    expect(lines.length, 'корпус кнопок собран — проверка не пустая').toBeGreaterThan(400)
    const bad: string[] = []
    for (const l of lines) {
      const m = /^([А-ЯЁ][А-Яа-яЁё-]*),/.exec(l)
      if (!m || !castNames.has(m[1]!)) continue
      if (!PLAYER_ADDRESSEES.has(m[1]!)) bad.push(`«${l}» — нет имени «${m[1]}»`)
    }
    expect(bad, 'вокатив вне списка получит «Алик, » перед обращением').toEqual([])
  })

  it('каждое имя списка — имя касты: опечатка в списке ловится, а не молчит', () => {
    for (const n of PLAYER_ADDRESSEES) expect([...castNames], n).toContain(n)
  })

  it('вокатив не получает префикс, а сообщение о том же человеке — получает', () => {
    const { game } = makeGame()
    const vocative = 'Тарон, я всё прочитал. Мне не заплатили — это я понял.'
    const about = 'Тарон писал: всем заплатили. Кроме меня.'
    for (let i = 0; i < 40; i++) {
      expect(game.playerDecor(vocative), 'вокатив — без префикса и без обращения к Алику').toBe(vocative)
      expect(game.playerDecor(about), 'строка-сообщение о Тароне декорируется префиксом').toMatch(/^(Алик, |Слушайте, |Так, |Эм… |Алик-джан, |Секунду\. )Тарон писал/)
    }
  })
})

// #1329: отмазка называла «бабушку Асмик» до её введения в партии (живая рецензия №6, день 194).
// Единственное событие, которое её вводит, — открытка с носками; имя в D.REL ждёт его факта.
describe('бабушка Асмик — в отмазке только после своей карточки (#1329)', () => {
  const ASMIK = 'бабушка Асмик|бабушки Асмик'
  it('до карточки имя закрыто, карточка ставит факт и открывает его', async () => {
    const { game } = makeGame({ seed: 5 })
    expect(D.REL.map(valueOf), 'строки нет в пуле — проверка пустеет').toContain(ASMIK)
    expect(game.open(D.REL as Entry<string>[]), 'имя до введения бабушки').not.toContain(ASMIK)
    let arrived = false
    for (let i = 0; i < 30 && !arrived; i++) {
      await game.forward()
      arrived = game.S.mem['asmik.card'] === true
    }
    expect(arrived, 'карточка бабушки Асмик не пришла за 30 пересылок — проверка пустеет').toBe(true)
    expect(game.open(D.REL as Entry<string>[]), 'имя после карточки').toContain(ASMIK)
  })
})
