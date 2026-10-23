// #1270: кнопка-действие (окно события: чайник, варианты сцены — парковка, коза, хаш и т.п.) — лейбл,
// а не реплика игрока: суффикс-хвост «Очень жду.»/«🙏» к ней не клеится. Окно определяет условие
// оффера `<событие>Fresh` (isEventWindow — тот же признак, что у реестра first-windows), а сцену —
// сама навигация; кнопки срока и текстовые пулы остаются речью, и хвост у них остаётся.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { valueOf } from './fact'
import { P_KETTLE } from './rules/player-choice-pools'
import { PLAYER_SUFFIX } from './misc'
import type { Msg } from '../engine/state'

const tail = (t: string): string => PLAYER_SUFFIX.find((s) => t.endsWith(s)) ?? ''

describe('кнопки-действия без хвостов игрока (#1270)', () => {
  it('движок: текстовая реплика в окне повтора получает хвост, лейбл действия — нет', () => {
    const { game } = makeGame()
    const line = 'Забрать чайник у кума'
    // строка показана в прошлом ходу: окно дословного повтора (#824) ещё держит её
    game.S.stats.sent = 5
    game.rememberShown(line)
    game.S.stats.sent = 6
    const text = game.playerLine(() => line)
    expect(text.startsWith(line), 'реплика осталась узнаваемой').toBe(true)
    expect(tail(text), 'текстовая реплика перефразируется хвостом').not.toBe('')
    // тот же путь в режиме лейбла: хвост не клеится, строка пула остаётся как есть
    game.S.stats.sent = 5
    game.rememberShown(line)
    game.S.stats.sent = 6
    expect(game.actionLabel(() => game.playerLine(() => line))).toBe(line)
  })

  it('вариант сцены — навигация, а не реплика: хвост не клеится (#1270)', async () => {
    const { game } = makeGame()
    const line = 'Стою, занимаю' // «занять место на парковке», q_parking
    await game.enterNode('q_parking', game.scenes.q_parking.start)
    game.S.choices = null
    // строка уже показывалась в прошлом ходу — окно повтора (#824) держит её и раньше клеило хвост
    game.rememberShown(line)
    game.S.stats.sent += 1
    game.S.choices = null
    const option = game.choices.find((c) => c.go === 'wait')
    expect(option, 'вариант парковки не показан').toBeDefined()
    expect(option!.text).toBe(line)
    expect(tail(option!.text), '«Стою, занимаю Очень жду.» — две реплики на одной кнопке').toBe('')
  })

  it('окно чайника: в блоке и в «Я:» — строка пула без хвоста (#1270, #1283)', async () => {
    const { game } = makeGame({ seed: 7 })
    await game.enterNode('q_lottery', 'draw')
    const at = Number(game.S.mem['lottery.kettleAt'])
    const pool: string[] = P_KETTLE.map(valueOf)
    // окно — ход события и три после; сборка блока зовётся несколько раз за ход. Пересчёт того же хода
    // отдаёт ту же строку пула (#1283): кнопка не меняется и не съедает следующую строку окна под пальцем,
    // а раньше именно здесь на исчерпанной колоде к лейблу приклеивался хвост
    game.S.stats.sent = at
    let first = ''
    for (let build = 0; build < 3; build++) {
      game.S.choices = null
      const kettle = game.buildChoices().find((x) => x.act === 'kettle')
      expect(kettle, `сборка ${build}: кнопка ушла из окна`).toBeDefined()
      expect(pool, `«${kettle!.text}» — не строка пула`).toContain(kettle!.text)
      expect(tail(kettle!.text), '«Забрать чайник у кума Очень жду.» — две реплики на одной кнопке').toBe('')
      if (build === 0) first = kettle!.text
      else expect(kettle!.text, 'пересчёт хода сменил строку пула').toBe(first)
    }
    // следующий ход окна — вторая и последняя строка пула: внутри окна строка не повторяется (#1283)
    game.S.stats.sent = at + 1
    game.S.choices = null
    const next = game.buildChoices().find((x) => x.act === 'kettle')
    expect(next, 'на втором ходу окна кнопки нет').toBeDefined()
    expect(next!.text, 'строка пула повторилась внутри окна').not.toBe(first)
    expect(pool, `«${next!.text}» — не строка пула`).toContain(next!.text)
    expect(tail(next!.text), 'у второй строки тоже не должно быть хвоста').toBe('')
    // отправка: в «Я:» тот же лейбл, без хвоста
    game.S.stats.sent = at
    game.S.choices = null
    const send = game.buildChoices().find((x) => x.act === 'kettle')!
    const from = game.S.msgs.length
    await game.send(send)
    const mine = game.S.msgs.slice(from).find((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text' && m.from === 'me')
    expect(mine?.text).toBe(send.text)
    expect(tail(send.text), 'лента несёт тот же лейбл, что и кнопка').toBe('')
  })
})
