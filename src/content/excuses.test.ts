// #731: имя говорящего в начале реплики не теряет заглавную после префикса.
// Префикс («Алик, », «Слушайте, »…) клеится декором (playerDecor/alikDecor в game.ts), и `low`
// понижает первую букву — кроме имён из NAME_RE. Корпус — CAST, не список-образец: новый говорящий
// в CAST без записи в NAME_RE краснит тест, а не молчит в партии.
import { describe, expect, it } from 'vitest'
import { CAST } from './arcs'
import { D, low } from './excuses'
import { valueOf } from './fact'
import { makeGame } from '../test/helpers'

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
