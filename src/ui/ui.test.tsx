import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'

function renderApp(game: Game, onReset = vi.fn()) {
  const utils = render(<App game={game} onReset={onReset} />)
  return { ...utils, onReset }
}

function mockScrollBox(el: HTMLElement, initial = { height: 800, client: 300, top: 500 }) {
  let height = initial.height
  let client = initial.client
  let top = initial.top
  const setTop = (value: number) => { top = Math.max(0, Math.min(value, height - client)) }
  Object.defineProperties(el, {
    scrollHeight: { configurable: true, get: () => height },
    clientHeight: { configurable: true, get: () => client },
    scrollTop: { configurable: true, get: () => top, set: setTop },
  })
  return {
    top: () => top,
    bottom: () => height - client,
    setTop,
    setClient: (value: number) => { client = value },
  }
}

describe('App', () => {
  it('показывает шапку, статистику и варианты реплик', () => {
    const { game } = makeGame()
    renderApp(game)
    expect(screen.getByText('Алик Воздухонесян')).toBeInTheDocument()
    expect(screen.getByText(/240\s000 ₽/)).toBeInTheDocument()
    expect(document.querySelectorAll('.choices button').length).toBeGreaterThanOrEqual(3)
    const intro = game.S.msgs[1]
    expect(screen.getByText(intro.kind === 'text' ? intro.text : '')).toBeInTheDocument()
  })

  it('клик по варианту — сообщение игрока и ответ Алика', async () => {
    const { game } = makeGame({ seed: 2 })
    renderApp(game)
    const btn = document.querySelector('.choices button:not(.rude)') as HTMLButtonElement
    const text = btn.textContent!
    await act(async () => { fireEvent.click(btn) })
    expect(screen.getAllByText(text).some((el) => el.closest('.msg.me'))).toBe(true)
    expect(game.S.stats.sent).toBe(1)
    expect(document.querySelectorAll('.msg.alik').length + (game.S.ctx?.type === 'reactOnly' ? 1 : 0)).toBeGreaterThan(1)
  })

  it('пока Алик отвечает — варианты скрыты дёргающимися «?», потом появляются', () => {
    const { game } = makeGame({ seed: 2 })
    renderApp(game)
    const texts = game.choices.map((c) => c.text)
    act(() => { game.busy = true; game.emit() })
    const locked = document.querySelectorAll('.choices button')
    expect(locked.length).toBe(texts.length)
    expect(document.querySelector('#choices')).toHaveAttribute('aria-busy', 'true')
    for (const b of locked) {
      expect(b).toBeDisabled()
      expect(b).toHaveClass('locked')
      expect(b).not.toHaveClass('rude')
      expect(b).toHaveAttribute('aria-label', 'Варианты скрыты, Алик отвечает')
      expect(b.textContent).toMatch(/^\?{2,4}$/)
    }
    for (const t of texts) expect(screen.queryByText(t)).toBeNull()
    act(() => { game.busy = false; game.emit() })
    expect(document.querySelector('#choices')).toHaveAttribute('aria-busy', 'false')
    for (const t of texts) expect(screen.getAllByText(t).some((el) => el.closest('.choices'))).toBe(true)
  })

  it('после раскрытия высоких вариантов удерживает текущий диалог у нижнего края', () => {
    const { game } = makeGame()
    renderApp(game)
    const chat = document.querySelector('#chat') as HTMLElement
    const box = mockScrollBox(chat)

    act(() => { game.busy = true; game.emit() })
    expect(box.top()).toBe(box.bottom())
    box.setClient(220) // настоящие многострочные варианты отняли ещё 80 px у чата
    act(() => { game.busy = false; game.emit() })
    expect(box.top()).toBe(580)
    expect(box.top()).toBe(box.bottom())
  })

  it('при чтении истории сохраняет позицию, считает новые сообщения и возвращает вниз по кнопке', () => {
    const { game } = makeGame()
    renderApp(game)
    const chat = document.querySelector('#chat') as HTMLElement
    const box = mockScrollBox(chat)
    act(() => game.emit())

    box.setTop(120)
    fireEvent.scroll(chat)
    act(() => { game.push({ kind: 'text', from: 'alik', text: 'Первое новое сообщение' }) })
    expect(box.top()).toBe(120)
    expect(screen.getByRole('button', { name: '↓ Новое сообщение' })).toBeInTheDocument()

    act(() => {
      game.push({ kind: 'sep', text: 'Новый день' }) // разделитель не считается сообщением
      game.push({ kind: 'sys', text: 'Алик снова в сети' })
    })
    expect(box.top()).toBe(120)
    fireEvent.click(screen.getByRole('button', { name: '↓ 2 новых сообщения' }))
    expect(box.top()).toBe(box.bottom())
    expect(screen.queryByText(/новых? сообщения/)).not.toBeInTheDocument()
  })

  it('нижний порог не открепляет чат, а собственная реплика возвращает из истории', () => {
    const { game } = makeGame()
    renderApp(game)
    const chat = document.querySelector('#chat') as HTMLElement
    const box = mockScrollBox(chat)
    act(() => game.emit())

    box.setTop(box.bottom() - 24)
    fireEvent.scroll(chat)
    act(() => { game.push({ kind: 'text', from: 'alik', text: 'В пределах нижнего порога' }) })
    expect(box.top()).toBe(box.bottom())
    expect(screen.queryByRole('button', { name: /Новое сообщение/ })).not.toBeInTheDocument()

    box.setTop(box.bottom() - 25)
    fireEvent.scroll(chat)
    act(() => { game.push({ kind: 'text', from: 'alik', text: 'Уже в истории' }) })
    expect(screen.getByRole('button', { name: '↓ Новое сообщение' })).toBeInTheDocument()
    act(() => { game.push({ kind: 'text', from: 'me', text: 'Вернуться в разговор' }) })
    expect(box.top()).toBe(box.bottom())
    expect(screen.queryByRole('button', { name: /Новое сообщение/ })).not.toBeInTheDocument()
  })

  it('свой текст отправляется, обрезается по краям, а поле очищается', async () => {
    const { game } = makeGame()
    renderApp(game)
    const user = userEvent.setup()
    const input = screen.getByLabelText('Сообщение') as HTMLInputElement
    expect(screen.getByLabelText('Отправить')).toBeDisabled()
    await user.type(input, '  Алик, когда оплата?  ')
    await act(async () => { await user.click(screen.getByLabelText('Отправить')) })
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.from === 'me' && m.text === 'Алик, когда оплата?')).toBe(true)
    expect(input.value).toBe('')
    expect(game.S.stats.sent).toBe(1)
  })

  it('отклик на ввод вешает класс на телефон, без подписи категории', async () => {
    const { game } = makeGame()
    renderApp(game)
    const phone = document.querySelector('.phone')!
    expect(phone.className).not.toMatch(/feel-/)
    await act(async () => { await game.send('АЛИК!!!') })
    expect(phone).toHaveClass('feel-shake')
    expect(screen.queryByText(/intimidation|apology|violent|request/i)).toBeNull()
    await act(async () => { game.S.offlineDays = 0; await game.send('Извини') })
    expect(phone).toHaveClass('feel-sorry')
    await act(async () => { game.S.offlineDays = 0; await game.send('Мууу') })
    expect(phone).toHaveClass('feel-moo')
    await act(async () => { game.S.offlineDays = 0; await game.send('Знаю, где ты живёшь') })
    expect(phone).toHaveClass('feel-intimidate')
  })

  it('пустой ввод не отправляется; во время ответа поле блокируется и сохраняет черновик', async () => {
    const { game } = makeGame()
    renderApp(game)
    const user = userEvent.setup()
    const input = screen.getByLabelText('Сообщение') as HTMLInputElement
    await user.type(input, '   ')
    expect(screen.getByLabelText('Отправить')).toBeDisabled()
    fireEvent.submit(document.querySelector('#composer')!)
    expect(game.S.stats.sent).toBe(0)

    await user.clear(input)
    await user.type(input, 'Черновик')
    act(() => { game.busy = true; game.emit() })
    expect(input).toBeDisabled()
    expect(screen.getByLabelText('Отправить')).toBeDisabled()
    expect(input.value).toBe('Черновик')
    fireEvent.submit(document.querySelector('#composer')!)
    expect(game.S.stats.sent).toBe(0)
  })

  it('в сцене подсказывает, что можно выбрать вариант или написать свой', async () => {
    const { game } = makeGame()
    await game.enterNode('toast', 'ask')
    renderApp(game)
    expect(screen.getByLabelText('Сообщение')).toHaveAttribute('placeholder', expect.stringMatching(/выберите ответ/i))
  })

  it('индикаторов настроения и терпения по-прежнему нет', () => {
    const { game } = makeGame()
    renderApp(game)
    expect(document.querySelector('#mood, #patience')).toBeNull()
  })

  it('рисует все виды сообщений', () => {
    const { game } = makeGame()
    game.push({ kind: 'sticker', from: 'alik', e: '🐏💕', c: 'Люблю, брат' })
    game.push({ kind: 'fwd', from: 'alik', f: 'Мама', text: 'Не отдавай деньги.' })
    game.push({ kind: 'doc', from: 'alik', title: 'АКТ № 1', rows: [['Налог на ожидание', 4500]], total: 4500 })
    game.push({ kind: 'voice', from: 'alik', len: 47 })
    game.push({ kind: 'transfer', from: 'alik', text: 'аванс на терпение' })
    game.push({ kind: 'photo', from: 'alik', text: 'Держи скрин.' })
    game.push({ kind: 'text', from: 'alik', text: 'секрет', deleted: true })
    game.push({ kind: 'text', from: 'alik', text: 'Бее.', who: 'boris' })
    game.push({ kind: 'text', from: 'me', text: 'Жду', react: '👍' })
    game.push({ kind: 'text', from: 'alik', text: 'Когда-нибудь', edited: true })
    renderApp(game)
    expect(screen.getByText('Люблю, брат')).toBeInTheDocument()
    expect(screen.getByText(/Переслано от: Мама/)).toBeInTheDocument()
    expect(screen.getByText(/АКТ № 1/)).toBeInTheDocument()
    expect(screen.getByText('Итого в пользу Алика')).toBeInTheDocument()
    expect(screen.getByLabelText('Голосовое сообщение')).toBeInTheDocument()
    expect(screen.getByText('«аванс на терпение»')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Платёжка/ })).toBeInTheDocument()
    expect(screen.getByText('🚫 Сообщение удалено')).toBeInTheDocument()
    expect(screen.queryByText('секрет')).not.toBeInTheDocument()
    expect(screen.getByText('Борис 🐏')).toBeInTheDocument()
    expect(screen.getByText('👍')).toBeInTheDocument()
    expect(screen.getByText(/^изменено/)).toBeInTheDocument()
  })

  it('кнопки допработы отвечают и исчезают', async () => {
    const { game } = makeGame()
    await game.job()
    renderApp(game)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ладно, сделаю' })) })
    expect(screen.queryByRole('button', { name: 'Ладно, сделаю' })).not.toBeInTheDocument()
    expect(game.S.ach.fence).toBeDefined()
  })

  it('досье: обещания, сериалы, ачивки, сброс', async () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'завтра — всё отдам', d: 1 })
    game.S.arcs.boris = { i: 3, last: 0 }
    game.unlock('first')
    const { onReset } = renderApp(game)
    fireEvent.click(screen.getByTitle('Обещания и ачивки'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/завтра — всё отдам/)).toBeInTheDocument()
    expect(within(dialog).getByText(/серия 3\/10/)).toBeInTheDocument()
    expect(within(dialog).getByText(/^1\//)).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(within(dialog).getByText('Начать заново'))
    expect(onReset).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Закрыть'))
  })

  it('концовка: экран с итогами, «играть дальше» и «заново»; в досье — финалы и концовки', async () => {
    const { game } = makeGame()
    game.S.arcs.samvel = { i: 8, last: 0 }
    game.S.mem['finale.samvel'] = 'groom'
    game.S.day = 320
    await game.fire('CheckEnding')
    const { onReset } = renderApp(game)
    const end = screen.getByRole('dialog', { name: /Породнились/ })
    expect(within(end).getByText(/Свадьба дяди Самвела: «Жених»/)).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(within(end).getByText('Начать заново'))
    expect(onReset).toHaveBeenCalled()
    act(() => fireEvent.click(within(end).getByText('Играть дальше')))
    expect(screen.queryByRole('dialog', { name: /Породнились/ })).toBeNull()
    fireEvent.click(screen.getByTitle('Обещания и ачивки'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/финал «Жених»/)).toBeInTheDocument()
    expect(within(dialog).getByText('Породнились')).toBeInTheDocument()
    expect(within(dialog).getByText('1/14')).toBeInTheDocument()
  })

  it('День выплаты: счётчик «к выплате» в шапке; на экране итогов — великая отмазка и «Скопировать»', async () => {
    const { game } = makeGame()
    game.S.scene = { id: 'payday', node: 'split', vars: {} }
    game.S.mem['payday.sum'] = 120000
    const { unmount } = renderApp(game)
    expect(document.querySelector('#paydaySum')?.textContent).toMatch(/К выплате: 120\s000 ₽/)
    unmount()
    game.S.scene = null
    game.S.day = 340
    Object.assign(game.S.mem, { payday: 'coins', 'payday.chain': 'Эти пятьдесят рублей лежали в сейфе.' })
    await game.fire('CheckEnding')
    renderApp(game)
    const end = screen.getByRole('dialog', { name: /День выплаты/ })
    expect(within(end).getByText(/лежали в сейфе/)).toBeInTheDocument()
    expect(within(end).getByText('Скопировать великую отмазку')).toBeInTheDocument()
  })

  it('телефон сел → зарядка', async () => {
    const { game } = makeGame()
    renderApp(game)
    act(() => { game.S.battery = 1; game.drain(1) })
    expect(screen.getByText('Телефон сел')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByText('Поставить на зарядку')) })
    expect(document.querySelector('#deadScreen')).toHaveClass('hidden')
  })

  it('уведомление телефона и тост ачивки', () => {
    const { game } = makeGame()
    renderApp(game)
    act(() => { game.notify('👩', 'Мама', 'Сынок, ты поел?'); game.unlock('cow') })
    expect(screen.getByText('Сынок, ты поел?')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Это корова?')
    act(() => { fireEvent.click(screen.getByText('Сынок, ты поел?')) })
    expect(screen.queryByText('Сынок, ты поел?')).not.toBeInTheDocument()
  })

  it('звук переключается', () => {
    const { game } = makeGame()
    renderApp(game)
    fireEvent.click(screen.getByTitle('Звук'))
    expect(game.S.muted).toBe(true)
    expect(screen.getByTitle('Звук')).toHaveTextContent('🔇')
  })

  it('отладочная панель показывает выборы правил и память', async () => {
    const { game } = makeGame({ debug: true })
    render(<App game={game} onReset={vi.fn()} debug />)
    await act(async () => { await game.send(game.choices.find((c) => c.tone === 'polite')!) })
    const panel = screen.getByRole('complementary', { name: 'Отладка правил' })
    expect(within(panel).getAllByText('PlayerMessage').length + within(panel).getAllByText('BuildChoices').length).toBeGreaterThan(0)
    fireEvent.click(within(panel).getAllByText('BuildChoices')[0])
    expect(within(panel).getAllByText('выбрано').length).toBeGreaterThan(0)
  })
})
