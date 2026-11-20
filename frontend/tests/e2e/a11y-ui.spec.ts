import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockAuth, signIn } from './fixtures/mock-api';

/**
 * Accessibility checks for the design system and app shell (spec 3.6, WCAG 2.2 AA).
 * Axe computes real colour contrast in a browser, which jsdom cannot, so this complements the
 * numeric token contrast test in src/styles/tokens.test.ts.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violationsOn(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  // Report the rule and the first offending node, so a failure says what to fix.
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

test.beforeEach(async ({ page }) => {
  // Hermetic: the backend is not required. / is behind RouteGuard, so every spec that reaches it
  // signs in first through the mocked dev-token endpoints (spec 2.2/3.5).
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await mockAuth(page);
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme (from the OS preference)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test('/dev/ui showcase has no violations', async ({ page }) => {
      await page.goto('/dev/ui');
      await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible();

      expect(await violationsOn(page)).toEqual([]);
    });

    test('workspace shell has no violations', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signIn(page);
      await expect(page.getByText('API reachable')).toBeVisible();

      expect(await violationsOn(page)).toEqual([]);
    });

    test('login placeholder has no violations', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      expect(await violationsOn(page)).toEqual([]);
    });
  });
}

test('manual theme toggle overrides the OS preference and has no violations', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/dev/ui');

  await page.getByRole('button', { name: 'Switch to dark theme' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await violationsOn(page)).toEqual([]);

  // The choice survives a reload (persisted through safe storage).
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('narrow window shows the desktop notice and has no violations', async ({ page }) => {
  // Without motion the drawer is at full opacity immediately, so axe never samples mid-slide.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);

  await expect(page.getByText('Best on a desktop screen')).toBeVisible();
  expect(await violationsOn(page)).toEqual([]);

  await page.getByRole('button', { name: 'Show inspector' }).click();
  await expect(page.getByRole('dialog', { name: 'Inspector' })).toBeVisible();
  expect(await violationsOn(page)).toEqual([]);
});

test.describe('open layers on /dev/ui', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/ui');
    await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible();
  });

  test('dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Open dialog' }).click();
    await expect(page.getByRole('dialog', { name: 'Large area' })).toBeVisible();

    expect(await violationsOn(page)).toEqual([]);
  });

  test('drawer', async ({ page }) => {
    await page.getByRole('button', { name: 'Open drawer' }).click();
    await expect(page.getByRole('dialog', { name: 'Inspector' })).toBeVisible();

    expect(await violationsOn(page)).toEqual([]);
  });

  test('combobox listbox', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Empty crop' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();

    expect(await violationsOn(page)).toEqual([]);
  });

  test('date range calendar', async ({ page }) => {
    await page.getByRole('button', { name: /Limited period/ }).click();
    await expect(page.getByRole('dialog', { name: 'Limited period' })).toBeVisible();

    expect(await violationsOn(page)).toEqual([]);
  });

  test('toasts', async ({ page }) => {
    await page.getByRole('button', { name: 'Error toast' }).click();
    await expect(page.getByText('Analysis failed', { exact: true }).first()).toBeVisible();

    expect(await violationsOn(page)).toEqual([]);
  });

  test('every focusable element shows a visible focus ring', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? getComputedStyle(el).outlineStyle : 'none';
    });

    expect(outline).not.toBe('none');
  });
});

test('reduced motion removes animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible();

  const duration = await page.evaluate(() => {
    const el = document.querySelector('.fi-skeleton');
    return el ? getComputedStyle(el).animationDuration : null;
  });

  // 0.01ms from the global rule in globals.css (Chromium prints it as 1e-05s).
  expect(Number.parseFloat(duration ?? '1')).toBeLessThan(0.001);
});
