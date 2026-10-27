// Коллекция концовок — отметка устройства, а не партии (#1437): «Начать заново» её не стирает,
// в облако она не едет (cloud.storage пишет в облако только SAVE_KEY).
import { describe, expect, it } from 'vitest'
import { ENDINGS_SEEN_KEY, endingsOnDevice, withEndingOnDevice } from './state'
import { Game } from './game'
import { manualClock } from './clock'
import { seededRng } from './rng'
import { makeGame } from '../test/helpers'
import { ENDINGS } from '../content/finales'

describe('отметка устройства: чтение и запись', () => {
  it('битая отметка — пустая коллекция, а не падение: строка переживает версии сборки', () => {
    for (const raw of [null, '', 'не json', '{"family":1}', '"family"', '[1,2,null]']) {
      expect([...endingsOnDevice(raw)]).toEqual([])
    }
    expect([...endingsOnDevice('["family", 7, null]')]).toEqual(['family'])
  })

  it('новая концовка добавляется к прежним, а повтор той же не двоится', () => {
    const one = withEndingOnDevice(null, 'family')
    expect([...endingsOnDevice(one)]).toEqual(['family'])
    const two = withEndingOnDevice(one, 'honest')
    expect([...endingsOnDevice(two)]).toEqual(['family', 'honest'])
    expect([...endingsOnDevice(withEndingOnDevice(two, 'family'))]).toEqual(['family', 'honest'])
  })
})

describe('коллекция концовок переживает партию (#1437)', () => {
  it('достигнутая концовка ложится на устройство и остаётся после сброса партии', async () => {
    const { game, storage } = makeGame()
    await game.reachEnding('family')
    expect([...endingsOnDevice(storage.getItem(ENDINGS_SEEN_KEY))]).toEqual(['family'])

    game.reset()
    expect([...endingsOnDevice(storage.getItem(ENDINGS_SEEN_KEY))], 'сброс партии не стирает коллекцию').toEqual(['family'])
    // новая партия на том же устройстве: партия пустая, коллекция — нет
    const next = makeGame({ storage }).game
    expect(Object.keys(next.S.endings)).toEqual([])
    expect([...next.endingsSeen()]).toEqual(['family'])
    expect(next.S.endings, 'партия не приписывает себе чужую концовку').toEqual({})
  })

  it('коллекция из прежнего сохранения переезжает в отметку при сбросе, а не теряется', () => {
    const { game, storage } = makeGame()
    // сохранение до #1437: концовки копились только в партии
    game.S.endings.family = game.S.day
    game.S.endings.honest = game.S.day
    game.reset()
    expect([...endingsOnDevice(storage.getItem(ENDINGS_SEEN_KEY))].sort()).toEqual(['family', 'honest'])
  })

  it('без хранилища устройства игра не падает и коллекцию не выдумывает', async () => {
    const game = new Game({ hour: 14, noTimers: true, typos: false, storage: null, clock: manualClock(), rng: seededRng(1) })
    await game.reachEnding('family')
    expect([...game.endingsSeen()]).toEqual([])
    expect(game.S.endings.family).toBe(game.S.day)
  })

  it('id в отметке — те же, что в реестре концовок: галерея берёт список оттуда', () => {
    // отметка хранит любые строки, а показывает их реестр ENDINGS — иначе закрытая концовка «открылась» бы опечаткой
    const raw = withEndingOnDevice(null, 'family')
    expect(ENDINGS.some((e) => e.id === 'family')).toBe(true)
    expect([...endingsOnDevice(raw)].every((id) => ENDINGS.some((e) => e.id === id))).toBe(true)
  })
})
