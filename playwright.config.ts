import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 2 воркера на CI: 26 тестов в один воркер — 40.8s, в два — 22.0s (локальный замер);
  // каждый воркер — свой Chromium, больше двух на 4-ядерном раннере смысла нет.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // сборка в команде: dist/ в дереве стареет, а `vite preview` один молча отдаст его
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false, // чужой сервер на порту должен падать, а не подменять артефакт
    timeout: 120_000,
    stdout: 'pipe', // иначе падение сборки видно как «Exit code: 1» без текста
    name: 'vite preview',
  },
})
