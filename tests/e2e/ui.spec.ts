import { expect, test } from '@playwright/test'

/** Ход Алика в ?fast: доставка держит пол реального времени (#1370) — реплика из нескольких пузырей идёт
 *  секунды, а не доли. Ожидание то же (composer перестал быть busy), только с запасом на медленный раннер. */
const TURN_IDLE = { timeout: 20_000 }

test.beforeEach(async ({ page }) => {
  // ?nointro — интро новой партии ~10 с анимации, e2e не должны её ждать
  await page.goto('/?fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
})

test('под тестом прод-сборка, а не dev-сервер', async ({ page }) => {
  // сборка отдаёт ./assets/index-<хеш>.js, dev-сервер — /src/intro/shell.ts
  const srcs = await page.evaluate(() => [...document.scripts].map((s) => s.getAttribute('src') ?? ''))
  expect(srcs.some((s) => /assets\//.test(s))).toBe(true)
  expect(srcs.some((s) => /\/src\//.test(s))).toBe(false)
})

test('новая игра показывает чат, долг и варианты ответа', async ({ page }) => {
  await expect(page).toHaveTitle('Алик, где деньги?')
  await expect(page.locator('#debt')).toHaveText(/240\s000 ₽/)
  await expect(page.getByLabel('Сообщение')).toBeVisible()
  await expect(page.getByLabel('Отправить')).toBeDisabled()

  const choices = await page.locator('#choices button').count()
  expect(choices).toBeGreaterThanOrEqual(3)
  expect(choices).toBeLessThanOrEqual(4)
})

test('готовый вариант отправляется и открывает следующий ход', async ({ page }) => {
  const choice = page.locator('#choices button:not([disabled])').first()
  const text = (await choice.innerText()).trim()

  await choice.click()

  await expect(page.locator('.msg.me').filter({ hasText: text })).toBeVisible()
  await expect(page.locator('#composer')).toHaveAttribute('aria-busy', 'false', TURN_IDLE)
  await expect(page.locator('#choices button:not([disabled])').first()).toBeVisible()
})

test('ручной ответ отправляется, очищает поле и сохраняется после перезагрузки', async ({ page }) => {
  const text = 'Алик, пожалуйста, верните деньги'
  const input = page.getByLabel('Сообщение')

  await input.fill(text)
  await page.getByLabel('Отправить').click()

  await expect(page.locator('.msg.me').filter({ hasText: text })).toBeVisible()
  await expect(input).toHaveValue('')
  await expect(page.locator('#composer')).toHaveAttribute('aria-busy', 'false', TURN_IDLE)

  await page.reload()
  await expect(page.locator('.msg.me').filter({ hasText: text })).toBeVisible()
})

test('досье: модальность с клавиатуры, фон недоступен', async ({ page }) => {
  await page.getByTitle('Обещания и ачивки').focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Досье на Алика' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(page.locator('.phone-surface')).toHaveAttribute('inert')
  await expect(page.getByLabel('Закрыть')).toBeFocused()

  await page.keyboard.press('Tab')
  const inDialog = await page.evaluate(() => {
    const d = document.querySelector('.sheet-inner')
    return !!d && d.contains(document.activeElement)
  })
  expect(inDialog).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByTitle('Обещания и ачивки')).toBeFocused()
  await expect(page.locator('.phone-surface')).not.toHaveAttribute('inert')
})

test('режим рецензирования существует только по ?review', async ({ page }) => {
  await page.getByTitle('Обещания и ачивки').click()
  const dialog = page.getByRole('dialog', { name: 'Досье на Алика' })
  await expect(dialog).toBeVisible()
  // без параметра режима нет: ни секции, ни тумблера — включить его игроку нечем
  await expect(page.locator('#reviewToggle')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.goto('/?review&fast&nointro')
  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await page.getByTitle('Обещания и ачивки').click()
  await expect(page.locator('#reviewToggle')).toBeVisible()
})

test('поле сообщения имеет enterKeyHint=send', async ({ page }) => {
  await expect(page.getByLabel('Сообщение')).toHaveAttribute('enterkeyhint', 'send')
})

test('мобильный layout: композер в viewport, без горизонтального overflow', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'только mobile project')

  await page.addStyleTag({
    content: `:root { --safe-top: 47px; --safe-right: 0px; --safe-bottom: 34px; --safe-left: 0px; }`,
  })

  const metrics = await page.evaluate(() => {
    const phone = document.querySelector('.phone') as HTMLElement
    const send = document.getElementById('sendBtn') as HTMLElement
    const phoneBox = phone.getBoundingClientRect()
    const sendBox = send.getBoundingClientRect()
    const cs = getComputedStyle(phone)
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      sendBottom: sendBox.bottom,
      phoneBottom: phoneBox.bottom,
      sendVisible: sendBox.bottom <= phoneBox.bottom + 1 && sendBox.top >= phoneBox.top - 1,
    }
  })

  expect(metrics.paddingTop).toBe('47px')
  expect(metrics.paddingBottom).toBe('34px')
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
  expect(metrics.sendVisible).toBe(true)
})

test('landscape: нет горизонтального overflow при ненулевых боковых inset', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'только mobile project')

  await page.setViewportSize({ width: 844, height: 390 })
  await page.addStyleTag({
    content: `:root { --safe-top: 0px; --safe-right: 44px; --safe-bottom: 21px; --safe-left: 44px; }`,
  })

  const metrics = await page.evaluate(() => {
    const phone = document.querySelector('.phone') as HTMLElement
    const box = phone.getBoundingClientRect()
    const cs = getComputedStyle(phone)
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      phoneWidth: box.width,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      borderWidth: cs.borderLeftWidth,
      fullscreen: matchMedia('(max-width: 500px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)').matches,
    }
  })

  expect(metrics.fullscreen).toBe(true)
  expect(metrics.borderWidth).toBe('0px')
  expect(metrics.paddingLeft).toBe('44px')
  expect(metrics.paddingRight).toBe('44px')
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
})

test('landscape desktop: короткая высота не снимает рамку телефона', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('desktop'), 'только desktop project')

  await page.setViewportSize({ width: 844, height: 390 })
  await page.addStyleTag({
    content: `:root { --safe-top: 0px; --safe-right: 44px; --safe-bottom: 21px; --safe-left: 44px; }`,
  })

  const metrics = await page.evaluate(() => {
    const phone = document.querySelector('.phone') as HTMLElement
    const box = phone.getBoundingClientRect()
    const cs = getComputedStyle(phone)
    return {
      phoneWidth: Math.round(box.width),
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      borderWidth: cs.borderLeftWidth,
    }
  })

  expect(metrics.phoneWidth).toBe(400)
  expect(metrics.borderWidth).not.toBe('0px')
  expect(metrics.paddingLeft).toBe('0px')
  expect(metrics.paddingRight).toBe('0px')
})

test('длинная история: прокрутка, непрочитанные, своя реплика возвращает вниз', async ({ page }) => {
  await page.evaluate(() => {
    const g = (window as unknown as { __alik: { S: { msgs: unknown[]; nextId: number }; notifyMsgs: () => void } }).__alik
    for (let i = 0; i < 1000; i++) {
      g.S.msgs.push({
        id: g.S.nextId++,
        kind: 'text',
        from: i % 2 ? 'me' : 'alik',
        text: `длинное-сообщение-${i}`,
        time: '12:00',
      })
    }
    g.notifyMsgs()
  })

  const chat = page.locator('#chat')
  await expect(page.getByText('длинное-сообщение-999')).toBeVisible()
  await chat.evaluate((el) => {
    el.scrollTop = 0
    el.dispatchEvent(new Event('scroll'))
  })
  await expect(page.getByText('длинное-сообщение-0')).toBeVisible()

  await page.evaluate(() => {
    const g = (window as unknown as { __alik: { push: (m: object) => void } }).__alik
    g.push({ kind: 'text', from: 'alik', text: 'входящее-пока-читаешь', time: '12:05' })
  })
  await expect(page.getByRole('button', { name: /новое сообщение|новых сообщени/i })).toBeVisible()
  await page.getByRole('button', { name: /новое сообщение|новых сообщени/i }).click()
  await expect(page.getByText('входящее-пока-читаешь')).toBeVisible()

  const input = page.getByLabel('Сообщение')
  await input.fill('моя реплика после длинной истории')
  await page.getByLabel('Отправить').click()
  await expect(page.locator('.msg.me').filter({ hasText: 'моя реплика после длинной истории' })).toBeVisible()
  await expect(page.locator('#composer')).toHaveAttribute('aria-busy', 'false', TURN_IDLE)
  const atBottom = await chat.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop <= 30)
  expect(atBottom).toBe(true)
})

test('сброс во время ответа Алика: старая партия не вмешивается', async ({ page }) => {
  page.once('dialog', (d) => d.accept())
  await page.locator('#choices button:not([disabled])').first().click()
  await expect(page.locator('#composer')).toHaveAttribute('aria-busy', 'true')

  await page.getByTitle('Обещания и ачивки').click()
  await page.getByRole('button', { name: 'Начать заново' }).click()

  await expect(page.locator('.chat-head .name')).toHaveText('Алик Воздухонесян')
  await expect(page.locator('#composer')).toHaveAttribute('aria-busy', 'false', TURN_IDLE)
  const introCount = await page.locator('.msg').count()

  await page.waitForTimeout(800)
  await expect(page.locator('.msg')).toHaveCount(introCount)
  await expect(page.locator('#debt')).toHaveText(/240\s000 ₽/)
})

test('интро: строки затухают без обрыва и не накладываются на титул (#517)', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/?fast')
  const intro = page.locator('.intro')
  await expect(intro).toBeVisible({ timeout: 10_000 })
  const hint = page.getByText('Коснитесь, чтобы начать')
  if (await hint.isVisible()) await intro.click()
  await expect(page.locator('.intro-line.on')).toBeVisible()

  const probe = await page.evaluate(async () => {
    const previous = new WeakMap<HTMLElement, number>()
    const outgoing = new Set<string>()
    let maxVisible = 0
    let maxOutDrop = 0
    let outSamples = 0
    let titleFrames = 0
    let frames = 0
    const start = performance.now()
    while (performance.now() - start < 11_000) {
      const lines = [...document.querySelectorAll('.intro-line')] as HTMLElement[]
      let visible = 0
      for (const el of lines) {
        const o = parseFloat(getComputedStyle(el).opacity)
        if (!Number.isFinite(o)) continue
        if (o > 0.08) visible++
        if (el.dataset.phase === 'out') {
          outgoing.add(el.textContent ?? '')
          const before = previous.get(el)
          if (before !== undefined) {
            maxOutDrop = Math.max(maxOutDrop, before - o)
            outSamples++
          }
        }
        previous.set(el, o)
      }
      const title = document.querySelector('.intro-title') as HTMLElement | null
      if (title && parseFloat(getComputedStyle(title).opacity) > 0.08) { visible++; titleFrames++ }
      maxVisible = Math.max(maxVisible, visible)
      frames++
      if (!document.querySelector('.intro')) break
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    return { maxVisible, maxOutDrop, outSamples, outgoing: outgoing.size, titleFrames, frames }
  })

  expect(probe.frames).toBeGreaterThan(100)
  expect(probe.outgoing).toBe(4)
  expect(probe.outSamples).toBeGreaterThan(20)
  expect(probe.titleFrames).toBeGreaterThan(5)
  expect(probe.maxOutDrop, 'резкий обрыв уходящей строки').toBeLessThan(0.75)
  expect(probe.maxVisible, 'строка поверх строки или титула').toBeLessThanOrEqual(1)
})

test('смена фото «без усов» видна в день смены и проходит через 40 дней (#1116)', async ({ page }) => {
  const avatar = page.locator('#avatar')
  const look = () => avatar.evaluate((el) => {
    const s = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    return {
      cls: el.className,
      bg: s.backgroundColor,
      mustache: getComputedStyle(el, '::after').content,
      w: Math.round(box.width),
      cap: el.querySelector('.shaved-cap')?.textContent ?? '',
    }
  })

  await expect(avatar).toHaveText('А')
  const before = await look()
  expect(before.cls).not.toContain('shaved')
  expect(before.mustache).not.toBe('none')
  expect(before.w).toBe(40)
  expect(before.cap).toBe('')

  await page.evaluate(() => {
    const g = (window as unknown as {
      __alik: {
        applyFacts: (ops: object[]) => void
        notifyMsgs: () => void
        S: { day: number; mem: Record<string, unknown> }
        rules: { settle: () => void }
      }
    }).__alik
    g.applyFacts([{ key: 'alik.shaved', op: '=', value: true, forDays: 40 }])
    g.notifyMsgs()
  })
  await expect(avatar).toHaveClass(/shaved/)
  await expect(avatar.locator('.shaved-cap')).toHaveText('без усов')
  await expect(avatar.locator('.shaved-cap')).toBeVisible()
  const shaved = await look()
  expect(shaved.mustache).toBe('none')
  expect(shaved.bg).not.toBe(before.bg)
  expect(shaved.w).toBeGreaterThan(before.w)
  expect(shaved.cap).toBe('без усов')

  await page.evaluate(() => {
    const g = (window as unknown as {
      __alik: { notifyMsgs: () => void; S: { day: number }; rules: { settle: () => void } }
    }).__alik
    g.S.day += 40
    g.rules.settle()
    g.notifyMsgs()
  })
  await expect(avatar).not.toHaveClass(/shaved/)
  await expect(avatar.locator('.shaved-cap')).toHaveCount(0)
  await expect(avatar).toHaveText('А')
  const back = await look()
  expect(back.mustache).not.toBe('none')
  expect(back.bg).toBe(before.bg)
  expect(back.w).toBe(40)
})

test('PWA: манифест, иконки и theme-color на месте (#687)', async ({ page }) => {
  await page.goto('/?fast')
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
  // theme-color — под обе схемы, иначе рамка браузера выламывается из палитры
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2)

  const mfResp = await page.request.get('manifest.webmanifest')
  expect(mfResp.status()).toBe(200)
  const mf = await mfResp.json()
  expect(mf.name).toBe('Алик, где деньги?')
  expect(mf.short_name).toBe('Алик')
  expect(mf.display).toBe('standalone')
  // относительные пути: сборка живёт и на GitHub Pages в подпапке, и локально
  expect(mf.start_url).toBe('./')
  expect(mf.scope).toBe('./')
  // иконки манифеста доступны и это PNG
  expect(mf.icons.length).toBeGreaterThan(0)
  for (const icon of mf.icons) {
    const r = await page.request.get(icon.src)
    expect(r.status(), icon.src).toBe(200)
    expect((await r.headers())['content-type'], icon.src).toContain('image/png')
  }
})
