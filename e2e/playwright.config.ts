import { defineConfig, devices } from '@playwright/test';

// End-to-end payment test (S2-17) against a running site with Stripe sandbox keys: the shared test
// site by default, or a local server with its own sandbox keys. Not part of CI, because it places
// real sandbox orders and waits for Stripe's webhook. Run it by hand:
//
//   npx playwright install chromium        (once per machine)
//   npm run e2e:payment                    (BASE_URL=http://localhost:3000 npm run e2e:payment for local)
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  retries: 0,
  workers: 1, // one order at a time, so the steps are easy to follow in the report
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://pizza-group1-defxdagdbsh6hmfv.mexicocentral-01.azurewebsites.net',
    timezoneId: 'America/Denver', // the store's time zone, so the requested time is read as the store reads it
    viewport: { width: 390, height: 844 }, // a phone, the smallest screen the checkout supports
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
});
