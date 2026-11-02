// Правки ручного плейтеста оператора 02.11 (#1674): четыре строки пулов кнопок — «на объектах»,
// «головой вниз», «точно вы, Алик?», ответ Серёге про срок «до зарплаты». У каждой правки свой
// сторож: строка закреплена дословно на своём месте в пуле (вернуть старую форму — красный),
// стебель не совпадает с соседней строкой, а KEY_OUT-строка про малыша по-прежнему предлагается
// только на сроке «как ключ выйдет».
import { describe, it, expect, vi } from 'vitest'
import { makeGame } from '../test/helpers'
import { D, type When } from './excuses'
import { LEGENDS } from './legends'
import { P_HH_JOB, P_SERYOGA_LOAN } from './rules/player-choice-pools'
import { valueOf } from './fact'
import { buttonStem } from '../tools/playtest'

const texts = (pool: readonly unknown[]): string[] => pool.map((e) => String(valueOf(e as never)))

/** Строка стоит в пуле дословно, на своём месте, и её стебель не совпадает с соседями. */
const anchor = (pool: readonly unknown[], line: string, at: number): void => {
  const lines = texts(pool)
  expect(lines[at], `порядок пула сдвинулся: ${lines[at]}`).toBe(line)
  const same = lines.filter((t) => buttonStem(t) === buttonStem(line))
  expect(same, `стебель строки не уникален: ${line}`).toHaveLength(1)
}

/** Тексты вариантов срока, которые игра показывает на этом сроке (путь клятвы, как в whenbuttons). */
async function offered(w: When): Promise<string[]> {
  const { game } = makeGame()
  vi.spyOn(game.X, 'promise').mockImplementation(() => ({ text: `${w.t} — отдам`, ...w }))
  await game.promiseLine()
  const shown = new Set<string>()
  for (let i = 0; i < 80; i++) {
    game.S.choices = null
    for (const c of game.buildChoices()) if (c.act?.startsWith('promise')) shown.add(c.text)
  }
  return [...shown]
}

describe('плейтест 02.11: строки пулов кнопок (#1674)', () => {
  it('№2: сомнение в отмазке говорит про объекты, а не про один объект', () => {
    const line = 'Алик, это отмазка, я же не первый день на объектах.'
    anchor(D.P_DOUBT, line, 2)
    expect(texts(D.P_DOUBT), 'старая форма вернулась').not.toContain('Алик, это отмазка, я же не первый день на объекте.')
    // разнообразие пула сохранено: «стройка» осталась у своих двух строк, третьей правка не завела
    expect(texts(D.P_DOUBT).filter((t) => /на стройке/.test(t)), texts(D.P_DOUBT).join(' | ')).toHaveLength(2)
  })

  it('№3: ключ у малыша — «головой вниз», а гейт KEY_OUT решает, когда строка звучит', async () => {
    const line = 'А если малыша головой вниз? Аккуратно.'
    anchor(D.P_WHEN_NEVER, line, 2)
    expect(texts(D.P_WHEN_NEVER), 'старая форма вернулась').not.toContain('А если малыша ключом вниз? Аккуратно.')
    // на своём сроке строка предлагается
    const key = await offered(LEGENDS.safe_baby.until)
    expect(key.some((t) => t.includes('малыша головой вниз')), `строки нет на своём сроке: ${key.join(' | ')}`).toBe(true)
    // на чужом «никогда» — нет: снятый гейт вернул бы шутку про ключ в каждый never-блок
    const other = await offered({ t: 'как отопление дадут', d: null, kind: 'never' })
    expect(other.length, 'чужой срок не показал вариантов — проверка пустеет').toBeGreaterThan(0)
    expect(other.some((t) => t.includes('малыша головой вниз')), `строка вышла на чужом сроке: ${other.join(' | ')}`).toBe(false)
  })

  it('№5: вакансия hh.ru спрашивает «точно вы, Алик?», старая форма не вернулась', () => {
    const line = '150 000 в пятницу. А работодатель точно вы, Алик?'
    anchor(P_HH_JOB, line, 1)
    expect(texts(P_HH_JOB), 'старая форма вернулась').not.toContain('150 000 в пятницу. А работодатель точно не вы, Алик?')
  })

  it('№6: ответ Серёге спрашивает срок «до зарплаты» и не цитирует «завтра»', () => {
    const line = 'Серёга, а «до зарплаты» — это когда? Назови дату.'
    anchor(P_SERYOGA_LOAN, line, 3)
    expect(texts(P_SERYOGA_LOAN), 'старая форма вернулась').not.toContain('Серёга, а можно сразу назвать дату, без слова «завтра»?')
    // срок вопроса — из карточки Серёги («займи до зарплаты»); мем обещаний Алика в пул не вернулся
    expect(line).toContain('до зарплаты')
    expect(texts(P_SERYOGA_LOAN).join(' | '), '«завтра» в пуле снова звучит').not.toMatch(/завтра/i)
  })
})

/** Проверка ниже держит саму аренду файла: правки не должны менять гейты и соседние строки пулов. */
describe('плейтест 02.11: соседние строки пулов не тронуты (#1674)', () => {
  it('P_HH_JOB и P_SERYOGA_LOAN сохранили прежние соседние строки', () => {
    expect(texts(P_HH_JOB)).toEqual([
      'Откликаюсь. Аванс сразу дадите или его тоже до пятницы ждать?',
      '150 000 в пятницу. А работодатель точно вы, Алик?',
      'Откликнуться — можно. А работать кто будет, Алик?',
      'Готов выйти. Пятница — это у вас когда, по какому календарю?',
    ])
    expect(texts(P_SERYOGA_LOAN)).toEqual([
      'Серёга, Алик заплатит — тогда смогу одолжить. Сам знаешь, какой это срок.',
      'Серёга, а работодатель у тебя точно платит? Или тоже обещает?',
      'Серёга, сначала дождись зарплаты. Схема с «потом» мне не нравится.',
      'Серёга, а «до зарплаты» — это когда? Назови дату.',
    ])
  })
})
