import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // The dev-token sign-in tab (spec 2.2/3.5) must be on for every E2E spec that signs in; this
    // is a boolean feature flag, never a secret, so it is safe to set here rather than depend on
    // a local .env file (which stays empty/untracked, see ADR-002).
    env: { VITE_ENABLE_DEV_TOKEN_LOGIN: 'true' },
  },
});
