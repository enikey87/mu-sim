import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { messageRenderStats, LONG_PRESS_MS } from './Message'
import { messageListRenderStats, messageListBuildStats } from './Chat'
import { DEBT_MS } from './Header'
import { makeGame, setMoney, memStorage, flush } from '../test/helpers'
import { SAVE_KEY, loadState } from '../engine/state'
import { fmtDate } from '../engine/time'
import type { Game } from '../engine/game'
import { introOf, uiOf } from './view'
import { introDateLine, introVowLine, LINE_MS, FADE_MS } from './Intro'
import { enable, GAME_HOST } from '../analytics/metrics'
import { LEND50_LINK, LEND50_SYS } from '../content/endgame'

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

  it('длинный ход: пока мир говорит, ряд вариантов не пересобирается — «?» те же, подписи один раз в конце (#657)', async () => {
    const { game } = makeGame({ seed: 2 })
    renderApp(game)
    const box = () => document.querySelectorAll('#choices button')
    const initial = [...box()] as HTMLButtonElement[]
    const n0 = initial.length
    const labels = initial.map((b) => b.textContent!)
    expect(n0).toBeGreaterThan(2)

    // начало хода: busy встал до пересборки вариантов (как в sendTurn) — ряд скрыл подписи, число то же
    act(() => { game.ui.busy = true; game.emit() })
    const locked = [...box()] as HTMLButtonElement[]
    expect(locked.length).toBe(n0)
    for (const b of locked) { expect(b).toHaveClass('locked'); expect(b).toBeDisabled() }
    const choicesBox = document.getElementById('choices')!
    for (const t of labels) expect(within(choicesBox).queryByText(t)).toBeNull()

    // ход мира: сцена пересобирает варианты (у неё другое число) и Алик говорит несколько раз
    await act(async () => {
      game.S.choices = null
      await game.enterNode('newjob', 'which')
      game.push({ kind: 'text', from: 'alik', text: 'Брат, подожди, я ещё подумаю.' })
    })
    const mid = [...box()] as HTMLButtonElement[]
    expect(mid.length).toBe(n0) // число кнопок не изменилось посреди хода
    for (const [i, b] of mid.entries()) expect(b).toBe(locked[i]) // ряд не пересобран — те же узлы, анимация не перезапускается
    for (const b of mid) expect(b).toBeDisabled()

    act(() => { game.push({ kind: 'text', from: 'alik', text: 'И ещё пару слов, джан.' }) })
    expect([...box()]).toEqual(mid)

    // конец хода: подписи нового набора появляются один раз
    act(() => { game.ui.busy = false; game.S.choices = game.buildChoices(); game.emit() })
    const after = [...box()] as HTMLButtonElement[]
    expect(after.length).toBe(2) // newjob.which: «Пойду» и «Нет»
    for (const b of after) expect(b).not.toHaveClass('locked')
    for (const t of labels) expect(within(choicesBox).queryByText(t)).toBeNull()
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

  it('легендарная отмазка в ленте — как обычная реплика: ни класса legend, ни золотой обводки (#638)', async () => {
    const { readFileSync } = await import('node:fs')
    const { game } = makeGame()
    game.push({ kind: 'text', from: 'alik', text: 'Деньги у бабушки в банке' })
    game.push({ kind: 'text', from: 'alik', text: 'Великая отмазка Дня выплаты', legend: true })
    renderApp(game)
    const usual = [...document.querySelectorAll('.msg.alik')].find((el) => el.textContent?.includes('Деньги у бабушки'))!
    const legendary = [...document.querySelectorAll('.msg.alik')].find((el) => el.textContent?.includes('Великая отмазка'))!
    expect(legendary.classList.contains('legend')).toBe(false)
    expect([...legendary.classList]).toEqual([...usual.classList])
    // факт легендарности в ленте остаётся: иначе тест не проверил бы, что снята именно отметка
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.legend)).toBe(true)
    expect(readFileSync('src/styles.css', 'utf8')).not.toMatch(/\.msg\.legend\b/)
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

  it('просьба «займи 50» — одна карточка перевода с кнопкой «Перевести», без серых плашек (#616)', async () => {
    const { game } = makeGame()
    game.S.mem.payday = 'default'
    game.S.ending = 'payday_default'
    game.S.endings.payday_default = game.S.day
    await act(async () => { await game.closeEnding(); await flush() })
    renderApp(game)
    const card = screen.getByTestId('lend50-card')
    expect(within(card).getByText('50 ₽')).toBeInTheDocument()
    expect(within(card).getByText(LEND50_SYS)).toBeInTheDocument()
    const link = within(card).getByRole('link', { name: 'Перевести' })
    expect(link).toHaveAttribute('href', LEND50_LINK)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
    expect(within(card).getByText(LEND50_LINK)).toHaveClass('lend50-url') // адрес виден мелким текстом
    // честная фраза и адрес — только в карточке, а не в серых плашках .sys
    const sys = [...document.querySelectorAll('.sys')].map((el) => el.textContent ?? '')
    expect(sys).not.toContain(LEND50_SYS)
    expect(sys.some((t) => t.includes(LEND50_LINK))).toBe(false)
    // залитая кнопка ответа — только «Перевёл»
    expect(screen.getByRole('button', { name: 'Перевёл. Расписку давай' })).toHaveClass('primary')
    expect(screen.getByRole('button', { name: 'Не дам' })).not.toHaveClass('primary')
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

  it('досье: концовки и ачивки — плитки, журнал остаётся списком', () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'завтра — всё отдам', d: 1 })
    game.S.arcs.boris = { i: 3, last: 0 }
    game.S.endings.family = game.S.day
    game.unlock('first')
    renderApp(game)
    fireEvent.click(screen.getByTitle('Обещания и ачивки'))
    const dialog = screen.getByRole('dialog')

    // полученная концовка — плитка с иконкой и названием, а не строка списка
    const endings = document.getElementById('endings')!
    const tile = within(endings).getByText('Породнились').closest('.tile')!
    expect(tile).not.toBeNull()
    expect(tile.className).toBe('tile')
    expect(tile.querySelector('.tile-icon')!.textContent).toBe('💍')
    expect(endings.querySelectorAll('.list li')).toHaveLength(0)
    // закрытая концовка — тихая плитка «???» без названия
    const locked = within(endings).getAllByText('???')[0].closest('.tile')!
    expect(locked.className).toBe('tile locked')
    expect(locked.querySelector('.tile-icon')!.textContent).toBe('🔒')
    expect(within(endings).queryByText('Наследство долга')).toBeNull()
    // счётчик на месте
    expect(within(dialog).getByText('1/14')).toBeInTheDocument()

    // полученная ачивка — плитка с кубком, названием и описанием
    const ach = document.getElementById('achList')!
    const got = within(ach).getByText('Первый шаг').closest('.tile')!
    expect(got.className).toBe('tile')
    expect(got.querySelector('.tile-icon')!.textContent).toBe('🏆')
    expect(got.querySelector('.tile-desc')!.textContent).toBe('Написал Алику')
    // закрытая ачивка показывает название и описание и тише полученной
    const lockedAch = within(ach).getByText('Брат джан').closest('.tile')!
    expect(lockedAch.className).toBe('tile locked')
    expect(lockedAch.querySelector('.tile-icon')!.textContent).toBe('🔒')
    expect(lockedAch.querySelector('.tile-desc')!.textContent).toBe('Алик назвал тебя «брат джан»')
    expect(within(dialog).getByText('1/14')).toBeInTheDocument() // счётчики — в заголовках секций
    expect(document.getElementById('achCount')!.textContent).toBe('1/' + document.querySelectorAll('#achList .tile').length)

    // журнал обещаний и сериалы — по-прежнему список строк
    const promises = document.getElementById('promises')!
    expect(promises.matches('.list')).toBe(true)
    expect(promises.querySelectorAll('li')).toHaveLength(1)
    expect(document.getElementById('arcs')!.matches('.list')).toBe(true)
    expect(document.getElementById('items')!.matches('.list')).toBe(true)
  })

  it('досье: плитки не кнопки и не ссылки — фокус с «Закрыть» доходит до «Начать заново»', async () => {
    const { game } = makeGame()
    game.S.endings.family = game.S.day
    game.unlock('first')
    renderApp(game)
    const info = screen.getByTitle('Обещания и ачивки')
    await userEvent.setup().click(info)
    const dialog = screen.getByRole('dialog', { name: 'Досье на Алика' })
    expect(document.querySelectorAll('.tile').length).toBe(document.querySelectorAll('#endings .tile').length + document.querySelectorAll('#achList .tile').length)
    expect(document.querySelectorAll('.tile button, .tile a')).toHaveLength(0)
    await userEvent.setup().tab()
    const reset = screen.getByText('Начать заново')
    expect(dialog.contains(document.activeElement)).toBe(true)
    reset.focus()
    expect(document.activeElement).toBe(reset)
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

  it('отмазка — главный блок карточки: не цитата под абзацем, копирование на нём, «Играть дальше» — основная кнопка', async () => {
    const { game } = makeGame()
    game.S.day = 340
    Object.assign(game.S.mem, { payday: 'coins', 'payday.chain': 'Эти пятьдесят рублей лежали в сейфе.' })
    await game.fire('CheckEnding')
    renderApp(game)
    const end = screen.getByRole('dialog', { name: /День выплаты/ })

    // блок отмазки — не blockquote.grand, а отдельный блок карточки
    const block = end.querySelector('#grandExcuse')
    expect(block).not.toBeNull()
    expect(block!.tagName).not.toBe('BLOCKQUOTE')
    expect(block!.classList.contains('grand')).toBe(true)
    expect(end.querySelector('blockquote.grand')).toBeNull()
    expect(within(block as HTMLElement).getByText(/лежали в сейфе/)).toBeInTheDocument()

    // стоит выше абзаца исхода, а не под ним
    const para = end.querySelector('p')
    expect(para).not.toBeNull()
    expect(block!.compareDocumentPosition(para!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // кнопка копирования — на блоке отмазки, а не рядом с карточкой
    const copy = end.querySelector('#copyExcuse')
    expect(block!.contains(copy)).toBe(true)
    expect(copy!.textContent).toBe('Скопировать великую отмазку')

    // «Играть дальше» остаётся залитой кнопкой внизу, «Начать заново» — обычной
    const cont = end.querySelector('#endingContinue')!
    const reset = end.querySelector('#endingReset')!
    expect(cont.textContent).toBe('Играть дальше')
    expect(cont.classList.contains('secondary')).toBe(false)
    expect(reset.textContent).toBe('Начать заново')
    expect(reset.classList.contains('secondary')).toBe(true)

    // буфер получает прежнюю строку
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => { fireEvent.click(copy as HTMLElement) })
    expect(writeText).toHaveBeenCalledWith(
      'Алик, где деньги? — великая отмазка Дня выплаты:\n«Эти пятьдесят рублей лежали в сейфе.»',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Скопировано')
  })

  it('концовка без отмазки не показывает блок отмазки', async () => {
    const { game } = makeGame()
    game.S.arcs.samvel = { i: 8, last: 0 }
    game.S.mem['finale.samvel'] = 'groom'
    game.S.day = 320
    await game.fire('CheckEnding')
    renderApp(game)
    const end = screen.getByRole('dialog', { name: /Породнились/ })
    expect(end.querySelector('#grandExcuse')).toBeNull()
    expect(end.querySelector('#copyExcuse')).toBeNull()
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

  // жест по пузырю: что уносит в буфер (#634)
  it('контекстное меню на реплике Алика кладёт её текст в буфер; своя, удалённая, голосовое, sys и разделитель молчат', async () => {
    const { game } = makeGame()
    game.push({ kind: 'text', from: 'alik', text: 'Деньги в банке у огурцов' })
    game.push({ kind: 'text', from: 'me', text: 'Своя реплика' })
    game.push({ kind: 'text', from: 'alik', text: 'секрет', deleted: true })
    game.push({ kind: 'voice', from: 'alik', len: 33 })
    game.push({ kind: 'sep', text: 'Вчера' })
    game.push({ kind: 'sys', text: 'Алик снова в сети' })
    renderApp(game)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const bubble = (text: string) =>
      [...document.querySelectorAll('.msg')].find((el) => el.textContent?.includes(text)) as HTMLElement

    await act(async () => { fireEvent.contextMenu(bubble('Деньги в банке у огурцов')) })
    expect(writeText).toHaveBeenCalledWith('Деньги в банке у огурцов')
    expect(screen.getByRole('status')).toHaveTextContent('Скопировано')

    await act(async () => { fireEvent.contextMenu(bubble('Своя реплика')) })
    await act(async () => { fireEvent.contextMenu(bubble('🚫 Сообщение удалено')) })
    await act(async () => { fireEvent.contextMenu(screen.getByLabelText('Голосовое сообщение')) })
    await act(async () => { fireEvent.contextMenu(document.querySelector('.sys') as HTMLElement) })
    await act(async () => { fireEvent.contextMenu(document.querySelector('.sep') as HTMLElement) })
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  it('долгое удержание реплики Алика копирует; короткое, уехавший палец и отпущенное раньше срока — нет', async () => {
    const { game } = makeGame()
    game.push({ kind: 'text', from: 'alik', text: 'Деньги в банке у огурцов' })
    renderApp(game)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const bubble = [...document.querySelectorAll('.msg')].find((el) =>
      el.textContent?.includes('Деньги в банке у огурцов')) as HTMLElement
    vi.useFakeTimers()
    try {
      act(() => { fireEvent.pointerDown(bubble, { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0 }) })
      act(() => { vi.advanceTimersByTime(LONG_PRESS_MS - 50) })
      expect(writeText).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(50) })
      expect(writeText).toHaveBeenCalledWith('Деньги в банке у огурцов')

      // отпустили раньше срока
      writeText.mockClear()
      act(() => { fireEvent.pointerDown(bubble, { pointerId: 2, pointerType: 'touch', clientX: 0, clientY: 0 }) })
      act(() => { vi.advanceTimersByTime(LONG_PRESS_MS - 50) })
      act(() => { fireEvent.pointerUp(bubble, { pointerId: 2 }) })
      act(() => { vi.advanceTimersByTime(LONG_PRESS_MS) })
      expect(writeText).not.toHaveBeenCalled()

      // палец уехал — жест больше не копирование
      act(() => { fireEvent.pointerDown(bubble, { pointerId: 3, pointerType: 'touch', clientX: 0, clientY: 0 }) })
      act(() => { vi.advanceTimersByTime(50) })
      act(() => { fireEvent.pointerMove(bubble, { pointerId: 3, clientX: 0, clientY: 60 }) })
      act(() => { vi.advanceTimersByTime(LONG_PRESS_MS) })
      expect(writeText).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
    await act(async () => {})
    expect(screen.getByRole('status')).toHaveTextContent('Скопировано')
  })

  it('в буфер уходит видимое: перевод — сумма и комментарий, допработа — без кнопок, акт — строки и итог', async () => {
    const { game } = makeGame()
    game.push({ kind: 'transfer', from: 'alik', text: 'аванс на терпение' })
    game.push({ kind: 'job', from: 'alik', text: 'сделай допработу' })
    game.push({ kind: 'doc', from: 'alik', title: 'АКТ № 1', rows: [['Налог на ожидание', 4500]], total: 4500 })
    renderApp(game)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const bubble = (cls: string) => document.querySelector(`.msg.${cls}`) as HTMLElement
    const byText = (text: string) =>
      [...document.querySelectorAll('.msg')].find((el) => el.textContent?.includes(text)) as HTMLElement

    await act(async () => { fireEvent.contextMenu(bubble('transfer')) })
    expect(writeText).toHaveBeenCalledWith('50 ₽\n«аванс на терпение»')
    await act(async () => { fireEvent.contextMenu(byText('сделай допработу')) })
    expect(writeText).toHaveBeenLastCalledWith('сделай допработу')
    await act(async () => { fireEvent.contextMenu(bubble('doc')) })
    const sum = (4500).toLocaleString('ru-RU')
    expect(writeText).toHaveBeenLastCalledWith(
      `АКТ № 1\nНалог на ожидание −${sum} ₽\nИтого в пользу Алика ${sum} ₽`,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Скопировано')
  })

  it('копирование реплики: отказ clipboard → тост об ошибке', async () => {
    const { game } = makeGame()
    game.push({ kind: 'text', from: 'alik', text: 'Деньги в банке у огурцов' })
    renderApp(game)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const execBackup = document.execCommand
    document.execCommand = () => false
    await act(async () => { fireEvent.contextMenu(document.querySelector('.msg.alik') as HTMLElement) })
    expect(screen.getByRole('status')).toHaveTextContent('Не удалось скопировать')
    document.execCommand = execBackup
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

  /** Текст видимой строки интро (не собранный в тесте). */
  const visibleLine = (intro: Element) =>
    intro.querySelector('.intro-line.on, .intro-line.out')?.textContent ?? ''

  /** Видимые «для игрока» строки: .on или .out (затухание ещё на экране). */
  const visibleLineEls = (intro: Element) =>
    [...intro.querySelectorAll('.intro-line.on, .intro-line.out')]

  /** Весь текст интро на текущей карточке — часы, строка, титул (#500). */
  const introAllText = (intro: Element) => (intro.textContent ?? '').replace(/\s+/g, ' ').trim()

  it('по умолчанию без интро: обычный рендер App его не включает', () => {
    const { game } = makeGame()
    renderApp(game)
    expect(document.querySelector('.intro')).toBeNull()
  })

  it('новая партия: пять карточек из той же завязки, что в чате; само уходит с отметкой', () => {
    vi.useFakeTimers()
    const { game } = makeGame({ seed: 1 })
    const p = prologue(game)
    const view = introOf(uiOf(game))!
    renderIntro(game)
    const intro = document.querySelector('.intro')!
    expect(intro.className).toMatch(/card-0/)
    expect(visibleLine(intro)).toBe('Вы положили плитку на объекте Алика.')
    expect(visibleLineEls(intro)).toHaveLength(1)
    // перед сменой — затухание, одна строка .out; затем новая .on (#500)
    act(() => { vi.advanceTimersByTime(LINE_MS - FADE_MS) })
    expect(intro.querySelector('.intro-line.out')).not.toBeNull()
    expect(intro.querySelector('.intro-line.on')).toBeNull()
    expect(visibleLineEls(intro)).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(FADE_MS) })
    expect(intro.className).toMatch(/card-1/)
    expect(visibleLine(intro)).toBe(introDateLine(view.date))
    expect(visibleLine(intro)).not.toMatch(/\.\.$/)
    expect(visibleLineEls(intro)).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    expect(intro.className).toMatch(/card-2/)
    expect(visibleLine(intro)).toBe(introVowLine(view.vow))
    expect(p.alik.includes(view.vow)).toBe(true)
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    expect(intro.className).toMatch(/card-3/)
    expect(visibleLine(intro)).toBe(p.gap)
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    expect(intro.className).toMatch(/card-4/)
    expect(intro.querySelector('.intro-line')).toBeNull()
    expect(intro.querySelector('.intro-title-big')!.textContent).toContain('Алик,')
    expect(within(intro as HTMLElement).getByText('Мууууу')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(game.S.introShown).toBe(true)
    expect(document.querySelector('.intro')).toBeNull()
    expect(within(document.getElementById('chat')! as HTMLElement).getByText(p.alik)).toBeInTheDocument()
    expect(screen.getByText(p.gap)).toBeInTheDocument()
  })

  it('NC: без фазы out строка обрывается — сторож затухания красный (#500)', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/styles.css', 'utf8')
    expect(css).toMatch(/@keyframes intro-line-out/)
    expect(css).toMatch(/\.intro-line\.out/)
    const src = readFileSync('src/ui/Intro.tsx', 'utf8')
    expect(src).toMatch(/setLinePhase\('out'\)/)
    expect(src).toMatch(/LINE_MS \* i - FADE_MS/)
  })

  it('дата на карточке 2 — без двойной точки при любом конце fmtDate (#492)', () => {
    expect(introDateLine('18 марта 2026 г.')).toBe('Объект сдан 18 марта 2026 г.')
    expect(introDateLine('18 марта 2026 г.')).not.toMatch(/\.\.$/)
    expect(introDateLine('12 апреля')).toBe('Объект сдан 12 апреля.')
    vi.useFakeTimers()
    const { game } = makeGame({ seed: 1 })
    renderIntro(game)
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    const shown = visibleLine(document.querySelector('.intro')!)
    expect(shown).toMatch(/^Объект сдан .+[^.]\.$|^Объект сдан .+г\.$/)
    expect(shown).not.toMatch(/\.\.$/)
    expect(shown).toBe(introDateLine(fmtDate(0)))
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
    expect(document.querySelector('.intro-line')).toBeNull()
    act(() => { fireEvent.click(document.querySelector('.intro')!) })
    act(() => { vi.advanceTimersByTime(100) })
    expect(document.querySelector('.intro-line.on')).not.toBeNull()
  })

  it('prefers-reduced-motion: пять карточек по очереди без анимации уезда (#477)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/styles.css', 'utf8')
    expect(css).toMatch(/\.intro-reduced[\s\S]*?\.intro-line[\s\S]*?animation:\s*none/)
    expect(css).toMatch(/\.intro-reduced[\s\S]*?\.intro-title[\s\S]*?animation:\s*none/)
    const { game } = makeGame()
    const p = prologue(game)
    const view = introOf(uiOf(game))!
    renderIntro(game)
    const intro = document.querySelector('.intro') as HTMLElement
    expect(intro.className).toMatch(/intro-reduced/)
    expect(intro.className).toMatch(/card-0/)
    expect(visibleLine(intro)).toBe('Вы положили плитку на объекте Алика.')
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    expect(intro.className).toMatch(/card-1/)
    expect(visibleLine(intro)).toBe(introDateLine(view.date))
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    expect(intro.className).toMatch(/card-2/)
    expect(visibleLine(intro)).toBe(introVowLine(view.vow))
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    expect(intro.className).toMatch(/card-3/)
    expect(visibleLine(intro)).toBe(p.gap)
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    expect(intro.className).toMatch(/card-4/)
    expect(intro.querySelector('.intro-title-big')!.textContent).toContain('Алик,')
    expect(within(intro).getByText('Мууууу')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(document.querySelector('.intro')).toBeNull()
    expect(game.S.introShown).toBe(true)
  })

  it('карточка 3 — vow своей завязки в DOM; чужой vow в introOf краснеет; «Мууу» на титуле (#492)', async () => {
    const { STARTS } = await import('../content/quests')
    for (let seed = 1; seed <= 16; seed++) {
      const { game } = makeGame({ seed })
      const p = prologue(game)
      const start = STARTS.find((s) => s.intro === p.alik)!
      const view = introOf(uiOf(game))!
      expect(view.vow).toBe(start.vow)
      expect(p.alik.includes(view.vow)).toBe(true)
      expect(view.date).toBe(fmtDate(0))
      expect(view.gap).toBe(p.gap)
      expect(view.gap).toContain(String(game.S.day))
      vi.useFakeTimers()
      const { unmount } = renderIntro(game)
      act(() => { vi.advanceTimersByTime(LINE_MS * 2) })
      expect(visibleLine(document.querySelector('.intro')!)).toBe(introVowLine(start.vow))
      unmount()
      vi.useRealTimers()
    }
    // чужая завязка: vow от другой STARTS при том же intro текста — DOM не совпадёт с прологом
    const { game } = makeGame({ seed: 1 })
    const p = prologue(game)
    const start = STARTS.find((s) => s.intro === p.alik)!
    const other = STARTS.find((s) => s.vow !== start.vow)!
    const real = start.vow
    start.vow = other.vow
    try {
      const view = introOf(uiOf(game))!
      expect(view.vow).toBe(other.vow)
      expect(p.alik.includes(view.vow)).toBe(false) // пролог не содержит чужой vow
      vi.useFakeTimers()
      const { unmount } = renderIntro(game)
      act(() => { vi.advanceTimersByTime(LINE_MS * 2) })
      expect(visibleLine(document.querySelector('.intro')!)).toBe(introVowLine(other.vow))
      expect(visibleLine(document.querySelector('.intro')!)).not.toBe(introVowLine(real))
      unmount()
      vi.useRealTimers()
    } finally {
      start.vow = real
    }
    // «Мууу» только на титуле
    vi.useFakeTimers()
    const again = makeGame({ seed: 2 }).game
    renderIntro(again)
    const intro = document.querySelector('.intro')!
    act(() => { vi.advanceTimersByTime(LINE_MS * 3) })
    expect(within(intro as HTMLElement).queryByText('Мууууу')).toBeNull()
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    expect(intro.className).toMatch(/card-4/)
    expect(within(intro as HTMLElement).getByText('Мууууу')).toBeInTheDocument()
  })

  it('интро не называет незнакомых — весь текст карточки, включая титул (#500)', async () => {
    const { CAST } = await import('../content/arcs')
    const { STARTS } = await import('../content/quests')
    const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const names = Object.values(CAST)
      .map((c) => c.name.replace(/[^А-Яа-яЁё\s]/g, '').trim().split(/\s+/).filter((w) => /^[А-ЯЁ]/.test(w) && w.length > 3 && !/^Алик/.test(w)).at(-1))
      .filter((w): w is string => !!w)
      .map(escRe)
    const re = new RegExp([...names, 'мам[аеуы]', 'коллектор'].join('|'), 'i')
    const stray = (texts: string[]) => texts.filter((t) => re.test(t))
    vi.useFakeTimers()
    for (let seed = 1; seed <= 40; seed++) {
      const { game } = makeGame({ seed })
      const { unmount } = renderIntro(game)
      const intro = document.querySelector('.intro')!
      const seen: string[] = []
      for (let c = 0; c < 5; c++) {
        if (c > 0) act(() => { vi.advanceTimersByTime(LINE_MS) })
        seen.push(introAllText(intro))
        expect(visibleLineEls(intro).length, `seed ${seed} card ${c}`).toBeLessThanOrEqual(1)
      }
      expect(stray(seen), `seed ${seed}: ${stray(seen).join(' | ')}`).toEqual([])
      unmount()
    }
    expect(stray(STARTS.flatMap((s) => [s.intro, s.vow, s.reply]))).toEqual([])
    // NC: чужое имя на титуле — сторож ловит (#500)
    render(
      <div className="intro card-4">
        <div className="intro-title on">
          <div className="intro-title-big">Карине,<br />где деньги?</div>
        </div>
      </div>,
    )
    expect(stray([introAllText(document.querySelector('.intro')!)]).some((t) => /Карине/.test(t))).toBe(true)
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

  it('«Мууу» звучит на титуле; vow входит в первое сообщение чата (#477)', () => {
    vi.useFakeTimers()
    const { game } = makeGame({ seed: 2 })
    const view = introOf(uiOf(game))!
    const moo = vi.spyOn(game.audio, 'moo')
    renderIntro(game)
    act(() => { vi.advanceTimersByTime(LINE_MS * 3 + 100) })
    expect(moo).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(LINE_MS) })
    expect(moo).toHaveBeenCalled()
    const intro = document.querySelector('.intro')!
    expect(intro.className).toMatch(/card-4/)
    expect(within(intro as HTMLElement).getByText('Мууууу')).toBeInTheDocument()
    expect(prologue(game).alik.includes(view.vow)).toBe(true)
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

describe('строка о счётчике: видна только когда он включён (#611)', () => {
  afterEach(() => { enable({ host: '', search: '', id: '' }) })

  it('счётчик молчит — строки нет ни на интро, ни в досье', () => {
    const { game } = makeGame()
    render(<App game={game} onReset={vi.fn()} intro />)
    expect(document.querySelector('.track-note')).toBeNull()
  })

  it('счётчик включён — одна строка на интро и в досье, и она говорит то же', () => {
    enable({ host: GAME_HOST, search: '', id: '4242' })
    const { game } = makeGame()
    const { unmount } = render(<App game={game} onReset={vi.fn()} intro />)
    const onIntro = document.querySelector('.intro .track-note')!
    expect(onIntro).toBeInTheDocument()
    const text = onIntro.textContent
    expect(text).toMatch(/ходы считаются/i)
    expect(text).toMatch(/текст сообщений/i)
    expect(document.querySelectorAll('.track-note')).toHaveLength(1)
    unmount()

    renderApp(game)
    fireEvent.click(screen.getByTitle('Обещания и ачивки'))
    const dossier = screen.getByRole('dialog', { name: 'Досье на Алика' })
    const inSheet = within(dossier).getByText(text!)
    expect(inSheet).toBeInTheDocument()
    expect(within(dossier).getAllByText(text!)).toHaveLength(1)
  })
})

describe('pagehide закрывает отрезок видимости (#612)', () => {
  afterEach(() => { enable({ host: '', search: '', id: '' }) })

  it('закрытие страницы даёт тот же путь, что скрытие вкладки', () => {
    const { game } = makeGame()
    renderApp(game)
    const spy = vi.spyOn(game, 'onVisibility')
    fireEvent(document, new Event('pagehide'))
    expect(spy).toHaveBeenCalledWith(true)
    spy.mockRestore()
  })
})

describe('долг в шапке доезжает до новой суммы (#635)', () => {
  const debtText = () => document.getElementById('debt')!.textContent!
  const num = (t: string) => Number(t.replace(/[^\d]/g, ''))
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('время доезда фиксированное и короткое — большое изменение не растягивается', () => {
    expect(DEBT_MS).toBeLessThanOrEqual(1000)
  })

  it('перевод: сумма едет от 240 000 к 239 950 через промежуточную', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const { game } = makeGame({ seed: 1 })
    renderApp(game)
    expect(num(debtText())).toBe(240000)
    act(() => { game.adjustDebt(-50); game.emit() })
    expect(num(debtText())).toBe(240000) // до первого кадра держится прежняя сумма
    act(() => { vi.advanceTimersByTime(DEBT_MS / 2) })
    const mid = num(debtText())
    expect(mid).toBeGreaterThan(239950)
    expect(mid).toBeLessThan(240000)
    act(() => { vi.advanceTimersByTime(DEBT_MS) })
    expect(num(debtText())).toBe(239950)
  })

  it('допработа: сумма едет вверх и доезжает до новой', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const { game } = makeGame({ seed: 1 })
    renderApp(game)
    act(() => { game.adjustDebt(1800); game.emit() })
    act(() => { vi.advanceTimersByTime(DEBT_MS / 2) })
    const mid = num(debtText())
    expect(mid).toBeGreaterThan(240000)
    expect(mid).toBeLessThan(241800)
    act(() => { vi.advanceTimersByTime(DEBT_MS) })
    expect(num(debtText())).toBe(241800)
  })

  it('prefers-reduced-motion: новая сумма сразу, без промежуточной', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { game } = makeGame({ seed: 1 })
    renderApp(game)
    expect(num(debtText())).toBe(240000)
    act(() => { game.adjustDebt(-50); game.emit() })
    expect(num(debtText())).toBe(239950)
    act(() => { vi.advanceTimersByTime(DEBT_MS) })
    expect(num(debtText())).toBe(239950)
  })

  it('«К выплате» и «Дней после сдачи» этим кодом не анимируются', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const { game } = makeGame({ seed: 1 })
    game.S.scene = { id: 'payday', node: 'split', vars: {} }
    game.S.mem['payday.sum'] = 120000
    renderApp(game)
    expect(document.querySelector('#paydaySum')?.textContent).toMatch(/К выплате: 120\s000 ₽/)
    expect(document.getElementById('days')!.textContent).toBe(String(game.S.day))
    act(() => { game.adjustDebt(-50); game.emit() })
    act(() => { vi.advanceTimersByTime(DEBT_MS / 2) })
    expect(debtText()).not.toMatch(/240\s000 ₽/) // долг в этот момент едет
    expect(document.querySelector('#paydaySum')?.textContent).toMatch(/К выплате: 120\s000 ₽/)
    expect(document.getElementById('days')!.textContent).toBe(String(game.S.day))
  })
})
