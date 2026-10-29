// @vitest-environment jsdom
// #1483: воронка «займи 50» — показ из движка, нажатие и подтверждение покупки из интерфейса.
// Приёмник подставной: живая Метрика не зовётся.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { App } from '../ui/App'
import { makeGame, flush } from '../test/helpers'
import { enable, GAME_HOST } from './metrics'
import { adoptPlatform, webPlatform } from '../platform'
import { LEND50_LINK, LEND50_SYS, LEND50_VK_SYS, LEND50_YA_SYS } from '../content/endgame'
import type { Game } from '../engine/game'

/** Цели, дошедшие до приёмника: [имя, параметры]. */
const setup = () => {
  const calls: unknown[][] = []
  ;(globalThis as { ym?: unknown }).ym = (...args: unknown[]) => { calls.push(args) }
  enable({ host: GAME_HOST, search: '', id: '4242' })
  const goals = () => calls
    .filter((c) => c[1] === 'reachGoal')
    .map((c) => [String(c[2]), c[3] as Record<string, unknown>] as [string, Record<string, unknown>])
  return { calls, goals }
}

const funnel = (goals: ReturnType<typeof setup>['goals']) =>
  goals().filter(([name]) => name.startsWith('lend50_'))

const renderApp = (game: Game) => render(<App game={game} onReset={vi.fn()} />)

beforeEach(() => {
  delete (globalThis as { ym?: unknown }).ym
  enable({ host: '', search: '', id: '' })
})

afterEach(() => {
  cleanup()
  adoptPlatform(webPlatform())
  delete (globalThis as { ym?: unknown }).ym
  enable({ host: '', search: '', id: '' })
})

describe('воронка «займи 50»: показ → нажатие → покупка (#1483)', () => {
  it('показ считает движок: одна цель на партию, витрина партии в параметре', async () => {
    const { goals } = setup()
    const { game } = makeGame({ seed: 2, platformId: 'vk', externalPay: false, joinGroup: true })
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    await act(async () => { await game.closeEnding(); await flush() })
    expect(funnel(goals)).toEqual([['lend50_shown', { platform: 'vk' }]])
  })

  it('веб: ссылка DonationAlerts — только нажатие, оплату внешнего перевода никто не подтверждает', () => {
    const { goals } = setup()
    const { game } = makeGame({ seed: 2 })
    game.push({ kind: 'lend50', text: LEND50_SYS, link: LEND50_LINK })
    renderApp(game)
    fireEvent.click(screen.getByRole('link', { name: 'Перевести' }))
    expect(funnel(goals)).toEqual([['lend50_clicked', { platform: 'web' }]])
  })

  it('Telegram: две карточки — один показ, а нажатие DA остаётся только нажатием (#1533)', async () => {
    const openLink = vi.fn(() => true)
    adoptPlatform({ ...webPlatform(), id: 'telegram', externalPay: true, openLink })
    try {
      const { goals } = setup()
      const { game } = makeGame({ seed: 2, platformId: 'telegram', externalPay: true, pay50: 'telegram' })
      game.S.ending = 'payday_default'
      game.S.endings.payday_default = game.S.day
      await act(async () => { await game.closeEnding(); await flush() })
      expect(funnel(goals), 'показ — один, хотя карточек в ленте две').toEqual([['lend50_shown', { platform: 'telegram' }]])

      renderApp(game)
      fireEvent.click(screen.getByRole('link', { name: 'Перевести' }))
      expect(openLink, 'ссылка идёт входом клиента').toHaveBeenCalledWith(LEND50_LINK)
      expect(funnel(goals), 'внешний донат — только клик: оплату игра не подтверждает').toEqual([
        ['lend50_shown', { platform: 'telegram' }],
        ['lend50_clicked', { platform: 'telegram' }],
      ])
    } finally {
      adoptPlatform(webPlatform())
    }
  })

  it('VK: подтверждённое вступление — нажатие и покупка', async () => {
    const joinGroup = vi.fn(async () => true)
    adoptPlatform({ ...webPlatform(), id: 'vk', externalPay: false, joinGroup })
    const { goals } = setup()
    const { game } = makeGame({ seed: 2, platformId: 'vk', externalPay: false, joinGroup: true })
    game.push({ kind: 'lend50', text: LEND50_VK_SYS, join: true })
    renderApp(game)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Вступить в сообщество игры' })) })
    await act(async () => { await flush() })
    expect(funnel(goals)).toEqual([
      ['lend50_clicked', { platform: 'vk' }],
      ['lend50_paid', { platform: 'vk' }],
    ])
  })

  it('VK: отказ площадки оставляет воронку на нажатии', async () => {
    const joinGroup = vi.fn(async () => false)
    adoptPlatform({ ...webPlatform(), id: 'vk', externalPay: false, joinGroup })
    const { goals } = setup()
    const { game } = makeGame({ seed: 2, platformId: 'vk', externalPay: false, joinGroup: true })
    game.push({ kind: 'lend50', text: LEND50_VK_SYS, join: true })
    renderApp(game)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Вступить в сообщество игры' })) })
    await act(async () => { await flush() })
    expect(funnel(goals)).toEqual([['lend50_clicked', { platform: 'vk' }]])
  })

  it('Яндекс: оплаченная покупка — нажатие и покупка, закрытый инвойс — только нажатие', async () => {
    const paid = vi.fn(async () => 'paid' as const)
    adoptPlatform({ ...webPlatform(), id: 'yandex', externalPay: false, pay50: paid, price50: () => '49 YAN' })
    const first = setup()
    const yes = makeGame({ seed: 2, platformId: 'yandex', externalPay: false, pay50: 'yandex' })
    yes.game.push({ kind: 'lend50', text: LEND50_YA_SYS, buy: true })
    renderApp(yes.game)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Купить «Чашку хаша»' })) })
    await act(async () => { await flush() })
    expect(funnel(first.goals)).toEqual([
      ['lend50_clicked', { platform: 'yandex' }],
      ['lend50_paid', { platform: 'yandex' }],
    ])

    cleanup()
    const closed = vi.fn(async () => 'closed' as const)
    adoptPlatform({ ...webPlatform(), id: 'yandex', externalPay: false, pay50: closed, price50: () => '49 YAN' })
    const second = setup()
    const no = makeGame({ seed: 3, platformId: 'yandex', externalPay: false, pay50: 'yandex' })
    no.game.push({ kind: 'lend50', text: LEND50_YA_SYS, buy: true })
    renderApp(no.game)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Купить «Чашку хаша»' })) })
    await act(async () => { await flush() })
    expect(funnel(second.goals)).toEqual([['lend50_clicked', { platform: 'yandex' }]])
  })
})
