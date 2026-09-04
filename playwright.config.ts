import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'node e2e/authorization-server.mjs', url: 'http://127.0.0.1:3002/health', reuseExistingServer: !process.env.CI, timeout: 10_000 },
    {
      command: 'pnpm dev:plugin',
      url: 'http://localhost:3001/plugins/kubeeye/1.0.0/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev:host',
      url: 'http://localhost:3000/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
