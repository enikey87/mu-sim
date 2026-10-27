// Титры шелла холодной загрузки (#1444): правила интро и рамка телефона в index.html — инлайн-копии
// src/styles.css. Здесь проверяется то, чего не видно в браузере: копия дословная, рамка та же, что у .phone,
// и входом страницы служит шелл, а не приложение. Что титры действительно идут до прихода пакета,
// проверяет tests/e2e/intro-shell.spec.ts: jsdom не считает ни вёрстку, ни порядок сети.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync('index.html', 'utf8')
const appCss = readFileSync('src/styles.css', 'utf8')

/** Инлайн-стиль страницы: блок между открывающим <style> и </style> в <head>. */
const style = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'))

/** Блок правил интро между маркерами intro-css:start/end — один и тот же текст в двух файлах. */
const introBlock = (css: string): string => {
  const at = css.indexOf('/* intro-css:start')
  const end = css.indexOf('/* intro-css:end */')
  expect(at, 'нет маркера intro-css:start').toBeGreaterThanOrEqual(0)
  expect(end, 'нет маркера intro-css:end').toBeGreaterThan(at)
  return css.slice(at, end)
}

/** Сравнение «дословно» без учёта пояснительных комментариев и переносов строк. */
const norm = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()

/** Объявления правила по селектору: `sel { a: b; c: d }` → { a: b, c: d }. */
const declarations = (css: string, selector: string): Map<string, string> => {
  const at = css.indexOf(`${selector} {`)
  expect(at, `в styles.css нет правила ${selector}`).toBeGreaterThanOrEqual(0)
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
  return new Map([...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

describe('титры шелла в index.html', () => {
  it('вход страницы — шелл, приложение грузится его динамическим import()', () => {
    expect(html).toContain('<script type="module" src="/src/intro/shell.ts">')
    expect(html).not.toContain('/src/main.tsx')
  })

  it('правила интро — дословная копия блока intro-css из styles.css', () => {
    expect(norm(introBlock(style))).toBe(norm(introBlock(appCss)))
  })

  it('копия полная: в ней есть все пять состояний экрана, которые играет модуль титров', () => {
    const block = introBlock(style)
    for (const rule of ['.intro {', '.intro-line.on', '.intro-line.out', '.intro-title.on', '.intro-moo', '.intro-hint', '.intro-leave', '.intro-reduced']) {
      expect(block, rule).toContain(rule)
    }
    expect(block).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('рамка титров — та же коробка, что у .phone: в неё встаёт приложение после уезда', () => {
    const phone = declarations(appCss, '.phone')
    const frame = declarations(style, '#intro-frame')
    for (const prop of ['width', 'height', 'border', 'border-radius']) {
      expect(frame.get(prop), prop).toBe(phone.get(prop))
    }
  })

  it('узкий экран: рамка снимается так же, как у .phone', () => {
    const narrow = style.slice(style.indexOf('@media (max-width: 500px)'))
    expect(narrow).toContain('width: 100%; height: 100dvh; border: 0; border-radius: 0;')
    expect(appCss).toContain('width: 100%; height: 100dvh; border: 0; border-radius: 0;')
  })
})
