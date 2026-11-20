import { expect, test } from '@playwright/test';
import { DEV_EMAIL, mockHappyPath, signIn } from './fixtures/mock-api';

/**
 * The E2E happy path (spec 5.2 / BUILD_PROMPT): sign in, load the sample field, pick a crop and
 * period, analyze, select a cell, export CSV. The backend is mocked through route interception
 * (`mockHappyPath`), so this runs with no running FastAPI process and no PropelAuth account.
 */
test.describe('happy path (mocked backend)', () => {
  test.beforeEach(async ({ page }) => {
    await mockHappyPath(page);
  });

  test('sign in, load the sample field, analyze, select a cell, export CSV', async ({ page }) => {
    // / is behind RouteGuard with no session: redirected to /login.
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);

    // Sign in (dev token flow, spec 2.2/3.5), back to the workspace shell.
    await signIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Farmland Insights' })).toBeVisible();
    await expect(page.getByText('API reachable')).toBeVisible();
    await expect(page.getByText(DEV_EMAIL)).toBeVisible();

    // Step 1: field, via the sample fixture (spec 3.3.1).
    await page.getByRole('button', { name: 'Load sample field' }).click();
    await expect(page.getByText(/ha/).first()).toBeVisible();

    // Step 2: crop.
    const crop = page.getByRole('combobox', { name: 'Crop' });
    await crop.click();
    await crop.fill('Wheat');
    await page.getByRole('option', { name: /^Wheat/ }).click();

    // Step 3: period, "Last 30 days" preset (spec 3.3.3).
    await page.getByRole('button', { name: /Step 3: Period/ }).click();
    await page.getByRole('button', { name: /Select dates/ }).click();
    await page.getByRole('button', { name: 'Last 30 days' }).click();

    // Step 4 (grid size) is left at its default (50 m); Analyze is now enabled.
    const analyze = page.getByRole('button', { name: 'Analyze' });
    await expect(analyze).toBeEnabled();
    await analyze.click();

    // Running state (spec 3.4): non-blocking, honest progress message, then results.
    await expect(page.getByText('Fetching satellite & weather data…')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cells needing attention' })).toBeVisible({
      timeout: 15_000,
    });

    // Select a cell through the accessible table view (spec 3.6 "View as table"), which is a
    // reliable, DOM-addressable stand-in for clicking a cell on the WebGL map canvas.
    await page.getByRole('button', { name: 'View as table' }).click();
    const firstRow = page.locator('table[aria-label="Cells"] tbody tr').first();
    const firstGridId = await firstRow.locator('td').first().innerText();
    await firstRow.click();

    // Back in the inspector, showing that cell's detail.
    await expect(page.getByRole('button', { name: '← Back to farm summary' })).toBeVisible();

    // Export CSV (spec 3.4 "Export") and check the download's content.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('farmland-analysis.csv');
    const csvPath = await download.path();
    const fs = await import('node:fs/promises');
    const csv = await fs.readFile(csvPath, 'utf-8');
    expect(csv).toContain('grid_id');
    expect(csv).toContain(firstGridId.trim());
  });
});

/**
 * Live-backend variant (spec 5.2): only runs when explicitly asked for (`E2E_LIVE=1`), against a
 * real `uv run uvicorn app.main:app` with a real `.env` (PropelAuth + Earth Engine). Skipped by
 * default, since this frontend's `.env` is empty (PROGRESS.md: live checks are pending, ADR-002)
 * and no CI environment has those credentials.
 */
test.describe('happy path (live backend)', () => {
  test.skip(process.env.E2E_LIVE !== '1', 'Set E2E_LIVE=1 with a running backend to run this.');

  test('sign in, load the sample field, analyze, select a cell, export CSV', async ({ page }) => {
    const email = process.env.E2E_LIVE_EMAIL ?? 'e2e-live@example.com';

    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole('tab', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Get token' }).click();

    await expect(page).toHaveURL('/', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Load sample field' }).click();

    const crop = page.getByRole('combobox', { name: 'Crop' });
    await crop.click();
    await crop.fill('Wheat');
    await page.getByRole('option', { name: /^Wheat/ }).click();

    await page.getByRole('button', { name: /Step 3: Period/ }).click();
    await page.getByRole('button', { name: /Select dates/ }).click();
    await page.getByRole('button', { name: 'Last 30 days' }).click();

    await page.getByRole('button', { name: 'Analyze' }).click();
    // The real /analyze call fans out to Earth Engine and weather data (API_CONTRACT section 7):
    // a generous timeout, no fake percentage, matching the app's own ANALYZE_TIMEOUT_MS ceiling.
    await expect(page.getByRole('heading', { name: 'Cells needing attention' })).toBeVisible({
      timeout: 180_000,
    });

    await page.getByRole('button', { name: 'View as table' }).click();
    await page.locator('table[aria-label="Cells"] tbody tr').first().click();
    await expect(page.getByRole('button', { name: '← Back to farm summary' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    await downloadPromise;
  });
});
