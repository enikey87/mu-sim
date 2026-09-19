/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — чтобы сборка работала и на GitHub Pages (подпапка /mu-sim/), и локально
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
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
