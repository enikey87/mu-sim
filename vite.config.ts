/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — чтобы сборка работала и на GitHub Pages (подпапка /mu-sim/), и локально
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // Список всех файлов сборки в корне dist: по нему воркер (#1446) предкэширует и динамические
    // чанки приложения — их нет в index.html, а офлайн после первого визита нужен весь пакет.
    manifest: 'manifest.json',
    rollupOptions: {
      // Service worker (#1446) — отдельный вход сборки: браузер ищет его по постоянному адресу
      // (sw.js в корне области), поэтому у этого файла нет хеша в имени, в отличие от остальных.
      input: { index: 'index.html', sw: 'src/sw/worker.ts' },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    // jsdom нужен только файлам, которые реально трогают DOM: они помечены
    // `// @vitest-environment jsdom` (см. analytics/*, platform, ui). Остальным хватает node —
    // создание jsdom на каждый файл стоило ~26% времени прогона (123 создания · 152 с).
    environment: 'node',
    // isolate: false — воркеры переиспользуются между файлами: спавн 123 воркеров (~1.2 с каждый)
    // стоил дороже, чем экономил. Проверено полным прогоном ×4 и перемешиванием файлов
    // (--sequence.shuffle.files): утечек состояния между файлами нет — изменяемое живёт в Game/S,
    // модульное в контенте — константы.
    isolate: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // движок правил изолирован от игры — покрываем его полностью
      include: ['src/engine/rules/**/*.ts'],
      exclude: ['src/engine/rules/**/*.test.ts', 'src/engine/rules/index.ts', 'src/engine/rules/types.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
      reporter: ['text'],
    },
  },
})
