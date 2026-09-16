import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3200', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node e2e/authorization-server.mjs',
      url: 'http://127.0.0.1:3002/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node scripts/preview-routing.mjs',
      url: 'http://127.0.0.1:3200',
      reuseExistingServer: false,
    },
  ],
});
