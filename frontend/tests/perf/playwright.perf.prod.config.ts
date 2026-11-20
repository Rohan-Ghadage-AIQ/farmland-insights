import { defineConfig, devices } from '@playwright/test';

// Invoke this config from `frontend/` (see the run command below); `dist-perf` is resolved
// relative to that cwd, same as `playwright.config.ts`'s own `pnpm dev` convention.

/**
 * Same perf specs as `playwright.perf.config.ts`, but against the real **production build**
 * (`vite build` + `vite preview`) instead of the dev server, so timings reflect the minified,
 * code-split bundle a user actually gets — not Vite dev's unbundled ES modules.
 *
 * The build this serves (`dist-perf/`) is built once with `VITE_ENABLE_DEV_TOKEN_LOGIN=true` so
 * the mocked sign-in flow (`tests/e2e/fixtures/mock-api.ts`) still works without a real backend;
 * confirmed in `docs/BENCHMARKS.md` that this does not meaningfully change bundle size.
 *
 * Build once, then run from `frontend/`:
 *   VITE_ENABLE_DEV_TOKEN_LOGIN=true npx vite build --outDir dist-perf
 *   npx playwright test --config tests/perf/playwright.perf.prod.config.ts
 */
const PORT = 5191;

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
    command: `npx vite preview --outDir dist-perf --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    cwd: process.cwd(),
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
