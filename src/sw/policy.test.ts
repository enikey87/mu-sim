// Таблица решений воркера (#1446): какой запрос кэшируется навсегда, какой идёт в сеть первой,
// какой воркер не трогает. Что решения действительно работают в браузере — tests/e2e/sw.spec.ts.
import { describe, expect, it } from 'vitest'
import { assetUrls, isAsset, manifestUrls, shellKey, strategyOf } from './policy'

const SCOPE = 'https://enikey87.github.io/mu-sim/'

const plan = (url: string, extra: { mode?: string; method?: string; scope?: string } = {}) =>
  strategyOf({ url, scope: extra.scope ?? SCOPE, mode: extra.mode, method: extra.method })

describe('стратегия запроса', () => {
  it('хешированные файлы сборки — из кэша, в сеть только за промахом', () => {
    expect(plan(`${SCOPE}assets/index-BhEuQiHn.js`)).toEqual({ kind: 'cache-first' })
    expect(plan(`${SCOPE}assets/bull-CkRw6t2s.svg`)).toEqual({ kind: 'cache-first' })
  })

  it('иконки манифеста кэшируются как ассеты, хотя хеша в имени у них нет', () => {
    expect(isAsset('/mu-sim/icon-192.png')).toBe(true)
    expect(isAsset('/mu-sim/icon-512-maskable.png')).toBe(true)
    expect(isAsset('/mu-sim/apple-touch-icon.png')).toBe(true)
    expect(isAsset('/mu-sim/manifest.webmanifest')).toBe(false)
  })

  it('навигация — сеть первой, а кэш помнит шелл, а не каждый адрес с параметрами', () => {
    const shell = { kind: 'network-first', key: `${SCOPE}` }
    expect(plan(`${SCOPE}`, { mode: 'navigate' })).toEqual(shell)
    expect(plan(`${SCOPE}?fast&nointro`, { mode: 'navigate' })).toEqual(shell)
    expect(plan(`${SCOPE}index.html`, { mode: 'navigate' })).toEqual(shell)
  })

  it('навигация мимо шелла не кэшируется: воркер не подменяет чужие страницы области', () => {
    expect(plan(`${SCOPE}other.html`, { mode: 'navigate' })).toEqual({ kind: 'pass' })
  })

  it('манифест — сеть первой: правка манифеста подхватывается визитом', () => {
    expect(plan(`${SCOPE}manifest.webmanifest`)).toEqual({
      kind: 'network-first',
      key: `${SCOPE}manifest.webmanifest`,
    })
  })

  it('чужие хосты (аналитика) идут мимо воркера', () => {
    expect(plan('https://mc.yandex.ru/metrika/tag.js')).toEqual({ kind: 'pass' })
    expect(plan('https://cloud.umami.is/script.js')).toEqual({ kind: 'pass' })
    expect(plan('https://eu.i.posthog.com/static/array.js')).toEqual({ kind: 'pass' })
    expect(plan('https://enikey87.github.io/elsewhere/app.js')).toEqual({ kind: 'pass' })
  })

  it('не-GET и файлы вне ассетов не кэшируются', () => {
    expect(plan(`${SCOPE}assets/index-BhEuQiHn.js`, { method: 'POST' })).toEqual({ kind: 'pass' })
    expect(plan(`${SCOPE}notes.txt`)).toEqual({ kind: 'pass' })
  })

  it('область без слэша на конце и во вложенной папке (Telegram-сборка) считается той же', () => {
    const telegram = 'https://enikey87.github.io/mu-sim/t/'
    expect(shellKey(telegram)).toBe(telegram)
    expect(plan(`${telegram}?fast`, { mode: 'navigate', scope: telegram })).toEqual({
      kind: 'network-first',
      key: telegram,
    })
    // воркер веб-корня не считает шеллом навигацию в соседнюю сборку
    expect(plan(`${telegram}`, { mode: 'navigate' })).toEqual({ kind: 'pass' })
  })
})

describe('что кэшировать при установке', () => {
  const html = `<!doctype html><html><head>
    <link rel="manifest" href="./manifest.webmanifest">
    <link rel="apple-touch-icon" href="./icon-180.png">
    <link rel="icon" href="data:image/svg+xml,<svg/>">
    <script type="module" crossorigin src="./assets/index-BhEuQiHn.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/main-BSEP5gQ3.css">
    <link rel="preconnect" href="https://mc.yandex.ru">
  </head><body></body></html>`

  it('берёт ссылки шелла: пакет, стили, манифест, иконку', () => {
    expect(assetUrls(html, `${SCOPE}`)).toEqual([
      `${SCOPE}manifest.webmanifest`,
      `${SCOPE}icon-180.png`,
      `${SCOPE}assets/index-BhEuQiHn.js`,
      `${SCOPE}assets/main-BSEP5gQ3.css`,
    ])
  })

  it('инлайн-иконка и чужие хосты в кэш не попадают', () => {
    const urls = assetUrls(html, `${SCOPE}`)
    expect(urls.some((url) => url.startsWith('data:'))).toBe(false)
    expect(urls.some((url) => url.includes('mc.yandex.ru'))).toBe(false)
  })

  it('повтор ссылки — один адрес: предкэш не качает файл дважды', () => {
    expect(assetUrls('<script src="./a.js"></script><script src="./a.js"></script>', `${SCOPE}`)).toEqual([
      `${SCOPE}a.js`,
    ])
  })
})

describe('файлы сборки из manifest.json', () => {
  const manifest = {
    'index.html': {
      file: 'assets/index-PAKLJGiz.js',
      isEntry: true,
      dynamicImports: ['src/main.tsx'],
    },
    'src/main.tsx': {
      file: 'assets/main-te7Z2rXB.js',
      isDynamicEntry: true,
      imports: ['index.html'],
      css: ['assets/main-BSEP5gQ3.css'],
      assets: ['assets/bull-CkRw6t2s.svg'],
    },
    'src/sw/worker.ts': { file: 'sw.js', isEntry: true },
  }

  it('берёт динамический чанк приложения, его стили и картинки — то, чего нет в index.html', () => {
    expect(manifestUrls(manifest, `${SCOPE}`)).toEqual([
      `${SCOPE}assets/index-PAKLJGiz.js`,
      `${SCOPE}assets/main-te7Z2rXB.js`,
      `${SCOPE}assets/main-BSEP5gQ3.css`,
      `${SCOPE}assets/bull-CkRw6t2s.svg`,
      `${SCOPE}sw.js`,
    ])
  })

  it('мусор вместо списка сборки не роняет предкэш', () => {
    expect(manifestUrls(null, `${SCOPE}`)).toEqual([])
    expect(manifestUrls('нет', `${SCOPE}`)).toEqual([])
    expect(manifestUrls({ 'a.ts': null, 'b.ts': 'строка', 'c.ts': { file: 42 } }, `${SCOPE}`)).toEqual([])
  })

  it('чужой адрес в списке не кэшируется', () => {
    expect(manifestUrls({ 'a.ts': { file: 'https://cdn.example.com/a.js' } }, `${SCOPE}`)).toEqual([])
  })
})
