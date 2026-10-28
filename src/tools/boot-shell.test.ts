// Экран блокировки (#1522): один замок из index.html — часы, обе темы, уровень внизу и сторож.
// Проверяется то, чего не видно в браузере: бюджет инлайна, отсутствие запросов у замка, порог уровня
// через CSS-переменную и происхождение палитры — цвета замка берутся из styles.css, а не выдумываются.
// Что замок действительно рисует первый кадр, что уровень появляется только на загрузке и что чат увозит
// его вверх, проверяет tests/e2e/boot-shell.spec.ts: jsdom не считает ни вёрстку, ни анимацию.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { fmtDate } from '../engine/time'

const html = readFileSync('index.html', 'utf8')
const appCss = readFileSync('src/styles.css', 'utf8')
const shellTs = readFileSync('src/intro/shell.ts', 'utf8')

/** Инлайн-стиль замка: блок между открывающим <style> и </style> в <head>. */
const style = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'))
/** Разметка замка: всё, что лежит между #root и скриптом приложения. */
const shell = html.slice(html.indexOf('<div id="root">'), html.indexOf('<script type="module"'))
/** Инлайн-сторож холодной загрузки (#1477): выполняется до входного скрипта, поэтому живёт в <head>. */
const guard = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

/** Переменные темы из блока styles.css: `:root { --page: … }` и `:root[data-theme="dark"] { … }`. */
function vars(css: string, selector: string): Map<string, string> {
  const at = css.indexOf(selector)
  expect(at, `в styles.css нет блока ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', at)
  const body = css.slice(open + 1, css.indexOf('}', open))
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const light = vars(appCss, ':root {')
const dark = vars(appCss, ':root[data-theme="dark"]')
/** Тёмная палитра в styles.css объявлена дважды (media и data-theme) — «менять вместе» записано там же. */
const darkMedia = appCss.slice(appCss.indexOf('@media (prefers-color-scheme: dark)'))

const colour = (value: string): string => {
  const v = value.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : v
}
/** Все цвета, которые знает палитра приложения, — вместе с градиентом аватара и рамкой телефона. */
const palette = new Set([...appCss.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => colour(m[0])))

const inlineDark = style.slice(style.search(/@media\s*\(prefers-color-scheme:\s*dark\)/))
/** Цвета блока — нормализованными: `#fff` и `#ffffff` в палитре одно и то же; комментарии не считаются. */
const coloursOf = (css: string): Set<string> =>
  new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => colour(m[0])))
/** Тело правила по селектору: `sel { … }` → `…`; вложенные скобки (keyframes) считаются. */
const rule = (css: string, selector: string): string => {
  const at = css.indexOf(`${selector}{`)
  expect(at, `в инлайне нет правила ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', at)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  return ''
}
/** Значения `left` из keyframes уровня: перелёты вокруг центра — единственный признак «уровня», не прогресс-бара. */
const hunt = [...rule(style, '@keyframes hunt').matchAll(/left:(-?\d+)px/g)].map((m) => Number(m[1]))

describe('экран блокировки в index.html', () => {
  it('замок стоит вне #root: React стирает контейнер, а замок доживает до первого кадра чата', () => {
    expect(style).toContain('#intro-frame')
    expect(shell).toContain('<div id="intro-frame">')
    expect(shell).toContain('<div id="lock-screen" class="intro">')
    // #root пуст: интерфейс его наполнит, а уехать замок должен поверх готового чата
    expect(html).toContain('<div id="root"></div>')
    expect(html.indexOf('<div id="root"></div>')).toBeLessThan(html.indexOf('<div id="intro-frame">'))
    // один замок на всю загрузку: второй разметки блокировки в странице нет
    expect([...html.matchAll(/id="lock-screen"/g)]).toHaveLength(1)
  })

  it('часы замка: дата — факт календаря (день 0 партии), время ставит загрузчик', () => {
    expect(shell).toContain(`<div class="intro-date">${fmtDate(0)}</div>`)
    // до загрузчика в разметке прочерк: реальное время без JS не узнать
    expect(shell).toContain('<div class="intro-time">--:--</div>')
    expect(shellTs).toContain("querySelector<HTMLElement>('.intro-time')")
    expect(shellTs).toContain('fmtTime(clockMinutes())')
  })

  it('уровень — капсула с рисками и пузырьком, перелёты вокруг центра, а не линейный пинг-понг', () => {
    const lvl = rule(style, '#lock-screen .lvl')
    expect(lvl).toContain('width:216px')
    expect(lvl).toContain('height:38px')
    expect(lvl).toContain('border:2px solid')
    expect(style).toContain('#lock-screen .lvl::before,#lock-screen .lvl::after')
    // центр пузырька (58 px в капсуле 216 px) — 79 px; перелёты обязаны пересекать его в обе стороны
    const centre = (216 - 58) / 2
    expect(hunt.filter((left) => left < centre).length, '@keyframes hunt').toBeGreaterThan(0)
    expect(hunt.filter((left) => left > centre).length, '@keyframes hunt').toBeGreaterThan(0)
    expect(new Set(hunt).size).toBeGreaterThanOrEqual(4)
  })

  it('порог уровня — параметр CSS: переменная одна, JS её не читает, появление чистым CSS', () => {
    // уровень скрыт, пока загрузка не пошла (класс booting ставит загрузчик): до касания грузить нечего
    expect(rule(style, '#lock-screen .lvl')).toContain('display:none')
    const boot = rule(style, '#lock-screen.booting .lvl')
    expect(boot).toContain('display:block')
    expect(boot).toContain('animation:lvl-in')
    expect(boot).toContain('var(--boot-hint-delay)')
    expect(boot).toContain('backwards')
    expect(rule(style, '@keyframes lvl-in')).toContain('opacity:0')
    // порог объявлен ровно один раз — в инлайн-блоке, с комментарием «меняется здесь»
    expect([...style.matchAll(/--boot-hint-delay\s*:/g)]).toHaveLength(1)
    expect(style).toContain('--boot-hint-delay: .3s')
    expect(style).toContain('меняется в одном месте')
    // копии порога в загрузчике нет: он только добавляет класс, а не считает миллисекунды
    const shellCode = shellTs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(shellCode).not.toContain('boot-hint')
    expect(shellTs).not.toContain('getComputedStyle')
    expect(shellTs).toContain("classList.add('booting')")
  })

  it('второго индикатора нет: «Алик печатает…» из шелла отменён решением оператора', () => {
    expect(html).not.toContain('Алик печатает')
    expect(shell).not.toContain('class="wt"')
    expect(style).not.toContain('.wt')
    expect(style).not.toContain('@keyframes blink')
  })

  it('отказ сети и повтор — одна строка в низу замка, в стиле экрана блокировки', () => {
    expect(shell).toContain('Алик не дозвонился. Проверьте сеть и обновите страницу.')
    expect(rule(style, '#lock-screen .fl')).toContain('display:none')
    expect(style).toContain('#lock-screen.msg .fl,#lock-screen.failed .fl{display:block}')
    // уровень на время строки уходит: два индикатора одновременно не живут
    expect(style).toContain('#lock-screen.msg .lvl,#lock-screen.failed .lvl{display:none}')
    // строка стоит в низу замка, рядом с уровнем, а не отдельным окном
    expect(shell).toContain('<div class="intro-foot">')
    expect(shell.indexOf('class="fl"')).toBeGreaterThan(shell.indexOf('class="intro-foot"'))
  })

  it('подсказка касания и сообщение без JS живут в низу замка', () => {
    // «Коснитесь, чтобы начать» на первом запуске ставит mountIntro — в разметке её нет
    expect(appCss).toContain('.intro-hint')
    expect(shell).toContain('<noscript><p>Игра живёт на JavaScript — включите его.</p></noscript>')
    expect(shell.indexOf('<noscript>')).toBeGreaterThan(shell.indexOf('class="intro-foot"'))
  })

  it('индикатор — чистый CSS: у замка нет ни обработчиков, ни JS', () => {
    expect(style).toContain('@keyframes hunt')
    expect(shell).not.toContain('<script')
    expect(shell).not.toMatch(/\son[a-z]+=/)
  })

  it('не тянет ни одного файла: ни src, ни href, ни url()', () => {
    expect(shell).not.toMatch(/\b(?:src|href)=/)
    expect(shell).not.toContain('url(')
    expect(style).not.toContain('url(')
    expect(style).not.toContain('@import')
  })

  it('сторож бута: ошибка загрузчика, тайм-аут 12 с и guard перезагрузки', () => {
    // Ошибка загрузки скрипта — window error в capture: атрибут onerror сборка снимает с тега (проверено по dist).
    // Тайм-аут — зависание и ошибку исполнения.
    expect(guard).toContain("addEventListener('error'")
    expect(guard).toContain("tagName==='SCRIPT'")
    expect(html.indexOf(guard), 'сторож стоит до входного скрипта').toBeLessThan(html.indexOf('<script type="module"'))
    expect(guard).toContain('setTimeout(fail,12000)')
    expect(guard).toContain('window.__alikBoot')
    // сначала одна авто-перезагрузка под отметкой в sessionStorage, только потом текст: цикла перезагрузок нет
    expect(guard).toContain("'alik-boot-retry'")
    expect(guard).toContain('sessionStorage.getItem')
    expect(guard).toContain('sessionStorage.setItem')
    expect(guard.indexOf('location.reload')).toBeLessThan(guard.indexOf("' failed'"))
    // отказ сторожа виден на замке, а не в исчезнувшем шелле
    expect(guard).toContain("getElementById('lock-screen')")
  })

  it('кнопка повтора спрятана до отказа и остаётся на месте', () => {
    expect(shell).toContain('<button type="button" id="boot-again" hidden>Попробовать снова</button>')
    expect(rule(style, '#boot-again')).toContain('background:#2f9e5c')
  })

  it('инлайн-часть укладывается в бюджет: замок с уровнем и сторожем 4 кБ, титры 4,5 кБ, страница — 30 кБ gzip', () => {
    // бюджет по частям: замок (#1522) и титры интро (#1444) — разные ответственные блоки одного инлайна,
    // и растут они по отдельности
    const atIntro = style.indexOf('/* intro-css:start')
    expect(atIntro, 'в инлайне нет блока титр интро').toBeGreaterThan(0)
    const lock = Buffer.byteLength(`<style>${style.slice(0, atIntro)}</style><script>${guard}</script>${shell}`, 'utf8')
    const intro = Buffer.byteLength(style.slice(atIntro), 'utf8')
    expect(lock).toBeLessThanOrEqual(4096)
    expect(intro).toBeLessThanOrEqual(4608)
    // приёмка #1444: замок и титры вместе — не больше 30 кБ gzip; страница целиком и есть их носитель
    expect(gzipSync(html, { level: 9 }).length).toBeLessThanOrEqual(30 * 1024)
  })

  it('палитра — копия styles.css, а не свои цвета', () => {
    const used = coloursOf(style)
    expect([...used].filter((c) => !palette.has(c))).toEqual([])
    // те же роли, что в приложении: страница, панель пузырька уровня, приглушённый инструмент
    expect(used).toContain(colour(light.get('--page')!))
    expect(used).toContain(colour(light.get('--panel')!))
    expect(used).toContain(colour(light.get('--muted')!))
    expect(used).toContain(colour(light.get('--text')!))
  })

  it('тёмная тема повторяет тёмную палитру styles.css', () => {
    const used = coloursOf(inlineDark)
    expect(used).toContain(colour(dark.get('--page')!))
    expect(used).toContain(colour(dark.get('--muted')!))
    expect(used).toContain(colour(dark.get('--text')!))
    // светлые роли в тёмный блок не просачиваются: страница тёмная, а не светлая
    expect(used).not.toContain(colour(light.get('--page')!))
    // тёмная палитра объявлена в styles.css двумя блоками: media и data-theme — замок копирует media
    expect(darkMedia).toContain(`--muted: ${dark.get('--muted')}`)
  })

  it('reduced-motion: пузырёк замирает у центра, а порог остаётся порогом', () => {
    const block = style.slice(style.indexOf('@media (prefers-reduced-motion:reduce)'))
    expect(block).toContain('#lock-screen .spr{animation:none;left:calc(50% - 29px)}')
    // без затухания: порог держится задержкой, а не анимацией появления
    expect(block).toContain('#lock-screen.booting .lvl{animation-duration:0s}')
  })

  it('узкий экран: рамка снимается, как у .phone, и учитывается safe area', () => {
    const narrow = style.slice(style.indexOf('#intro-frame'))
    expect(narrow).toContain('@media (max-width: 500px)')
    expect(narrow).toContain('width: 100%; height: 100dvh; border: 0; border-radius: 0;')
    expect(narrow).toContain('padding-top: env(safe-area-inset-top, 0px)')
  })
})
