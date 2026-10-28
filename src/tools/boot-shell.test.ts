// Шелл холодной загрузки (#1443, #1476): инлайн-уровень и пузырёк ожидания в index.html.
// Проверяется то, чего не видно в браузере: бюджет инлайна, отсутствие запросов у шелла, отсутствие JS
// у индикатора и происхождение палитры — цвета шелла берутся из styles.css, а не выдумываются.
// Что шелл действительно рисует первый кадр и исчезает при монтировании,
// проверяет tests/e2e/boot-shell.spec.ts: jsdom не считает ни вёрстку, ни анимацию.
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

describe('шелл холодной загрузки в index.html', () => {
  it('лежит внутри #root до скрипта: первый кадр рисуется из одного HTML', () => {
    expect(shell).toContain('<div id="boot"')
    // ничего не должно стоять между #root и шеллом — React стирает содержимое контейнера целиком
    expect(shell.replace('<div id="root">', '').trim().startsWith('<div id="boot"')).toBe(true)
  })

  it('первое окно — уровень, а не фальш-чат: ни рамки телефона, ни шапки с аватаром', () => {
    expect(rule(style, '#boot .lvl')).toContain('border:2px solid')
    expect(shell).toContain('<div class="lvl" aria-hidden="true"><span class="spr"></span></div>')
    for (const chat of ['boot-head', 'boot-ava', 'boot-name', 'boot-status', 'boot-bubble']) {
      expect(shell, chat).not.toContain(chat)
    }
  })

  it('уровень — капсула с рисками и пузырьком, перелёты вокруг центра, а не линейный пинг-понг', () => {
    const lvl = rule(style, '#boot .lvl')
    expect(lvl).toContain('width:216px')
    expect(lvl).toContain('height:38px')
    expect(style).toContain('#boot .lvl::before,#boot .lvl::after')
    // центр пузырька (58 px в капсуле 216 px) — 79 px; перелёты обязаны пересекать его в обе стороны
    const centre = (216 - 58) / 2
    expect(hunt.filter((left) => left < centre).length, '@keyframes hunt').toBeGreaterThan(0)
    expect(hunt.filter((left) => left > centre).length, '@keyframes hunt').toBeGreaterThan(0)
    expect(new Set(hunt).size).toBeGreaterThanOrEqual(4)
  })

  it('индикатор — чистый CSS: у шелла нет ни обработчиков, ни JS', () => {
    expect(style).toContain('@keyframes hunt')
    expect(shell).not.toContain('<script')
    expect(shell).not.toMatch(/\son[a-z]+=/)
  })

  it('второе окно — «Алик печатает…», скрыто до класса waiting у #boot', () => {
    expect(shell).toContain('<div class="wt"><i></i><i></i><i></i><span>Алик печатает…</span></div>')
    expect(rule(style, '#boot .wt')).toContain('display:none')
    expect(style).toContain('#boot.waiting .wt{display:flex}')
    // точки набора — те же три, что в чате
    expect(style).toContain('#boot .wt i:nth-child(2)')
    expect(style).toContain('#boot .wt i:nth-child(3)')
  })

  it('отказ сети виден строкой, а не вечным индикатором', () => {
    expect(shell).toContain('Алик не дозвонился. Проверьте сеть и обновите страницу.')
    expect(rule(style, '#boot .fl')).toContain('display:none')
    expect(style).toContain('#boot.failed .fl{display:block}')
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
    // те же роли, что в приложении: страница, панель пузырька, приглушённый инструмент
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
    expect(used).toContain(colour(dark.get('--panel')!))
    // светлые роли в тёмный блок не просачиваются: страница тёмная, а не светлая
    expect(used).not.toContain(colour(light.get('--page')!))
    // тёмная палитра объявлена в styles.css двумя блоками: media и data-theme — шелл копирует media
    expect(darkMedia).toContain(`--panel: ${dark.get('--panel')}`)
  })

  it('reduced-motion: пузырёк замирает у центра, точки не мигают', () => {
    const block = style.slice(style.indexOf('@media (prefers-reduced-motion:reduce)'))
    expect(block).toContain('#boot .spr{animation:none;left:calc(50% - 29px)}')
    expect(block).toContain('#boot .wt i{animation:none;opacity:1}')
  })

  it('узкий экран: рамка снимается, как у .phone, и учитывается safe area', () => {
    const narrow = style.slice(style.indexOf('#intro-frame'))
    expect(narrow).toContain('@media (max-width: 500px)')
    expect(narrow).toContain('width: 100%; height: 100dvh; border: 0; border-radius: 0;')
    expect(narrow).toContain('padding-top: env(safe-area-inset-top, 0px)')
  })
})
