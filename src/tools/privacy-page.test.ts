// Страница «О игре и приватности» (#1484): требование модерации витрин и норма для публичного анонса.
// Проверяется то, чего не видно в браузере: страница статическая (ни скриптов, ни внешних файлов), палитра
// и шрифт взяты из игры, а не выдуманы, и факты о счётчиках, хранении партии и покупках названы все.
// Что она действительно отдаётся сборкой по адресу игры и что ссылка из досье её открывает,
// проверяет tests/e2e/privacy.spec.ts: jsdom не ходит в сеть и не знает, попал ли файл в dist.
import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GAME_URL, PRIVACY_URL } from '../ui/share'

const PAGE = 'public/privacy.html'
const html = existsSync(PAGE) ? readFileSync(PAGE, 'utf8') : ''
const appCss = readFileSync('src/styles.css', 'utf8')

/** Цвета страницы нормализованными: `#fff` и `#ffffff` в палитре одно и то же. */
const colour = (value: string): string => {
  const v = value.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : v
}
/** Вся палитра приложения — вместе с градиентами и рамкой телефона: страница обязана жить в ней. */
const palette = new Set([...appCss.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => colour(m[0])))
const pageColours = [...new Set([...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => colour(m[0])))]

/** Переменные темы из инлайна страницы: `:root { --page: … }` и блок prefers-color-scheme. */
function vars(css: string): Map<string, string> {
  return new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}
const style = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'))
const dark = style.slice(style.search(/@media\s*\(prefers-color-scheme:\s*dark\)/))
const lightVars = vars(style.slice(0, style.search(/@media\s*\(prefers-color-scheme:\s*dark\)/)))
const darkVars = vars(dark)

describe('страница «О игре и приватности»', () => {
  it('лежит в сборке рядом с игрой, и ссылка из игры ведёт именно на неё', () => {
    // Vite копирует publicDir (public/) в корень dist: страница деплоится тем же артефактом, что игра
    expect(existsSync(PAGE), `${PAGE} нет — сборке нечего копировать`).toBe(true)
    expect(PRIVACY_URL.startsWith(GAME_URL)).toBe(true)
    expect(PRIVACY_URL.slice(GAME_URL.length)).toBe('privacy.html')
    expect(PAGE.endsWith(`/${PRIVACY_URL.slice(GAME_URL.length)}`)).toBe(true)
  })

  it('по-русски и статическая: ни скриптов, ни внешних файлов, ни фреймворка', () => {
    expect(html).toContain('<html lang="ru">')
    expect(html).toMatch(/<h1>[^<]*приватност/i)
    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/\bsrc=/)
    expect(html).not.toMatch(/<link\b/)
    expect(html).not.toContain('url(')
    expect(html).not.toContain('@import')
  })

  it('называет все три счётчика и где их данные', () => {
    for (const counter of ['Яндекс Метрика', 'Umami', 'PostHog']) expect(html, counter).toContain(counter)
    expect(html).toContain('в России') // Метрика
    expect(html).toContain('в ЕС') // Umami и PostHog
    // где молчат: адрес игры — единственный, на котором они включаются
    expect(html).toContain('enikey87.github.io/mu-sim')
    for (const quiet of ['?debug', '?fast', '?noidle']) expect(html, quiet).toContain(quiet)
  })

  it('говорит, что уходит, и что не уходит', () => {
    expect(html).toContain('текст твоих сообщений')
    expect(html).toContain('сумма долга')
    expect(html).toContain('Вебвизор')
  })

  it('хранение партии: браузер устройства, облако витрины и что стирает «Начать заново»', () => {
    expect(html).toContain('памяти браузера')
    expect(html).toContain('облаке площадки')
    expect(html).toContain('Начать заново')
    expect(html).toContain('очистить данные сайта')
  })

  it('покупки — через площадку, платёжных данных игра не видит', () => {
    expect(html).toContain('DonationAlerts')
    expect(html).toContain('звёзды')
    expect(html).toContain('не видит и не хранит номер карты')
  })

  it('контакт оператора на месте', () => {
    expect(html).toContain('github.com/enikey87/mu-sim/issues')
    expect(html).toContain('alik_where_money_bot')
  })

  it('обе темы: тёмная переопределяет светлую, а не копирует её', () => {
    expect(style).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/)
    for (const v of ['--page', '--panel', '--text', '--muted', '--accent']) {
      expect(lightVars.has(v), `в светлой теме нет ${v}`).toBe(true)
      expect(darkVars.has(v), `в тёмной теме нет ${v}`).toBe(true)
      expect(darkVars.get(v), `${v}: тёмная тема не отличается от светлой`).not.toBe(lightVars.get(v))
    }
  })

  it('палитра и шрифт — из styles.css, а не выдуманы', () => {
    expect(pageColours.length).toBeGreaterThan(0)
    for (const c of pageColours) expect(palette.has(c), `цвета ${c} нет в палитре игры`).toBe(true)
    // шрифт: та же стопка, что у body приложения
    const stack = /font:\s*15px\/1\.35\s+([^;]+);/.exec(appCss)?.[1].trim()
    expect(stack).toBeTruthy()
    expect(html).toContain(`font: 15px/1.35 ${stack}`)
  })
})
