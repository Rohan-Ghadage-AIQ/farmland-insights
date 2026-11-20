import { expect, test } from '@playwright/test';
import { mockHappyPath, signIn } from './fixtures/mock-api';

/**
 * Session history (spec 3.4, Phase 7) in a real browser: this is the one place the real
 * IndexedDB-backed store (`src/features/history/store.ts`) actually runs, since jsdom (the unit
 * test environment) has no IndexedDB and every unit test exercises the in-memory fallback instead
 * (see `store.test.ts`). Reloading the page proves the entry survived in real IndexedDB, not just
 * in React state.
 */
test.describe('session history', () => {
  test.beforeEach(async ({ page }) => {
    await mockHappyPath(page);
  });

  async function runOneAnalysis(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Load sample field' }).click();
    const crop = page.getByRole('combobox', { name: 'Crop' });
    await crop.click();
    await crop.fill('Wheat');
    await page.getByRole('option', { name: /^Wheat/ }).click();
    await page.getByRole('button', { name: /Step 3: Period/ }).click();
    await page.getByRole('button', { name: /Select dates/ }).click();
    await page.getByRole('button', { name: 'Last 30 days' }).click();
    await page.getByRole('button', { name: 'Analyze' }).click();
    await expect(page.getByRole('heading', { name: 'Cells needing attention' })).toBeVisible({
      timeout: 15_000,
    });
  }

  test('a completed run is saved, survives a reload, and can be reopened', async ({ page }) => {
    await signIn(page);
    await runOneAnalysis(page);

    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('button', { name: /reopen/i })).toBeVisible();
    await page.keyboard.press('Escape');

    // Reload: the entry must come from real IndexedDB, not in-memory React state.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Farmland Insights' })).toBeVisible();
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('button', { name: /reopen/i })).toBeVisible();

    await page.getByRole('button', { name: /reopen/i }).click();
    await expect(page.getByText('Viewing a saved run')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cells needing attention' })).toBeVisible();
  });

  test('Clear history empties the list', async ({ page }) => {
    await signIn(page);
    await runOneAnalysis(page);

    await page.getByRole('button', { name: 'History' }).click();
    await page.getByRole('button', { name: /clear history/i }).click();
    await expect(page.getByText(/no saved runs/i)).toBeVisible();
  });
});
