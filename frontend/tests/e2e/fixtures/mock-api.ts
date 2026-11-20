import type { Page } from '@playwright/test';

/**
 * Route interception for the E2E happy path (spec 5.2): the backend is never called. Every
 * handler matches the Vite dev-server proxy's relative paths, exactly as the app requests them.
 */

export const DEV_EMAIL = 'agronomist@example.com';

export async function mockHealth(page: Page): Promise<void> {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
}

/** `/auth/token` (dev sign-in, spec 2.2) and the `/auth/whoami` check `RouteGuard` runs on load. */
export async function mockAuth(page: Page, email: string = DEV_EMAIL): Promise<void> {
  await page.route('**/api/v1/auth/token', (route) =>
    route.fulfill({
      json: {
        user_id: 'u_e2e',
        email,
        access_token: 'e2e-fake-token',
        token_type: 'bearer',
        expires_in_minutes: 480,
      },
    }),
  );
  await page.route('**/api/v1/auth/whoami', (route) =>
    route.fulfill({ json: { user_id: 'u_e2e', email, active_org_id: null } }),
  );
}

/** A small, fixed `FarmAnalysisResponse` (API_CONTRACT 2.4): 3 cells, every cluster represented. */
export function analysisFixture() {
  const cell = (
    gridId: number,
    overrides: { readonly cpi?: Partial<Record<string, number>>; readonly noAdvisory?: boolean },
  ) => {
    const x = 77.1 + gridId * 0.003;
    const y = 28.6;
    const d = 0.002;
    return {
      type: 'Feature' as const,
      id: gridId,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [x, y],
            [x + d, y],
            [x + d, y + d],
            [x, y + d],
            [x, y],
          ],
        ],
      },
      properties: {
        grid_id: gridId,
        raw_metrics: { ndvi: 0.55 + gridId * 0.05, t2m: 24.5 + gridId, soil_moist: 0.18 },
        cpi_scores: {
          Structural: 0.7,
          Chlorophyll: 0.65,
          Water_Drought: 0.4,
          Environmental: 0.72,
          Agro_Meteo: 0.6,
          ...overrides.cpi,
        },
        advisories: overrides.noAdvisory
          ? {}
          : { ndvi: 'Routine scout for pests.', soil_moist: 'Irrigate within 2 days.' },
      },
    };
  };

  return {
    type: 'FeatureCollection' as const,
    features: [
      cell(1, {}),
      cell(2, { cpi: { Water_Drought: 0.25 } }),
      cell(3, { noAdvisory: true }),
    ],
  };
}

export async function mockAnalyze(
  page: Page,
  response: ReturnType<typeof analysisFixture> = analysisFixture(),
): Promise<void> {
  await page.route('**/api/v1/analyze', async (route) => {
    // A short, deliberate delay: /analyze is genuinely slow (API_CONTRACT section 7), and an
    // instant mock would resolve before the running state (spec 3.4) ever became visible.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: response });
  });
}

/** No satellite passes by default, so the flow runs without a date step (a run combines all). */
export async function mockSatelliteDates(
  page: Page,
  dates: readonly {
    date: string;
    optical: boolean;
    cloud_cover: number | null;
    radar: boolean;
  }[] = [],
): Promise<void> {
  await page.route('**/api/v1/satellite-dates', (route) => route.fulfill({ json: { dates } }));
}

/** Mocks everything the happy path's "sign in -> analyze" flow calls, before `page.goto('/')`. */
export async function mockHappyPath(page: Page): Promise<void> {
  await mockHealth(page);
  await mockAuth(page);
  await mockSatelliteDates(page);
  await mockAnalyze(page);
}

/**
 * Drives the real dev-token sign-in form (spec 2.2/3.5) from `/login` to the signed-in workspace.
 * Callers mock `/auth/token` and `/auth/whoami` first (see `mockAuth`); this never touches a real
 * backend or a real account.
 */
export async function signIn(page: Page, email: string = DEV_EMAIL): Promise<void> {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Get token' }).click();
  await page.waitForURL('/');
}
