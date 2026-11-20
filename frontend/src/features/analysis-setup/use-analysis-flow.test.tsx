import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import type { FarmFeatureCollection, IsoDate } from '@/domain';
import { createQueryWrapper } from './query-test-wrapper';
import { useAnalysisFlow } from './use-analysis-flow';

const TODAY = '2026-11-04' as IsoDate;

/** A small, roughly 1 ha field: well under the warn/confirm cell-count thresholds at 50 m. */
function smallFarm(): FarmFeatureCollection {
  const d = 0.001;
  const x = 77;
  const y = 28;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
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
        properties: {},
      },
    ],
  };
}

/** A large field: well over the 10,000-cell confirm threshold at 50 m. */
function largeFarm(): FarmFeatureCollection {
  const d = 0.1;
  return {
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

function renderFlow(farm: FarmFeatureCollection | null = smallFarm()) {
  return renderHook(() => useAnalysisFlow({ farm, today: TODAY }), {
    wrapper: createQueryWrapper(),
  });
}

/** Fills in a valid crop, date range and grid size (the defaults) through the form API. */
function fillValidInputs(result: { current: ReturnType<typeof useAnalysisFlow> }) {
  act(() => {
    result.current.form.setValue('crop', 'Wheat', { shouldValidate: true });
    result.current.form.setValue('startDate', '2026-10-01', { shouldValidate: true });
    result.current.form.setValue('endDate', '2026-10-30', { shouldValidate: true });
    result.current.form.setValue('gridSize', 50, { shouldValidate: true });
  });
}

describe('useAnalysisFlow', () => {
  it('starts idle and not submittable', () => {
    const { result } = renderFlow();
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(result.current.canSubmit).toBe(false);
  });

  it('exposes the clock and the field area for the grid step to use', () => {
    const { result } = renderFlow(null);
    expect(result.current.today).toBe(TODAY);
    expect(result.current.areaHectares).toBeNull();

    const { result: withFarm } = renderFlow(smallFarm());
    expect(withFarm.current.areaHectares).toBeGreaterThan(0);
  });

  it('lists exactly what is missing', () => {
    const { result } = renderFlow(null);
    expect(result.current.missingReasons).toContain('Add a field boundary.');
    expect(result.current.missingReasons).toContain('Choose a crop.');
    expect(result.current.missingReasons).toContain('Choose a date range.');
  });

  it('becomes submittable once every step is filled in and a field exists', async () => {
    const { result } = renderFlow();
    fillValidInputs(result);

    await waitFor(() => {
      expect(result.current.canSubmit).toBe(true);
    });
    expect(result.current.missingReasons).toEqual([]);
  });

  it('still lists the missing field boundary even once crop, dates and grid are valid', async () => {
    const { result } = renderFlow(null);
    fillValidInputs(result);

    await waitFor(() => {
      expect(result.current.missingReasons).toEqual(['Add a field boundary.']);
    });
    expect(result.current.canSubmit).toBe(false);
  });

  it('runs the analysis end to end and returns success', async () => {
    signIn();
    server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody())));
    const { result } = renderFlow();
    fillValidInputs(result);
    await waitFor(() => {
      expect(result.current.canSubmit).toBe(true);
    });

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('success');
    });
  });

  it('carries the exact request a successful run used, for session history', async () => {
    signIn();
    server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody())));
    const { result } = renderFlow();
    fillValidInputs(result);
    await waitFor(() => {
      expect(result.current.canSubmit).toBe(true);
    });

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('success');
    });
    if (result.current.state.status !== 'success') throw new Error('expected success');
    expect(result.current.state.request.crop_category).toBe('cereals_c3_temperate');
    expect(result.current.state.request.start_date).toBe('2026-10-01');
    expect(result.current.state.request.end_date).toBe('2026-10-30');
    expect(result.current.state.request.grid_size).toBe(50);
  });

  it('reports a running state with a start time while the call is in flight', async () => {
    signIn();
    server.use(
      http.post('*/api/v1/analyze', async () => {
        await delay(50);
        return HttpResponse.json(analysisBody());
      }),
    );
    const { result } = renderFlow();
    fillValidInputs(result);
    await waitFor(() => {
      expect(result.current.canSubmit).toBe(true);
    });

    act(() => {
      void result.current.submit();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('running');
      expect(result.current.state.status === 'running' && result.current.state.startedAt).toEqual(
        expect.any(Number),
      );
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('success');
    });
  });

  it('cancels a run in flight, ending in an aborted error', async () => {
    signIn();
    server.use(
      http.post('*/api/v1/analyze', async () => {
        await delay(1000);
        return HttpResponse.json(analysisBody());
      }),
    );
    const { result } = renderFlow();
    fillValidInputs(result);
    await waitFor(() => {
      expect(result.current.canSubmit).toBe(true);
    });
    act(() => {
      void result.current.submit();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('running');
    });

    act(() => {
      result.current.cancel();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
    expect(result.current.state.status === 'error' && result.current.state.error.kind).toBe(
      'aborted',
    );
  });

  describe('error shapes', () => {
    async function runWithFailure(response: () => Response | Promise<Response>) {
      signIn();
      server.use(http.post('*/api/v1/analyze', response));
      const { result } = renderFlow();
      fillValidInputs(result);
      await waitFor(() => {
        expect(result.current.canSubmit).toBe(true);
      });
      await act(async () => {
        await result.current.submit();
      });
      await waitFor(() => {
        expect(result.current.state.status).toBe('error');
      });
      return result.current.state;
    }

    it('400: domain error', async () => {
      const state = await runWithFailure(() =>
        HttpResponse.json(
          { error: 'bad_request', detail: 'invalid polygon geometry', details: {} },
          { status: 400 },
        ),
      );
      expect(state.status === 'error' && state.error.kind).toBe('domain');
    });

    it('422: validation error', async () => {
      const state = await runWithFailure(() =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'grid_size'], msg: 'bad grid size', type: 'x' }] },
          { status: 422 },
        ),
      );
      expect(state.status === 'error' && state.error.kind).toBe('validation');
    });

    it('500: server error, with a copyable request summary', async () => {
      const state = await runWithFailure(() =>
        HttpResponse.json({ error: 'internal_server_error', detail: 'boom' }, { status: 500 }),
      );
      expect(state.status === 'error' && state.error.kind).toBe('server');
      if (state.status === 'error') {
        expect(() => {
          JSON.parse(state.requestSummary);
        }).not.toThrow();
        expect(state.requestSummary).toContain('POST /api/v1/analyze');
      }
    });

    it('network failure', async () => {
      const state = await runWithFailure(() => HttpResponse.error());
      expect(state.status === 'error' && state.error.kind).toBe('network');
    });

    it('429: rate limited', async () => {
      const state = await runWithFailure(() =>
        HttpResponse.json({ detail: 'slow down' }, { status: 429 }),
      );
      expect(state.status === 'error' && state.error.kind).toBe('rateLimited');
    });
  });

  describe('retry', () => {
    it('re-runs the same request after a failure', async () => {
      signIn();
      let attempt = 0;
      server.use(
        http.post('*/api/v1/analyze', () => {
          attempt += 1;
          return attempt === 1
            ? HttpResponse.json({ error: 'internal_server_error', detail: 'x' }, { status: 500 })
            : HttpResponse.json(analysisBody());
        }),
      );
      const { result } = renderFlow();
      fillValidInputs(result);
      await waitFor(() => {
        expect(result.current.canSubmit).toBe(true);
      });
      await act(async () => {
        await result.current.submit();
      });
      await waitFor(() => {
        expect(result.current.state.status).toBe('error');
      });

      act(() => {
        result.current.retry();
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe('success');
      });
      expect(attempt).toBe(2);
    });
  });

  describe('reset', () => {
    it('returns to idle, clearing a result or error', async () => {
      signIn();
      server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody())));
      const { result } = renderFlow();
      fillValidInputs(result);
      await waitFor(() => {
        expect(result.current.canSubmit).toBe(true);
      });
      await act(async () => {
        await result.current.submit();
      });
      await waitFor(() => {
        expect(result.current.state.status).toBe('success');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toEqual({ status: 'idle' });
    });
  });

  describe('the >10,000-cell confirmation', () => {
    it('opens a confirmation instead of running immediately', async () => {
      signIn();
      let hits = 0;
      server.use(
        http.post('*/api/v1/analyze', () => {
          hits += 1;
          return HttpResponse.json(analysisBody());
        }),
      );
      const { result } = renderFlow(largeFarm());
      fillValidInputs(result);
      await waitFor(() => {
        expect(result.current.canSubmit).toBe(true);
      });
      expect(result.current.cellWarningLevel).toBe('confirm');

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.confirmOpen).toBe(true);
      expect(result.current.state).toEqual({ status: 'idle' });
      expect(hits).toBe(0);

      act(() => {
        result.current.confirmRun();
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe('success');
      });
      expect(hits).toBe(1);
    });

    it('cancelling the confirmation runs nothing', async () => {
      signIn();
      const { result } = renderFlow(largeFarm());
      fillValidInputs(result);
      await waitFor(() => {
        expect(result.current.canSubmit).toBe(true);
      });

      await act(async () => {
        await result.current.submit();
      });
      expect(result.current.confirmOpen).toBe(true);

      act(() => {
        result.current.cancelConfirm();
      });

      expect(result.current.confirmOpen).toBe(false);
      expect(result.current.state).toEqual({ status: 'idle' });
    });
  });

  describe('stale results', () => {
    it('flags success as stale once an input changes', async () => {
      signIn();
      server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody())));
      const { result } = renderFlow();
      fillValidInputs(result);
      await waitFor(() => {
        expect(result.current.canSubmit).toBe(true);
      });
      await act(async () => {
        await result.current.submit();
      });
      await waitFor(() => {
        expect(result.current.state.status).toBe('success');
      });
      expect(result.current.state.status === 'success' && result.current.state.isStale).toBe(false);

      act(() => {
        result.current.form.setValue('gridSize', 20, { shouldValidate: true });
      });

      await waitFor(() => {
        expect(result.current.state.status === 'success' && result.current.state.isStale).toBe(
          true,
        );
      });
    });
  });

  describe('keyboard shortcut', () => {
    it('Ctrl/Cmd+Enter submits when the form is valid', async () => {
      signIn();
      server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody())));
      const { result } = renderFlow();
      fillValidInputs(result);
      await waitFor(() => {
        expect(result.current.canSubmit).toBe(true);
      });

      act(() => {
        fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe('success');
      });
    });

    it('does nothing when the form is not valid', () => {
      const { result } = renderFlow(null);

      act(() => {
        fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
      });

      expect(result.current.state).toEqual({ status: 'idle' });
    });
  });
});
