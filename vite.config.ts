/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — чтобы сборка работала и на GitHub Pages (подпапка /mu-sim/), и локально
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    // React в бандле — только имя API: реализация — preact/compat, те же хуки и те же события
    // под теми же импортами (docs/PREACT_SWAP.md). Префиксные ключи закрывают и подпути:
    // react/jsx-runtime → preact/compat/jsx-runtime, react-dom/client → preact/compat/client,
    // react-dom/test-utils → preact/compat/test-utils (act для @testing-library/react).
    // В dev и в vitest алиасы действуют так же — конфиг один.
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
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
    // @testing-library/react грузит реализацию React по require('react'/'react-dom') из CJS-сборки
    // (внешний модуль резолвится Node мимо алиасов) — и RTL сажает элементы preact (наш импорт)
    // в настоящий react-dom: «A React Element from an older version of React was rendered».
    // ESM-сборка RTL импортирует те же имена статически, поэтому через алиас и инлайн она видит
    // preact/compat — тот же рантайм, что и интерфейс, включая act из preact/compat/test-utils.
    alias: {
      '@testing-library/react': fileURLToPath(
        new URL('./node_modules/@testing-library/react/dist/@testing-library/react.esm.js', import.meta.url),
      ),
    },
    server: { deps: { inline: [/@testing-library\/react/] } },
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
