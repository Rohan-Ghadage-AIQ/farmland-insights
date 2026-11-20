import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAuth, mockHealth, signIn } from './fixtures/mock-api';

test.describe('workspace shell', () => {
  test.beforeEach(async ({ page }) => {
    // Hermetic: the backend is not required for the smoke test. / is behind RouteGuard, so every
    // check here signs in first (spec 2.2/3.5) through the mocked dev-token endpoints.
    await mockHealth(page);
    await mockAuth(page);
    await signIn(page);
  });

  test('loads and reports a reachable API once signed in', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Farmland Insights' })).toBeVisible();
    await expect(page.getByText('API reachable')).toBeVisible();
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
    await expect(page.getByText('API reachable')).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();

    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking).toEqual([]);
  });
});
