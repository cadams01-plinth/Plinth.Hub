import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright acceptance-test config — SPEC §12 (AT-01…AT-15) and §11
 * performance budgets.
 *
 * Requires a running Hub + seeded Supabase. Set:
 *   PLINTH_E2E_BASE_URL          e.g. http://localhost:3000
 *   NEXT_PUBLIC_SUPABASE_URL     (to mint test sessions / seed)
 *   SUPABASE_SERVICE_ROLE_KEY    (test harness only — seeds + admin tokens)
 *   PLINTH_SSO_PRIVATE_KEY_B64   (AT-14 replay: mint a valid-then-replayed PLT)
 *
 * Tests that require external services (Stripe test clock, Anthropic) are
 * tagged @stripe / @ai and skipped unless the corresponding key is set.
 */
const baseURL = process.env.PLINTH_E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // shared seeded tenant state; keep ordering deterministic
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Chromium is pre-installed in CI images; PLAYWRIGHT_BROWSERS_PATH is set.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // 4G throttling profile for the PDF first-page budget (AT-07 / §11).
    {
      name: 'chromium-4g',
      testMatch: /at07-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
