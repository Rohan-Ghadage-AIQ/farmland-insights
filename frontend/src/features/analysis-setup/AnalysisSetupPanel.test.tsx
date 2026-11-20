import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import '@/components/ui/test-support';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import type { FarmFeatureCollection, IsoDate } from '@/domain';
import { AnalysisSetupPanel } from './AnalysisSetupPanel';
import { createQueryWrapper } from './query-test-wrapper';
import { useAnalysisFlow } from './use-analysis-flow';

const TODAY = '2026-11-04' as IsoDate;

function smallFarm(): FarmFeatureCollection {
  const d = 0.001;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [77, 28],
              [77 + d, 28],
              [77 + d, 28 + d],
              [77, 28 + d],
              [77, 28],
            ],
          ],
        },
        properties: {},
      },
    ],
  };
}

function analysisBody() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 1,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
        properties: {
          grid_id: 1,
          raw_metrics: { ndvi: 0.5 },
          cpi_scores: {
            Structural: 0.5,
            Chlorophyll: 0.5,
            Water_Drought: 0.5,
            Environmental: 0.5,
            Agro_Meteo: 0.5,
          },
          advisories: {},
        },
      },
    ],
    // The real API echoes the pass it used; without it the run is rejected as mixing every pass.
    imagery: { image_date: '2026-01-01', optical_date: '2026-01-01', radar_date: null },
  };
}

function signIn() {
  session.setSession({
    user_id: 'u_1',
    email: 'farmer@example.com',
    access_token: 'tok-abc',
    expires_in_minutes: 480,
  });
}

afterEach(() => {
  session.signOut();
});

function Harness({ farm = smallFarm() }: { readonly farm?: FarmFeatureCollection | null }) {
  const flow = useAnalysisFlow({ farm, today: TODAY });
  return (
    <>
      <AnalysisSetupPanel flow={flow} />
      <output data-testid="flow-status">{flow.state.status}</output>
    </>
  );
}

function renderPanel(farm: FarmFeatureCollection | null = smallFarm()) {
  const Wrapper = createQueryWrapper();
  return render(<Harness farm={farm} />, { wrapper: Wrapper });
}

/** Drives the three steps to a valid state through the real UI. */
async function fillSteps(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: 'Crop' }));
  await user.type(screen.getByRole('combobox', { name: 'Crop' }), 'Wheat');
  await user.click(await screen.findByRole('option', { name: /Wheat/ }));

  // The "Period" step starts collapsed: expand it, then use a quick-period button.
  await user.click(screen.getByRole('button', { name: /Period/ }));
  await user.click(await screen.findByRole('button', { name: 'Last 30 days' }));

  // Grid size already defaults to 50 m, which is valid.
}

describe('AnalysisSetupPanel', () => {
  it('disables Analyze until every step is filled in', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Analyze' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('flags an end date before the start date as soon as either is edited', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /Period/ }));

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-05' } });

    expect(
      await screen.findByText('The start date must be on or before the end date.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Start date')).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses a period longer than a year and says so', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /Period/ }));

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-30' } });

    expect(await screen.findByText(/cannot be longer than 366 days/)).toBeVisible();
    expect(screen.getByLabelText('End date')).toHaveAttribute('aria-invalid', 'true');
  });

  it('accepts a full year', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /Period/ }));

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2025-11-05' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-11-03' } });

    await waitFor(() => {
      expect(screen.getByText(/^364 days selected/)).toBeVisible();
    });
    expect(screen.queryByText(/cannot be longer than/)).not.toBeInTheDocument();
  });

  it('clears that message once the dates are in order', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /Period/ }));

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-05' } });
    await screen.findByText('The start date must be on or before the end date.');

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-25' } });
    await waitFor(() => {
      expect(
        screen.queryByText('The start date must be on or before the end date.'),
      ).not.toBeInTheDocument();
    });
  });

  it('enables Analyze once crop, period and grid are all valid', async () => {
    const user = userEvent.setup();
    renderPanel();

    await fillSteps(user);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analyze' })).not.toHaveAttribute('aria-disabled');
    });
  });

  it('runs the analysis and shows success', async () => {
    signIn();
    server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody())));
    const user = userEvent.setup();
    renderPanel();
    await fillSteps(user);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analyze' })).not.toHaveAttribute('aria-disabled');
    });

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByTestId('flow-status')).toHaveTextContent('success');
    });
  });

  it('locks the fields while running', async () => {
    signIn();
    server.use(
      http.post('*/api/v1/analyze', async () => {
        await delay(50);
        return HttpResponse.json(analysisBody());
      }),
    );
    const user = userEvent.setup();
    renderPanel();
    await fillSteps(user);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analyze' })).not.toHaveAttribute('aria-disabled');
    });

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Crop' })).toBeDisabled();
    });
  });

  it('shows a Retry-able error banner on failure', async () => {
    signIn();
    server.use(
      http.post('*/api/v1/analyze', () =>
        HttpResponse.json({ error: 'internal_server_error', detail: 'boom' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderPanel();
    await fillSteps(user);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analyze' })).not.toHaveAttribute('aria-disabled');
    });

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(await screen.findByText(/something went wrong on our side/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('flags a successful result as stale after an input changes', async () => {
    signIn();
    server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody())));
    const user = userEvent.setup();
    renderPanel();
    await fillSteps(user);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analyze' })).not.toHaveAttribute('aria-disabled');
    });
    await user.click(screen.getByRole('button', { name: 'Analyze' }));
    await waitFor(() => {
      expect(screen.queryByText(/inputs changed/i)).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Grid size/ }));
    await user.click(await screen.findByRole('button', { name: '100 m' }));

    expect(await screen.findByText(/inputs changed/i)).toBeVisible();
  });

  it('opens a confirmation above the 10,000-cell threshold instead of running immediately', async () => {
    signIn();
    let hits = 0;
    server.use(
      http.post('*/api/v1/analyze', () => {
        hits += 1;
        return HttpResponse.json(analysisBody());
      }),
    );
    const d = 0.1;
    const largeFarm: FarmFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [d, 0],
                [d, d],
                [0, d],
                [0, 0],
              ],
            ],
          },
          properties: {},
        },
      ],
    };
    const user = userEvent.setup();
    renderPanel(largeFarm);
    await fillSteps(user);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analyze' })).not.toHaveAttribute('aria-disabled');
    });

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(hits).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Run anyway' }));

    await waitFor(() => {
      expect(hits).toBe(1);
    });
  });
});

describe('AnalysisSetupPanel (hook integration)', () => {
  it('uses the same flow instance renderHook would see, for the workspace to share', () => {
    const { result } = renderHook(() => useAnalysisFlow({ farm: null, today: TODAY }), {
      wrapper: createQueryWrapper(),
    });
    render(<AnalysisSetupPanel flow={result.current} />);

    expect(screen.getByRole('button', { name: 'Analyze' })).toBeInTheDocument();
  });
});

describe('AnalysisSetupPanel satellite date', () => {
  const PASSES = {
    dates: [
      { date: '2026-11-02', optical: true, cloud_cover: 80, radar: true },
      { date: '2026-10-28', optical: true, cloud_cover: 5, radar: false },
      { date: '2026-10-20', optical: false, cloud_cover: null, radar: true },
    ],
  };

  it('preselects the newest clear pass and sends the chosen one with the analysis', async () => {
    signIn();
    let analyzed: Record<string, unknown> | null = null;
    server.use(
      http.post('*/api/v1/satellite-dates', () => HttpResponse.json(PASSES)),
      http.post('*/api/v1/analyze', async ({ request }) => {
        analyzed = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(analysisBody());
      }),
    );
    const user = userEvent.setup();
    renderPanel();
    await fillSteps(user);

    const group = await screen.findByRole('radiogroup', { name: 'Satellite image date' });
    const radios = await within(group).findAllByRole('radio');
    expect(radios).toHaveLength(3);
    // 11-02 is newer but 80% cloudy, so the clear 10-28 pass is preselected.
    await waitFor(() => {
      expect(within(group).getByRole('radio', { name: /28 Oct 2026/ })).toBeChecked();
    });
    expect(within(group).getByText('Cloudy')).toBeInTheDocument();
    expect(within(group).getByText('Radar only')).toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: /2 Nov 2026/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analyze' })).not.toHaveAttribute('aria-disabled');
    });
    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByTestId('flow-status')).toHaveTextContent('success');
    });
    expect(analyzed).toMatchObject({ image_date: '2026-11-02' });
  });

  it('blocks the run until the dates load: the report is always built from one chosen pass', async () => {
    signIn();
    let hits = 0;
    server.use(
      http.post('*/api/v1/satellite-dates', () =>
        HttpResponse.json({ detail: 'nope' }, { status: 400 }),
      ),
      http.post('*/api/v1/analyze', () => {
        hits += 1;
        return HttpResponse.json(analysisBody());
      }),
    );
    const user = userEvent.setup();
    renderPanel();
    await fillSteps(user);

    expect(await screen.findByText('Could not load satellite dates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(hits).toBe(0);
  });

  it('blocks the run and asks for another period when no satellite passed in it', async () => {
    signIn();
    server.use(http.post('*/api/v1/satellite-dates', () => HttpResponse.json({ dates: [] })));
    const user = userEvent.setup();
    renderPanel();
    await fillSteps(user);

    expect(
      await screen.findByText(/No satellite passed over this field in the period/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('rejects a result that ignored the chosen date instead of showing every pass mixed', async () => {
    signIn();
    const withoutImagery = { ...analysisBody(), imagery: null };
    server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(withoutImagery)));
    const user = userEvent.setup();
    renderPanel();
    await fillSteps(user);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analyze' })).not.toHaveAttribute('aria-disabled');
    });
    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(
      await screen.findByText(/The server did not use the chosen satellite date/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('flow-status')).toHaveTextContent('error');
  });
});
