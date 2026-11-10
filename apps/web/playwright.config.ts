import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/a11y',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
  },
  reporter: [['list']],
});
