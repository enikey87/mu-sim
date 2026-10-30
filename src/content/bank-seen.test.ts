// «Свечка за ваш банк» (#1618): вежливая строка ссылается на банк только после того, как игрок увидел
// банковскую карточку. В интро «деньги наличными, в конверте» банк не входит в завязку — до первой
// сводки (около 14-го дня) строка выходила раньше любого упоминания банка.
import { describe, it, expect } from 'vitest'
import { makeGame, cards } from '../test/helpers'
import { D } from './excuses'
import { bankSeen } from './memkeys'
import { is } from './fact'

const LINE = 'Я поставил свечку за ваш банк. На всякий случай.'

describe('банк входит в историю своей карточкой (#1618)', () => {
  it('до первой карточки банка строки нет в блоке — после сводки есть', () => {
    const { game } = makeGame()
    expect(game.open(D.P_POL_B), 'банк ещё не звучал').not.toContain(LINE)
    expect(game.holds(is(bankSeen)), 'метки знакомства нет').toBe(false)
    game.notify('🏦', 'Банк', 'Сводка за неделю 01.01–07.01: баланс 12 000 ₽', { event: 'bank.summary' })
    expect(game.S.mem[bankSeen], 'карточка в ленте — метка поставлена').toBe(true)
    expect(game.open(D.P_POL_B), 'банк звучал').toContain(LINE)
  })

  it('недельная сводка самой партии — тоже первое банковское событие', () => {
    const { game } = makeGame()
    game.adjustMoney(-400, 'Связь', { group: 'Связь' })
    game.S.day += 7
    game.flushBankWeek()
    expect(cards(game, 'Банк').at(-1)?.event, 'сводка ушла в ленту').toBe('bank.summary')
    expect(game.open(D.P_POL_B)).toContain(LINE)
  })

  it('сохранение до метки: карточка банка в ленте — строка доступна (миграция)', () => {
    const first = makeGame()
    first.game.notify('🏦', 'Банк', 'Сводка за неделю 01.01–07.01: баланс 12 000 ₽', { event: 'bank.summary' })
    delete first.game.S.mem[bankSeen] // как в сохранении, сделанном до #1618
    first.game.save()
    const { game } = makeGame({ storage: first.storage })
    expect(game.open(D.P_POL_B)).toContain(LINE)
  })
})
