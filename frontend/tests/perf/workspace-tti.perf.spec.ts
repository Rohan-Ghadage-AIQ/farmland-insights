import { expect, test } from '@playwright/test';
import { mockAnalyze, mockAuth, mockHealth, signIn } from '../e2e/fixtures/mock-api';

/**
 * Measures real, wall-clock timings for the login page and the signed-in workspace, against a
 * dedicated dev server (see `playwright.perf.config.ts`) with the backend mocked at the network
 * layer exactly as `tests/e2e/happy-path.spec.ts` does (no real backend, no real PropelAuth —
 * ADR-002 / this review's safety rules).
 *
 * This file only reads existing app behaviour through the browser; it does not change `src/`.
 * Numbers are recorded in `docs/BENCHMARKS.md`, not asserted here as pass/fail thresholds (a
 * single sample on one dev machine is not a reliable regression gate for that; see the doc).
 */

test('login page: navigation timing', async ({ page }) => {
  const start = Date.now();
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Farmland Insights' })).toBeVisible();
  const wallClockMs = Date.now() - start;

  const navTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paints = performance
      .getEntriesByType('paint')
      .map((entry) => ({ name: entry.name, startTime: entry.startTime }));
    return {
      domContentLoaded: nav.domContentLoadedEventEnd,
      domInteractive: nav.domInteractive,
      loadEventEnd: nav.loadEventEnd,
      transferSize: nav.transferSize,
      paints,
    };
  });

  console.log(`[perf] /login goto()->visible wall clock: ${String(wallClockMs)}ms`);

  console.log(`[perf] /login navigation timing: ${JSON.stringify(navTiming)}`);
});

test('workspace: time from sign-in click to interactive setup panel, then analyze round trip', async ({
  page,
}) => {
  await mockHealth(page);
  await mockAuth(page);
  await mockAnalyze(page);

  const signInStart = Date.now();
  await signIn(page);
  // "Interactive" = the first setup-panel control a user would act on is actually clickable.
  const loadSampleButton = page.getByRole('button', { name: /load sample field/i });
  await expect(loadSampleButton).toBeVisible();
  await expect(loadSampleButton).toBeEnabled();
  const ttiMs = Date.now() - signInStart;

  console.log(
    `[perf] sign-in click -> workspace interactive (Load sample field enabled): ${String(ttiMs)}ms`,
  );

  const loadedChunks = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.endsWith('.js') || entry.name.endsWith('.css'))
      .map((entry) => ({
        name: entry.name.split('/').pop(),
        transferSize: (entry as PerformanceResourceTiming).transferSize,
        duration: Math.round(entry.duration),
        startTime: Math.round(entry.startTime),
      })),
  );

  console.log(
    `[perf] JS/CSS chunks loaded by the time workspace is interactive: ${JSON.stringify(loadedChunks)}`,
  );

  await loadSampleButton.click();
  const cropCombobox = page.getByRole('combobox', { name: 'Crop' });
  await expect(cropCombobox).toBeVisible();
  await cropCombobox.click();
  await cropCombobox.fill('Wheat');
  await page.getByRole('option', { name: /^Wheat/ }).click();

  await page.getByRole('button', { name: /Step 3: Period/ }).click();
  await page.getByRole('button', { name: /Select dates/ }).click();
  await page.getByRole('button', { name: 'Last 30 days' }).click();

  const analyzeButton = page.getByRole('button', { name: 'Analyze' });
  await expect(analyzeButton).toBeEnabled();

  const analyzeStart = Date.now();
  await analyzeButton.click();
  await expect(page.getByText(/cells needing attention/i)).toBeVisible({ timeout: 10_000 });
  const analyzeMs = Date.now() - analyzeStart;

  console.log(
    `[perf] Analyze click -> results rendered (mocked 500ms /analyze): ${String(analyzeMs)}ms`,
  );
});
