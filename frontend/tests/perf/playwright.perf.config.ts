import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone Playwright config for this performance review, kept separate from the root
 * `playwright.config.ts` (owned by the main app) so this independent pass does not touch it, and
 * pointed at its own port so it never fights the shared dev server other agents may be using on
 * 5173 (see `docs/PROGRESS.md`, "Known issues": an orphan dev server has been left on 5173 by
 * prior phases, without `VITE_ENABLE_DEV_TOKEN_LOGIN`, which the mocked sign-in needs).
 *
 * Run from `frontend/`:
 *   npx playwright test --config tests/perf/playwright.perf.config.ts
 */
const PORT = 5190;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.perf.spec.ts',
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_ENABLE_DEV_TOKEN_LOGIN: 'true' },
  },
});
