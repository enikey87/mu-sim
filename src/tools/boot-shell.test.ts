// Шелл холодной загрузки (#1443): инлайн-копия рамки телефона, шапки чата и пузыря «печатает…» в index.html.
// Проверяется то, чего не видно в браузере: бюджет инлайна, отсутствие запросов у шелла и происхождение
// палитры — цвета шелла берутся из styles.css, а не выдумываются. Что шелл действительно рисует первый кадр
// и исчезает при монтировании, проверяет tests/e2e/boot-shell.spec.ts: jsdom не считает вёрстку и анимацию.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const html = readFileSync('index.html', 'utf8')
const appCss = readFileSync('src/styles.css', 'utf8')

/** Инлайн-стиль шелла: блок между открывающим <style> и </style> в <head>. */
const style = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'))
/** Разметка шелла: всё, что лежит внутри #root до скрипта приложения. */
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

const inlineDark = style.slice(style.indexOf('@media (prefers-color-scheme: dark)'))
const inlineLight = style.slice(0, style.indexOf('@media (prefers-color-scheme: dark)'))
/** Цвета блока — нормализованными: `#fff` и `#ffffff` в палитре одно и то же. */
const coloursOf = (css: string): Set<string> => new Set([...css.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => colour(m[0])))
const dots = /<div class="boot-bubble"[^>]*>([\s\S]*?)<\/div>/.exec(shell)?.[1] ?? ''

describe('шелл холодной загрузки в index.html', () => {
  it('лежит внутри #root до скрипта: первый кадр рисуется из одного HTML', () => {
    expect(shell).toContain('<div id="boot"')
    // ничего не должно стоять между #root и шеллом — React стирает содержимое контейнера целиком
    expect(shell.replace('<div id="root">', '').trim().startsWith('<div id="boot"')).toBe(true)
  })

  it('пузырь «печатает…» — три точки, как индикатор набора в чате', () => {
    expect(dots.match(/<i><\/i>/g)).toHaveLength(3)
    expect(style).toContain('#boot .boot-bubble i:nth-child(3)')
    expect(shell).toContain('печатает…')
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
    expect(guard.indexOf('location.reload')).toBeLessThan(guard.indexOf('boot-failed'))
  })

  it('отказ бута: текст в теме игры, кнопка повтора и подсказка без JS', () => {
    expect(shell).toContain('Алик не дозвонился. Проверьте сеть и обновите страницу.')
    expect(shell).toContain('<button type="button" id="boot-again" hidden>Попробовать снова</button>')
    expect(shell).toContain('<noscript><p>Игра живёт на JavaScript — включите его.</p></noscript>')
  })

  it('инлайн-часть укладывается в бюджет: шелл со сторожем 4 кБ, кадр и титры интро 4,5 кБ, страница — 30 кБ gzip', () => {
    // бюджет по частям: шелл холодной загрузки (#1443, с #1477 к нему добавился сторож) и титры интро (#1444) —
    // разные ответственные блоки одного инлайна, и растут они по отдельности
    const atIntro = style.indexOf('/* Рамка титров шелла')
    expect(atIntro, 'в инлайне нет блока кадра и титров интро').toBeGreaterThan(0)
    const boot = Buffer.byteLength(`<style>${style.slice(0, atIntro)}</style><script>${guard}</script>${shell}`, 'utf8')
    const intro = Buffer.byteLength(style.slice(atIntro), 'utf8')
    expect(boot).toBeLessThanOrEqual(4096)
    expect(intro).toBeLessThanOrEqual(4608)
    // приёмка #1444: шелл и титры вместе — не больше 30 кБ gzip; страница целиком и есть их носитель
    expect(gzipSync(html, { level: 9 }).length).toBeLessThanOrEqual(30 * 1024)
  })

  it('палитра — копия styles.css, а не свои цвета', () => {
    const used = coloursOf(style)
    expect([...used].filter((c) => !palette.has(c))).toEqual([])
    // те же роли, что в приложении: страница, телефон, панель, акцент статуса
    expect(used).toContain(colour(light.get('--page')!))
    expect(used).toContain(colour(light.get('--bg')!))
    expect(used).toContain(colour(light.get('--panel')!))
    expect(used).toContain(colour(light.get('--accent')!))
  })

  it('тёмная тема повторяет тёмную палитру styles.css', () => {
    const used = coloursOf(inlineDark)
    expect(used).toContain(colour(dark.get('--page')!))
    expect(used).toContain(colour(dark.get('--bg')!))
    expect(used).toContain(colour(dark.get('--panel')!))
    expect(used).toContain(colour(dark.get('--accent')!))
    expect(used).toContain(colour(dark.get('--muted')!))
    // тёмная палитра объявлена в styles.css двумя блоками: media и data-theme — шелл копирует media
    expect(darkMedia).toContain(`--panel: ${dark.get('--panel')}`)
  })

  it('reduced-motion выключает анимацию точек', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([^}]*\})/.exec(style)?.[1] ?? ''
    expect(block).toContain('#boot .boot-bubble i { animation: none')
  })

  it('узкий экран: рамка снимается, как у .phone, и учитывается safe area', () => {
    expect(inlineLight).toContain('@media (max-width: 500px)')
    expect(inlineLight).toContain('width: 100%; height: 100dvh; border: 0; border-radius: 0;')
    expect(inlineLight).toContain('padding-top: env(safe-area-inset-top, 0px)')
  })
})
