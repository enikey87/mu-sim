import { expect, test, type APIRequestContext } from '@playwright/test'
import { gzipSync } from 'node:zlib'

/**
 * Ворота размера холодной загрузки (#1447): в бандле нет React, а весь JS укладывается в бюджет.
 *
 * Замеры 27.10 (три прогона, размеры и хеши совпадают):
 * React 19 + react-dom + scheduler — main 1 033,93 кБ raw / 316,03 кБ gzip + шелл 11,44 / 5,11;
 * preact/compat — 829,73 / 255,14 + 11,44 / 5,11. Бюджеты стоят посередине: сборка с React
 * в них не влезает, обычный рост контента — влезает. Отпечатки React проверяются отдельно:
 * размер может совпасть случайно, имя рантайма — нет.
 *
 * Список файлов — из `manifest.json` сборки: главный чанк подгружается динамическим import()
 * из шелла и в разметке его нет, поэтому разбор только index.html мерил бы один шелл (проверено:
 * так ворота проходили на сборке с React).
 */
const BUDGET_RAW_KB = 940
const BUDGET_GZIP_KB = 280

/** Строки, которые есть только у настоящего React: текст ошибок и внутренние имена рантайма. */
const REACT_MARKS = /Minified React error|__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE|react\.dev\/errors/

type Asset = { url: string; raw: number; gzip: number; text: string }

async function assets(request: APIRequestContext): Promise<Asset[]> {
  const res = await request.get('/manifest.json')
  expect(res.ok(), 'manifest.json сборки отдаётся').toBe(true)
  const manifest = (await res.json()) as Record<string, { file?: string }>
  const urls = [...new Set(Object.values(manifest).map((e) => e.file).filter((f): f is string => !!f && f.endsWith('.js')))]
  expect(urls.length, `JS-ассеты в manifest.json (${urls.join(', ')})`).toBeGreaterThanOrEqual(3)
  const out: Asset[] = []
  for (const url of urls) {
    const body = await (await request.get(`/${url}`)).body()
    out.push({ url, raw: body.length, gzip: gzipSync(body, { level: 9 }).length, text: body.toString('utf8') })
  }
  return out
}

test('размер холодной загрузки: весь JS в бюджете', async ({ request }) => {
  const list = await assets(request)
  const raw = list.reduce((n, a) => n + a.raw, 0) / 1024
  const gzip = list.reduce((n, a) => n + a.gzip, 0) / 1024
  const names = list.map((a) => a.url).join(', ')
  expect(raw, `JS raw (${names})`).toBeLessThanOrEqual(BUDGET_RAW_KB)
  expect(gzip, `JS gzip (${names})`).toBeLessThanOrEqual(BUDGET_GZIP_KB)
})

test('в бандле нет React: отпечатки рантайма', async ({ request }) => {
  const list = await assets(request)
  const marked = list.filter((a) => REACT_MARKS.test(a.text)).map((a) => a.url)
  expect(marked, `React вернулся в бандл: ${marked.join(', ')}`).toEqual([])
})
