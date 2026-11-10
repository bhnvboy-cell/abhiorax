import { defineConfig } from '@playwright/test';

/**
 * UAT browser journeys — exercise the real web application at localhost:3000
 * against the live API at localhost:8080/v1.
 *
 * Runs serially (single worker): journeys share the live API, and auth
 * endpoints are rate limited to 10/min per IP. This suite stays within the
 * budget (~8 register + 2 login calls), so no artificial pacing is needed.
 */
export default defineConfig({
  testDir: './tests/uat',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
});
