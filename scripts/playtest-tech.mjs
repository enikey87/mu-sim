/**
 * Round-2+ tech hunt. Clears localStorage. Prints JSON findings.
 */
import { chromium, devices } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const findings = []
const note = (sev, id, detail) => findings.push({ sev, id, detail })

async function fresh(page) {
  await page.goto(`${BASE}/?fast`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/?fast`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chat-head .name')
}

async function waitIdle(page) {
  await page.waitForFunction(() => window.__alik && !window.__alik.busy && !window.__alik.dead, null, { timeout: 20000 })
}

async function run(label, device) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext(device ? { ...device } : { viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()) })
  try {
    await fresh(page)

    // play a few turns
    for (let i = 0; i < 3; i++) {
      await waitIdle(page)
      await page.locator('#choices button:not([disabled])').first().click()
    }
    await waitIdle(page)

    // sheet
    await page.locator('#infoBtn').click()
    const sheet = page.getByRole('dialog', { name: 'Досье на Алика' })
    if (!(await sheet.isVisible())) note('P1', `${label}/sheet`, '')
    else {
      if ((await page.locator('.phone-surface').getAttribute('inert')) === null) note('P1', `${label}/sheet-inert`, '')
      await page.keyboard.press('Escape')
    }

    // ending + toast outside inert
    await page.evaluate(() => {
      const g = window.__alik
      g.S.ending = 'family'
      g.emit()
      g.flash('Скопировано')
    })
    await page.waitForSelector('#endingScreen')
    const toastProbe = await page.evaluate(() => {
      const t = document.getElementById('toast')
      const s = document.querySelector('.phone-surface')
      return {
        text: t?.textContent,
        underInert: !!(t && t.closest('[inert]')),
        inSurface: !!(t && s?.contains(t)),
        z: t ? getComputedStyle(t).zIndex : null,
      }
    })
    if (toastProbe.underInert || toastProbe.inSurface) note('P2', `${label}/toast-inert`, JSON.stringify(toastProbe))
    if (Number(toastProbe.z) < 45) note('P2', `${label}/toast-z`, toastProbe.z)
    await page.keyboard.press('Escape')

    // payday copy fail
    await fresh(page)
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      })
      document.execCommand = () => false
      const g = window.__alik
      g.S.ending = 'payday_coins'
      g.S.mem['payday.chain'] = 'chain'
      g.emit()
    })
    if (await page.locator('#copyExcuse').count()) {
      await page.locator('#copyExcuse').click()
      await page.waitForTimeout(200)
      const t = (await page.locator('#toast').textContent()) || ''
      if (!/Не удалось/.test(t)) note('P1', `${label}/copy-fail-toast`, t)
      const under = await page.evaluate(() => !!document.getElementById('toast')?.closest('[inert]'))
      if (under) note('P2', `${label}/copy-toast-inert`, '')
    } else note('P3', `${label}/copy-btn`, 'payday_coins без кнопки?')
    await page.evaluate(() => { window.__alik.closeEnding() })

    // dead focus
    await fresh(page)
    await page.evaluate(() => window.__alik.die())
    await page.waitForSelector('#chargeBtn')
    if ((await page.evaluate(() => document.activeElement?.id)) !== 'chargeBtn') note('P2', `${label}/dead-focus`, '')
    if ((await page.locator('.phone-surface').getAttribute('inert')) === null) note('P1', `${label}/dead-inert`, '')

    // voice keyboard
    await fresh(page)
    await page.evaluate(() => window.__alik.push({ kind: 'voice', from: 'alik', len: '07', time: '12:00' }))
    const voiceOk = await page.evaluate(() => {
      const el = document.querySelector('.voice')
      if (!el) return false
      el.focus()
      return document.activeElement === el && el.getAttribute('tabindex') === '0'
    })
    if (!voiceOk) note('P2', `${label}/voice-kb`, '')

    // reduced motion selectors
    const reduce = await page.evaluate(() => {
      let block = ''
      for (const s of document.styleSheets) {
        try {
          for (const r of s.cssRules) {
            if (r instanceof CSSMediaRule && String(r.media).includes('prefers-reduced-motion'))
              block += [...r.cssRules].map((x) => x.cssText).join('\n')
          }
        } catch { /* */ }
      }
      return block
    })
    if (!/\.msg\b/.test(reduce)) note('P2', `${label}/reduce-msg`, '')
    if (!/new-messages/.test(reduce)) note('P2', `${label}/reduce-new`, '')

    // feel sticky cleared (animationend may not fire in headless for pseudo — check shake)
    await page.evaluate(() => {
      const g = window.__alik
      g.feel = 'shake'
      g.feelId++
      g.emit()
    })
    await page.waitForTimeout(50)
    await page.evaluate(() => {
      document.querySelector('.phone')?.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }))
    })
    await page.waitForTimeout(30)
    const feelLeft = await page.evaluate(() => document.querySelector('.phone')?.className || '')
    if (/feel-shake/.test(feelLeft)) note('P3', `${label}/feel-sticky`, feelLeft)

    // mute aria
    const mute = await page.evaluate(() => {
      const b = document.getElementById('muteBtn')
      return { label: b?.getAttribute('aria-label'), pressed: b?.getAttribute('aria-pressed') }
    })
    if (!mute.label || mute.pressed === null) note('P3', `${label}/mute-aria`, JSON.stringify(mute))

    // unread (чистая страница — без leftover ending/dead)
    await fresh(page)
    await page.evaluate(() => {
      const g = window.__alik
      for (let i = 0; i < 35; i++) g.push({ kind: 'text', from: 'alik', text: `p${i}\n.\n.`, time: '12:00' })
    })
    await page.evaluate(() => {
      const c = document.getElementById('chat')
      c.scrollTop = 0
      c.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(40)
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) window.__alik.push({ kind: 'text', from: 'alik', text: `u${i}`, time: '12:00' })
    })
    await page.waitForTimeout(80)
    const overlay = await page.evaluate(() => ({
      ending: !!document.getElementById('endingScreen'),
      dead: !!document.querySelector('#deadScreen:not(.hidden)'),
    }))
    if (overlay.ending) note('P1', `${label}/ending-stuck`, 'концовка на свежей странице')
    if (overlay.dead) note('P1', `${label}/dead-stuck`, '')
    if (!(await page.locator('.new-messages').isVisible())) note('P2', `${label}/unread`, '')
    else {
      await page.locator('.new-messages').click({ timeout: 5000 })
      const ok = await page.evaluate(() => {
        const el = document.getElementById('chat')
        return el.scrollHeight - el.clientHeight - el.scrollTop <= 24
      })
      if (!ok) note('P2', `${label}/unread-scroll`, '')
    }

    // live cap
    await fresh(page)
    await page.evaluate(() => {
      const g = window.__alik
      for (let i = 0; i < 1100; i++) g.S.msgs.push({ kind: 'text', from: 'alik', id: 800000 + i, text: `b${i}`, time: '12:00' })
      g.notifyMsgs()
    })
    await page.waitForTimeout(150)
    const cap = await page.evaluate(() => ({
      dom: document.querySelectorAll('[data-testid=msg]').length,
      sep: [...document.querySelectorAll('.sep')].some((e) => e.textContent.includes('···')),
    }))
    if (cap.dom > 1005 || !cap.sep) note('P2', `${label}/cap`, JSON.stringify(cap))

    // dispose
    await fresh(page)
    await page.locator('#choices button:not([disabled])').first().click()
    await page.waitForTimeout(15)
    const pending = await page.evaluate(() => { window.__alik.dispose(); return window.__alik.pendingTimers() })
    if (pending > 0) note('P1', `${label}/dispose`, String(pending))

    if (device) {
      const fs = await page.getByLabel('Сообщение').evaluate((el) => getComputedStyle(el).fontSize)
      if (parseFloat(fs) < 16) note('P2', `${label}/font`, fs)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
      if (overflow) note('P2', `${label}/overflow`, '')
    }

    if (errors.length) note('P1', `${label}/pageerror`, errors.slice(0, 6).join(' | '))
  } finally {
    await browser.close()
  }
}

await run('desktop', null)
await run('pixel', devices['Pixel 7'])
await run('iphone', devices['iPhone 12'])
console.log(JSON.stringify({ findings, count: findings.length }, null, 2))
