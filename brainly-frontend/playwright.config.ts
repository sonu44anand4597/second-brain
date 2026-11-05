import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 45000,
  expect: { timeout: 10000 }, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5187', trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { ...(process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : {}) } },
  webServer: [
    { command: 'node --import tsx ../scripts/test-server.ts', url: 'http://127.0.0.1:3087/api/v1/health', env: { CLIENT_ORIGIN: 'http://127.0.0.1:5187' }, reuseExistingServer: false, timeout: 180000 },
    { command: 'npm run dev -- --port 5187 --strictPort', url: 'http://127.0.0.1:5187', env: { API_PROXY_TARGET: 'http://127.0.0.1:3087' }, reuseExistingServer: false, timeout: 30000 },
  ],
});
