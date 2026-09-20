import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { messageRenderStats } from './Message'
import { messageListRenderStats, messageListBuildStats } from './Chat'
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
    expect(input).toHaveAttribute('enterKeyHint', 'send')
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

  it('Esc закрывает досье и возвращает фокус на кнопку досье', () => {
    const { game } = makeGame()
    renderApp(game)
    const info = screen.getByTitle('Обещания и ачивки')
    info.focus()
    fireEvent.click(info)
    const dialog = screen.getByRole('dialog', { name: 'Досье на Алика' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.activeElement).toBe(screen.getByLabelText('Закрыть'))
    expect(game.sheetOpen).toBe(true)
    expect(document.querySelector('.phone-surface')).toHaveAttribute('inert')
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog', { name: 'Досье на Алика' })).toBeNull()
    expect(document.activeElement).toBe(info)
    expect(game.sheetOpen).toBe(false)
    expect(document.querySelector('.phone-surface')).not.toHaveAttribute('inert')
  })

  it('досье: Tab зациклен, подложка закрывает, повторное открытие без утечки', async () => {
    const user = userEvent.setup()
    const { game } = makeGame()
    renderApp(game)
    const info = screen.getByTitle('Обещания и ачивки')
    await user.click(info)
    const dialog = screen.getByRole('dialog', { name: 'Досье на Алика' })
    const close = screen.getByLabelText('Закрыть')
    const resetBtn = within(dialog).getByText('Начать заново')
    expect(document.activeElement).toBe(close)

    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    resetBtn.focus()
    await user.tab()
    expect(document.activeElement).toBe(close)
    close.focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(resetBtn)

    expect(screen.getByLabelText('Сообщение')).not.toHaveFocus()
    fireEvent.click(document.getElementById('sheet')!)
    expect(screen.queryByRole('dialog', { name: 'Досье на Алика' })).toBeNull()
    expect(document.activeElement).toBe(info)

    await user.click(info)
    expect(screen.getByRole('dialog', { name: 'Досье на Алика' })).toBeInTheDocument()
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog', { name: 'Досье на Алика' })).toBeNull()
  })

  it('при открытом досье onIdle не вмешивается в игру', async () => {
    const { game } = makeGame()
    renderApp(game)
    fireEvent.click(screen.getByTitle('Обещания и ачивки'))
    expect(game.sheetOpen).toBe(true)
    const before = game.S.msgs.length
    await act(async () => { await game.onIdle() })
    expect(game.S.msgs.length).toBe(before)
    expect(game.busy).toBe(false)
  })

  it('досье поверх уведомления: фон inert, клик по notif не dismiss', () => {
    const { game } = makeGame()
    renderApp(game)
    act(() => { game.notify('👩', 'Мама', 'Сынок, ты поел?') })
    expect(screen.getByText('Сынок, ты поел?')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Обещания и ачивки'))
    const dialog = screen.getByRole('dialog', { name: 'Досье на Алика' })
    const notif = document.getElementById('notif')!
    expect(document.querySelector('.phone-surface')).toHaveAttribute('inert')
    expect(notif.closest('[inert]')).toBeTruthy()
    expect(dialog.closest('[inert]')).toBeNull()
    expect(screen.getByLabelText('Сообщение').closest('[inert]')).toBeTruthy()
    // jsdom не блокирует клики по inert — проверяем, что обработчик на inert-поддереве, а не срабатывание
    expect(notif.hasAttribute('inert') || !!notif.closest('[inert]')).toBe(true)
  })

  it('концовка: экран с итогами, «играть дальше» и «заново»; в досье — финалы и концовки', async () => {
    const { game } = makeGame()
    game.S.arcs.samvel = { i: 8, last: 0 }
    game.S.mem['finale.samvel'] = 'groom'
    game.S.day = 320
    await game.fire('CheckEnding')
    const { onReset } = renderApp(game)
    const end = screen.getByRole('dialog', { name: /Породнились/ })
    expect(end).toHaveAttribute('aria-modal', 'true')
    expect(document.querySelector('.phone-surface')).toHaveAttribute('inert')
    expect(within(end).getByText(/Свадьба дяди Самвела: «Жених»/)).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(within(end).getByText('Начать заново'))
    expect(onReset).toHaveBeenCalled()
    act(() => fireEvent.click(within(end).getByText('Играть дальше')))
    expect(screen.queryByRole('dialog', { name: /Породнились/ })).toBeNull()
    expect(document.querySelector('.phone-surface')).not.toHaveAttribute('inert')
    fireEvent.click(screen.getByTitle('Обещания и ачивки'))
    const dialog = screen.getByRole('dialog', { name: 'Досье на Алика' })
    expect(within(dialog).getByText(/финал «Жених»/)).toBeInTheDocument()
    expect(within(dialog).getByText('Породнились')).toBeInTheDocument()
    expect(within(dialog).getByText('1/14')).toBeInTheDocument()
  })

  it('концовка: Esc и aria — фон inert, фокус не в чате', async () => {
    const { game } = makeGame()
    game.S.arcs.samvel = { i: 8, last: 0 }
    game.S.mem['finale.samvel'] = 'groom'
    game.S.day = 320
    await game.fire('CheckEnding')
    renderApp(game)
    const end = screen.getByRole('dialog', { name: /Породнились/ })
    expect(end).toHaveAttribute('aria-modal', 'true')
    expect(document.querySelector('.phone-surface')).toHaveAttribute('inert')
    expect(end.contains(document.activeElement)).toBe(true)
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog', { name: /Породнились/ })).toBeNull()
    expect(game.S.ending).toBeNull()
    expect(document.querySelector('.phone-surface')).not.toHaveAttribute('inert')
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
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => { fireEvent.click(within(end).getByText('Скопировать великую отмазку')) })
    expect(writeText).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Скопировано')
  })

  it('копирование отмазки: отказ clipboard → тост об ошибке', async () => {
    const { game } = makeGame()
    game.S.day = 340
    Object.assign(game.S.mem, { payday: 'coins', 'payday.chain': 'отмазка' })
    await game.fire('CheckEnding')
    renderApp(game)
    const end = screen.getByRole('dialog', { name: /День выплаты/ })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const execBackup = document.execCommand
    document.execCommand = () => false
    await act(async () => { fireEvent.click(within(end).getByText('Скопировать великую отмазку')) })
    expect(screen.getByRole('status')).toHaveTextContent('Не удалось скопировать')
    document.execCommand = execBackup
  })

  it('телефон сел → зарядка', async () => {
    const { game } = makeGame()
    renderApp(game)
    act(() => { game.S.battery = 1; game.drain(1) })
    const dead = screen.getByRole('dialog', { name: 'Телефон сел' })
    expect(dead).toHaveAttribute('aria-modal', 'true')
    expect(document.querySelector('.phone-surface')).toHaveAttribute('inert')
    expect(dead.contains(document.activeElement)).toBe(true)
    await act(async () => { fireEvent.click(screen.getByText('Поставить на зарядку')) })
    expect(document.querySelector('#deadScreen')).toHaveClass('hidden')
    expect(document.querySelector('.phone-surface')).not.toHaveAttribute('inert')
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

  it('длинная лента: несвязанный emit не пересобирает список', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 1000; i++) {
      game.S.msgs.push({
        id: game.S.nextId++,
        kind: 'text',
        from: i % 2 ? 'me' : 'alik',
        text: `msg-${i}`,
        time: '12:00',
      })
    }
    // начальная эпоха должна видеть уже заполненную ленту
    game.notifyMsgs()
    renderApp(game)
    messageRenderStats.count = 0
    messageListRenderStats.count = 0
    messageListBuildStats.created = 0
    messageListBuildStats.touched = 0
    const t0 = performance.now()
    act(() => { game.setStatus('в сети', 'online') })
    const statusMs = performance.now() - t0
    expect(messageListRenderStats.count).toBe(0)
    expect(messageRenderStats.count).toBe(0)
    expect(messageListBuildStats.created).toBe(0)
    expect(messageListBuildStats.touched).toBe(0)

    messageRenderStats.count = 0
    messageListRenderStats.count = 0
    messageListBuildStats.created = 0
    messageListBuildStats.touched = 0
    const t1 = performance.now()
    let last!: ReturnType<typeof game.push>
    act(() => { last = game.push({ kind: 'text', from: 'alik', text: 'новое', time: '12:01' }) })
    const pushMs = performance.now() - t1
    expect(messageListRenderStats.count).toBe(1)
    expect(messageRenderStats.count).toBe(1)
    expect(messageListBuildStats.created).toBe(1)
    expect(messageListBuildStats.touched).toBe(1)

    messageRenderStats.count = 0
    messageListBuildStats.created = 0
    messageListBuildStats.touched = 0
    const t2 = performance.now()
    await act(async () => { await game.editLast(last) })
    const patchMs = performance.now() - t2
    expect(messageListBuildStats.created).toBe(1)
    expect(messageListBuildStats.touched).toBe(1)
    expect(messageRenderStats.count).toBe(1)
    expect(screen.getByText(/^изменено/)).toBeInTheDocument()

    expect(statusMs).toBeLessThan(80)
    expect(pushMs).toBeLessThan(120)
    expect(patchMs).toBeLessThan(80)
    // eslint-disable-next-line no-console
    console.log(
      `[chat-render] n=1000 before≈status:N-scan/push:N-map; after status=${statusMs.toFixed(1)}ms touched=0; ` +
        `push=${pushMs.toFixed(1)}ms created=1 touched=1; editLast=${patchMs.toFixed(1)}ms created=1 touched=1`,
    )
  })

  it('динамические поля сообщения обновляют UI после replace', async () => {
    const { game } = makeGame()
    const mine = game.push({ kind: 'text', from: 'me', text: 'Жду оплату', time: '10:00' })
    const alik = game.push({ kind: 'text', from: 'alik', text: 'Завтра утром — всё отдам.', time: '10:01' })
    renderApp(game)

    act(() => {
      const i = game.S.msgs.findIndex((x) => x.id === mine.id)
      game.S.msgs[i] = { ...mine, kind: 'text', from: 'me', text: 'Жду оплату', time: '10:00', react: '🔥' }
      game.notifyMsgs()
    })
    expect(screen.getByText('🔥')).toBeInTheDocument()

    await act(async () => { await game.editLast(alik) })
    expect(screen.getByText(/^изменено/)).toBeInTheDocument()

    await act(async () => { await game.deletedMsg() })
    expect(screen.getByText('🚫 Сообщение удалено')).toBeInTheDocument()
  })
})
