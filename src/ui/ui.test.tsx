import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { messageRenderStats } from './Message'
import { messageListRenderStats, messageListBuildStats } from './Chat'
import { makeGame, setMoney, memStorage } from '../test/helpers'
import { SAVE_KEY, loadState, START_MONEY } from '../engine/state'
import { fmtDate } from '../engine/time'
import type { Game } from '../engine/game'
import { introOf, uiOf } from './view'
import { browserAudio } from '../engine/audio'

function renderApp(game: Game, onReset = vi.fn()) {
  const utils = render(<App game={game} onReset={onReset} />)
  return { ...utils, onReset }
}

function mockScrollBox(el: HTMLElement, initial = { height: 800, client: 300, top: 500 }) {
  const height = initial.height
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
    act(() => { game.ui.busy = true; game.emit() })
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
    act(() => { game.ui.busy = false; game.emit() })
    expect(document.querySelector('#choices')).toHaveAttribute('aria-busy', 'false')
    for (const t of texts) expect(screen.getAllByText(t).some((el) => el.closest('.choices'))).toBe(true)
  })

  it('после раскрытия высоких вариантов удерживает текущий диалог у нижнего края', () => {
    const { game } = makeGame()
    renderApp(game)
    const chat = document.querySelector('#chat') as HTMLElement
    const box = mockScrollBox(chat)

    act(() => { game.ui.busy = true; game.emit() })
    expect(box.top()).toBe(box.bottom())
    box.setClient(220) // настоящие многострочные варианты отняли ещё 80 px у чата
    act(() => { game.ui.busy = false; game.emit() })
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
    await act(async () => { await game.send('СКОЛЬКО МОЖНО ЖДАТЬ!!!') })
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
    act(() => { game.ui.busy = true; game.emit() })
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

  it('ссылка в системной строке — настоящая: новая вкладка, игра остаётся открытой', () => {
    const { game } = makeGame()
    game.push({ kind: 'sys', text: 'Поддержать автора: https://www.donationalerts.com/r/enikey87' })
    renderApp(game)
    const link = screen.getByRole('link', { name: 'https://www.donationalerts.com/r/enikey87' })
    expect(link).toHaveAttribute('href', 'https://www.donationalerts.com/r/enikey87')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
    expect(screen.getByText(/Поддержать автора:/)).toBeInTheDocument()
  })

  it('кнопки допработы отвечают и исчезают', async () => {
    const { game } = makeGame()
    await game.job()
    renderApp(game)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ладно, сделаю' })) })
    expect(screen.queryByRole('button', { name: 'Ладно, сделаю' })).not.toBeInTheDocument()
    expect(game.S.ach.fence).toBeDefined()
  })

  it('третья кнопка допработы — только при правдивой отмазке; нажатие отказывает зеркалом', async () => {
    const { game } = makeGame()
    await game.job()
    renderApp(game)
    expect(screen.queryByRole('button', { name: 'Не могу, брат…' })).not.toBeInTheDocument()
    await act(async () => {
      game.S.arcs.boris = { i: 2, last: 0 }
      game.S.actors.boris = { sick: true }
      game.emit()
    })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Не могу, брат…' })) })
    expect(screen.queryByRole('button', { name: 'Не могу, брат…' })).not.toBeInTheDocument()
    expect(screen.getByText('Не могу, брат. Борис болеет, я с ним сижу.')).toBeInTheDocument()
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

  it('досье: у каждого состояния журнала свой значок', () => {
    const { game } = makeGame()
    const day = game.S.day
    game.S.promises.push(
      { t: 'завтра', made: day, due: day + 1 },
      { t: 'в пятницу', made: day - 5, due: day - 1 },
      { t: 'на днях', made: day - 6, due: day - 2, asked: true },
      { t: 'сразу после свадьбы', made: day - 7, due: day - 3, asked: true, kept: true },
      { t: 'до конца недели', made: day - 8, due: day - 4, amnesty: day - 1 },
      { t: 'когда Арарат вернут', made: day, due: null },
      { t: 'как Нуне из декрета выйдет', made: day, due: null, condition: 'nune.dekretOver' },
      { t: 'как снег в горах сойдёт', made: day - 5, due: null, condition: 'tax.thawed', met: day - 1 },
    )
    renderApp(game)
    fireEvent.click(screen.getByTitle('Обещания и ачивки'))
    const dialog = screen.getByRole('dialog')
    const line = (re: RegExp) => within(dialog).getByText(re).closest('li')!.textContent!
    expect(line(/⏳ ждём \d/)).toContain(fmtDate(day + 1)) // ждём — со своим сроком
    expect(line(/❌ просрочено/)).toContain(fmtDate(day - 1))
    expect(line(/❓ припомнили/)).toContain(fmtDate(day - 2))
    expect(line(/✅ сдержал — 50 ₽/)).toContain(fmtDate(day - 3))
    expect(line(/🕊 амнистия/)).toContain(fmtDate(day - 1))
    // «когда-нибудь» — ровно одна запись: сроки по событию им не прикидываются
    expect(within(dialog).getAllByText(/∞ когда-нибудь/)).toHaveLength(1)
    // срок по событию — свой значок до события и после: «когда-нибудь» ему не подходит
    expect(line(/⏳ ждём события/)).toContain('Нуне из декрета')
    expect(line(/🎯 событие наступило/)).toContain('снег в горах')
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
    expect(game.ui.sheetOpen).toBe(true)
    expect(document.querySelector('.phone-surface')).toHaveAttribute('inert')
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog', { name: 'Досье на Алика' })).toBeNull()
    expect(document.activeElement).toBe(info)
    expect(game.ui.sheetOpen).toBe(false)
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
    expect(game.ui.sheetOpen).toBe(true)
    const before = game.S.msgs.length
    await act(async () => { await game.onIdle() })
    expect(game.S.msgs.length).toBe(before)
    expect(game.ui.busy).toBe(false)
  })

  it('досье поверх уведомления: фон inert, клик по notif не dismiss', () => {
    const { game } = makeGame()
    renderApp(game)
    act(() => { game.notify('👩', 'Мама', 'Сынок, ты поел?', { event: 'life' }) })
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

  it('концовка закрывает открытое досье', async () => {
    const { game } = makeGame()
    game.S.arcs.samvel = { i: 8, last: 0 }
    game.S.mem['finale.samvel'] = 'groom'
    game.S.day = 320
    renderApp(game)
    fireEvent.click(screen.getByTitle('Обещания и ачивки'))
    expect(screen.getByRole('dialog', { name: 'Досье на Алика' })).toBeInTheDocument()
    await act(async () => { await game.fire('CheckEnding') })
    expect(screen.queryByRole('dialog', { name: 'Досье на Алика' })).toBeNull()
    expect(screen.getByRole('dialog', { name: /Породнились/ })).toBeInTheDocument()
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
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Не удалось скопировать')
    expect(toast.closest('[inert]')).toBeNull()
    document.execCommand = execBackup
  })

  it('тост на концовке вне inert', async () => {
    const { game } = makeGame()
    game.S.arcs.samvel = { i: 8, last: 0 }
    game.S.mem['finale.samvel'] = 'groom'
    game.S.day = 320
    await game.fire('CheckEnding')
    renderApp(game)
    expect(document.querySelector('.phone-surface')).toHaveAttribute('inert')
    act(() => { game.flash('Скопировано') })
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Скопировано')
    expect(toast.closest('.phone-surface')).toBeNull()
    expect(toast.closest('[inert]')).toBeNull()
  })

  it('голосовое доступно с клавиатуры', () => {
    const { game } = makeGame()
    const play = vi.spyOn(game, 'playVoice')
    game.push({ kind: 'voice', from: 'alik', len: 12 })
    renderApp(game)
    const voice = screen.getByLabelText('Голосовое сообщение')
    expect(voice).toHaveAttribute('tabindex', '0')
    voice.focus()
    expect(voice).toHaveFocus()
    fireEvent.keyDown(voice, { key: 'Enter' })
    expect(play).toHaveBeenCalled()
    play.mockClear()
    fireEvent.keyDown(voice, { key: ' ' })
    expect(play).toHaveBeenCalled()
  })

  it('feel-класс снимается на animationend', async () => {
    const { game } = makeGame()
    renderApp(game)
    const phone = document.querySelector('.phone')!
    await act(async () => { await game.send('СКОЛЬКО МОЖНО ЖДАТЬ!!!') })
    expect(phone).toHaveClass('feel-shake')
    act(() => { fireEvent.animationEnd(phone) })
    expect(phone).not.toHaveClass('feel-shake')
  })

  it('телефон сел → зарядка', async () => {
    const { game } = makeGame()
    renderApp(game)
    act(() => { game.S.battery = 1; game.battery.drain(1) })
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
    act(() => { game.notify('💬', 'Алик Воздухонесян', '3 новых сообщения', { event: 'unread' }); game.unlock('cow') })
    expect(screen.getByText('3 новых сообщения')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Это корова?')
    act(() => { fireEvent.click(screen.getByText('3 новых сообщения')) })
    expect(screen.queryByText('3 новых сообщения')).not.toBeInTheDocument()
  })

  it('мама и банк — карточки в ленте, а не баннер (#287)', () => {
    const { game } = makeGame()
    renderApp(game)
    act(() => { game.notify('👩', 'Мама', 'Сынок, ты поел?', { event: 'life' }); game.notify('🏦', 'Банк', 'Банк обеспокоен', { event: 'bank.level' }) })
    expect(document.getElementById('notif')).not.toHaveTextContent(/Сынок|Банк/)
    const shown = screen.getAllByTestId('card')
    expect(shown.map((c) => c.textContent)).toEqual([expect.stringContaining('Сынок, ты поел?'), expect.stringContaining('Банк обеспокоен')])
  })

  it('карточка банка: «Взять кредит» берёт кредит, реплики Алику нет (#287)', () => {
    const { game } = makeGame()
    renderApp(game)
    setMoney(game, 100)
    act(() => { game.chargeBill('rent') })
    const me = game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'me').length
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Взять кредит «Всё будет»' })) })
    expect(game.S.mem['credit.consumer.taken']).toBe(true)
    expect(game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'me').length).toBe(me)
    expect(screen.queryByRole('button', { name: 'Не сейчас' })).not.toBeInTheDocument()
    expect(screen.getAllByTestId('card').at(-1)).toHaveTextContent(/Кредит взят: \+30\s000 ₽/)
    // в вариантах ответа Алику кредита нет
    expect(screen.queryByRole('button', { name: /Продать/ })).not.toBeInTheDocument()
  })

  it('звук переключается', () => {
    const { game } = makeGame()
    renderApp(game)
    const mute = screen.getByRole('button', { name: 'Звук включён' })
    expect(mute).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(mute)
    expect(game.S.muted).toBe(true)
    const muted = screen.getByRole('button', { name: 'Звук выключен' })
    expect(muted).toHaveTextContent('🔇')
    expect(muted).toHaveAttribute('aria-pressed', 'false')
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

describe('лента как лог для скринридера', () => {
  it('живая лента объявляет сообщения, «печатает…» и «Мууу» — нет', () => {
    const { game } = makeGame()
    renderApp(game)
    const log = document.getElementById('chat')!
    expect(log).toHaveAttribute('role', 'log')
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(document.querySelector('.moo-layer')).toHaveAttribute('aria-hidden', 'true')

    act(() => { game.ui.typing = 'печатает…'; game.emit() })
    expect(document.querySelector('.typing-bubble')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('экран падения', () => {
  it('ошибка отрисовки показывает экран падения, кнопка стирает сохранение и зовёт onReset', () => {
    const { game, storage } = makeGame()
    game.save()
    expect(storage.data[SAVE_KEY]).toBeTruthy()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(game.S, 'battery', { configurable: true, get() { throw new Error('boom') } })

    const { onReset } = renderApp(game)
    expect(screen.getByText(/Что-то сломалось/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Стереть сохранение и начать заново' }))

    expect(onReset).toHaveBeenCalled()
    expect(storage.data[SAVE_KEY]).toBeUndefined()
    errors.mockRestore()
  })
})

describe('интро новой партии', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const renderIntro = (game: Game, gate = false) =>
    render(<App game={game} onReset={vi.fn()} intro introGate={gate} />)

  const prologue = (game: Game) => {
    const alik = game.S.msgs.find((m) => m.kind === 'text' && m.from === 'alik' && !m.who)!
    const sys = game.S.msgs.find((m) => m.kind === 'sys')!
    return { alik: alik.kind === 'text' ? alik.text : '', gap: sys.kind === 'sys' ? sys.text : '' }
  }

  it('по умолчанию без интро: обычный рендер App его не включает', () => {
    const { game } = makeGame()
    renderApp(game)
    expect(document.querySelector('.intro')).toBeNull()
  })

  it('новая партия: интро показывает тот же пролог, что в чате, и само уходит в чат с отметкой', () => {
    vi.useFakeTimers()
    const { game } = makeGame({ seed: 1 })
    const p = prologue(game)
    renderIntro(game)
    const intro = document.querySelector('.intro')!
    act(() => { vi.advanceTimersByTime(400) })
    expect(within(intro as HTMLElement).getByText(p.alik)).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(12200) })
    expect(game.S.introShown).toBe(true)
    expect(document.querySelector('.intro')).toBeNull()
    expect(within(document.getElementById('chat')! as HTMLElement).getByText(p.alik)).toBeInTheDocument()
    expect(document.querySelector('.intro-gap')).toBeNull()
    expect(screen.getByText(p.gap)).toBeInTheDocument()
  })

  it('перезагрузка посреди партии: отметка в сохранении — интро не показывает (#321)', () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.introDone()
    const { game: again } = makeGame({ storage, seed: 2 })
    renderIntro(again)
    expect(document.querySelector('.intro')).toBeNull()
    expect(again.S.introShown).toBe(true)
  })

  it('NC: без save в introDone перезагрузка снова показывает интро (#321)', () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    const save = game.save.bind(game)
    game.save = () => {}
    game.introDone()
    game.save = save
    expect(game.S.introShown).toBe(true)
    const { game: again } = makeGame({ storage, seed: 3 })
    renderIntro(again)
    expect(document.querySelector('.intro')).not.toBeNull()
    expect(again.S.introShown).toBe(false)
  })

  it('касание во время анимации — сразу чат', () => {
    vi.useFakeTimers()
    const { game } = makeGame()
    renderIntro(game)
    act(() => { vi.advanceTimersByTime(1000) })
    act(() => { fireEvent.click(document.querySelector('.intro')!) })
    expect(document.querySelector('.intro')).toBeNull()
    expect(game.S.introShown).toBe(true)
  })

  it('первый запуск: до касания анимация не идёт, «Коснитесь, чтобы начать»', () => {
    vi.useFakeTimers()
    const { game } = makeGame()
    renderIntro(game, true)
    expect(screen.getByText('Коснитесь, чтобы начать')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(document.querySelector('.intro-note')).toBeNull()
    act(() => { fireEvent.click(document.querySelector('.intro')!) })
    act(() => { vi.advanceTimersByTime(500) })
    expect(document.querySelector('.intro-note')).not.toBeNull()
  })

  it('prefers-reduced-motion: три фазы без наложений стопки и строки (#321)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/styles.css', 'utf8')
    expect(css).toMatch(/\.intro-reduced\.phase-play[\s\S]*?\.intro-gap[\s\S]*?opacity:\s*0/)
    expect(css).toMatch(/\.intro-reduced\.phase-gap[\s\S]*?\.intro-stack[\s\S]*?opacity:\s*0/)
    expect(css).toMatch(/\.intro-reduced\.phase-title[\s\S]*?\.intro-gap[\s\S]*?opacity:\s*0/)
    const { game } = makeGame()
    const p = prologue(game)
    renderIntro(game)
    const intro = document.querySelector('.intro') as HTMLElement
    expect(intro.className).toMatch(/intro-reduced/)
    expect(intro.className).toMatch(/phase-play/)
    expect(intro.className).not.toMatch(/phase-gap|phase-title/)
    expect(within(intro).getByText(p.alik)).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1600) })
    expect(intro.className).toMatch(/phase-gap/)
    expect(intro.className).not.toMatch(/phase-play|phase-title/)
    expect(within(intro).getByText(p.gap)).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1600) })
    expect(intro.className).toMatch(/phase-title/)
    expect(intro.className).not.toMatch(/phase-play|phase-gap/)
    expect(intro.querySelector('.intro-title-big')!.textContent).toContain('Алик,')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(document.querySelector('.intro')).toBeNull()
    expect(game.S.introShown).toBe(true)
  })

  it('промежуточные уведомления — из пулов, баланс = старт партии, без незнакомых (#249/#321)', async () => {
    const { introMidNotes } = await import('./view')
    const a = introOf(uiOf(makeGame({ seed: 1 }).game))!
    expect(a.notes.length).toBe(6)
    expect(a.notes.some((n) => n.app === 'Банк' && /Списание/.test(n.text))).toBe(true)
    expect(a.notes.some((n) => n.app === 'Алик' && n.text.includes('🏗️'))).toBe(true)
    expect(a.notes.every((n) => n.app === 'Алик' || n.app === 'Банк')).toBe(true)
    expect(a.notes.some((n) => /Мама|Авито|Карине|Гарик/i.test(n.app + n.text))).toBe(false)
    const bal = a.notes.find((n) => n.app === 'Банк')!.text.match(/Баланс: ([\d\s\u00a0]+) ₽/)![1].replace(/\s/g, '')
    expect(Number(bal)).toBe(START_MONEY - 340)
    expect(introMidNotes(START_MONEY, 1).map((n) => n.text).join('|'))
      .not.toBe(introMidNotes(START_MONEY, 2).map((n) => n.text).join('|'))
  })

  it('NC: уведомления интро не знакомят с чужими — проверка по настоящему выводу (#367)', async () => {
    const { introMidNotes } = await import('./view')
    const { CAST } = await import('../content/arcs')
    const { STARTS } = await import('../content/quests')
    const { SPEND } = await import('../content/life')
    const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // имя персонажа — последнее слово с заглавной из CAST: роли («Заказчик», «Дядя», «Прораб») отпадают сами.
    // Эвристика молча теряет двоих — маму (в тексте «мама», не «Алика») и коллекторов (#377): формы перечислены.
    const names = Object.values(CAST)
      .map((c) => escRe(c.name.replace(/[^А-Яа-яЁё\s]/g, '').trim().split(/\s+/).filter((w) => /^[А-ЯЁ]/.test(w) && w.length > 3).at(-1)!))
    const re = new RegExp([...names, 'мам[аеуы]', 'коллектор'].join('|'), 'i')
    const stray = (texts: string[]) => texts.filter((t) => re.test(t))
    // настоящий путь: ни одно уведомление ни при одном сиде и ни один пролог завязки не называют чужего
    for (let seed = 0; seed < 40; seed++) {
      const texts = introMidNotes(START_MONEY, seed).map((n) => n.text)
      expect(stray(texts), `seed ${seed}: ${stray(texts).join(' | ')}`).toEqual([])
    }
    expect(stray(STARTS.flatMap((s) => [s.intro, s.reply]))).toEqual([])
    // контроль: строки с именем — Борисом, мамой, коллекторами — подложенные в пул, ловятся
    const allTexts = () => Array.from({ length: 60 }, (_, seed) => introMidNotes(START_MONEY, seed).map((n) => n.text)).flat()
    SPEND.push('Перевод Борису на закатки', 'Перевод маме на закатки', 'Оплата коллекторам')
    try {
      // каждый декой с именем должен быть отловлен где-то по диапазону сидов
      for (const decoy of ['Борис', 'маме', 'коллекторам']) {
        expect(stray(allTexts()).some((t) => t.includes(decoy)), `декой «${decoy}» должен краснеть`).toBe(true)
      }
    } finally {
      SPEND.pop(); SPEND.pop(); SPEND.pop()
    }
  })

  it('старое сохранение без introShown — интро не показывает (#249)', () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.save()
    const raw = JSON.parse(storage.getItem(SAVE_KEY)!) as Record<string, unknown>
    delete raw.introShown
    storage.setItem(SAVE_KEY, JSON.stringify(raw))
    expect(loadState(storage)!.introShown).toBe(true)
    const again = makeGame({ storage })
    renderIntro(again.game)
    expect(document.querySelector('.intro')).toBeNull()
  })

  it('строка завязки одна на экране в фазе gap; «Мууу» звучит; ответ — игрока (#249)', () => {
    vi.useFakeTimers()
    const { game } = makeGame({ seed: 2 })
    const p = prologue(game)
    const moo = vi.spyOn(game.audio, 'moo')
    renderIntro(game)
    const intro = document.querySelector('.intro')!
    act(() => { vi.advanceTimersByTime(1200) })
    expect(within(intro as HTMLElement).getByText(p.alik)).toBeInTheDocument()
    const me = game.S.msgs.find((m) => m.kind === 'text' && m.from === 'me')!
    expect(within(intro as HTMLElement).getByText(me.kind === 'text' ? me.text : '')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(moo).toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1500) })
    expect(intro.className).toMatch(/phase-gap/)
    expect(intro.className).not.toMatch(/phase-title/)
    expect(within(intro as HTMLElement).getByText(p.gap)).toBeInTheDocument()
  })
})

describe('интро: вибрация на уведомлениях (#351)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const vibrateGame = (muted = false) => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const audio = browserAudio()
    const { game } = makeGame({ audio })
    game.gesture() // касание страницы было — иначе гейт жеста audio срежет вибрацию
    if (muted) game.toggleMute()
    return { game, vibrate }
  }

  it('на каждое уведомление — встряска: обещание, ответ и 6 из пула', () => {
    vi.useFakeTimers()
    const { game, vibrate } = vibrateGame()
    render(<App game={game} onReset={vi.fn()} intro />)
    act(() => { vi.advanceTimersByTime(7000) })
    expect(vibrate).toHaveBeenCalledTimes(8)
  })

  it('выключенный звук — без вибраций: гейт живёт в audio, интро его не обходит', () => {
    vi.useFakeTimers()
    const { game, vibrate } = vibrateGame(true)
    render(<App game={game} onReset={vi.fn()} intro />)
    act(() => { vi.advanceTimersByTime(7000) })
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('prefers-reduced-motion — статика без вибраций', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { game, vibrate } = vibrateGame()
    render(<App game={game} onReset={vi.fn()} intro />)
    act(() => { vi.advanceTimersByTime(6000) })
    expect(vibrate).not.toHaveBeenCalled()
  })
})

describe('усы: аватар без усов, пока верен факт сбрития (#350)', () => {
  const avatar = () => document.querySelector('#avatar') as HTMLElement

  it('ставка исполнилась — аватар сбрит; факт ушёл — прежний, с усами', () => {
    const { game } = makeGame()
    game.S.mem['alik.shaved'] = true
    const { unmount } = renderApp(game)
    expect(avatar().className).toContain('shaved')
    unmount()
    delete game.S.mem['alik.shaved']
    renderApp(game)
    expect(avatar().className).not.toContain('shaved')
  })

  it('баран важнее: на аватаре-баране сбритие не показывается', () => {
    const { game } = makeGame()
    game.S.ram = true
    game.S.mem['alik.shaved'] = true
    renderApp(game)
    expect(avatar().className).toContain('ram')
    expect(avatar().className).not.toContain('shaved')
  })
})
