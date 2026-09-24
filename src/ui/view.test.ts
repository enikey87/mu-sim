import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Модули, которым граница не писана: view.ts — сама граница, DebugPanel — инструмент автора. */
const ALLOWED = new Set(['view.ts', 'DebugPanel.tsx'])

const uiFiles = readdirSync('src/ui').filter(
  (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.') && !ALLOWED.has(f),
)

describe('граница UI: снимок из view.ts, а не внутренности движка', () => {
  // пустой список проходит любой тест — проверяем, что страж реально смотрит файлы
  it('список проверяемых модулей не пуст', () => {
    expect(uiFiles.length).toBeGreaterThan(0)
    expect(uiFiles).toContain('Chat.tsx')
  })

  for (const f of uiFiles) {
    const src = readFileSync(`src/ui/${f}`, 'utf8')
    it(`${f} не импортирует контент и не читает S`, () => {
      expect(src).not.toMatch(/from\s+['"]\.\.\/content\//)
      // S недостижим без game.S (любое имя переменной) или деструктуризации { S }
      expect(src).not.toMatch(/\.S\b/)
      expect(src).not.toMatch(/(?<![\w.])S\./)
    })
  }
})
