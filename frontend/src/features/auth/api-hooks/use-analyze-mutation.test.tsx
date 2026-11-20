import { act, renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userMessage, type AnalysisRequest } from '@/api';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import { createWrapper } from './test-wrapper';
import { useAnalyzeMutation } from './use-analyze-mutation';

const request: AnalysisRequest = {
  farm_geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
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
      },
    ],
  },
  start_date: '2026-01-01',
  end_date: '2026-02-01',
  crop_category: 'cereals_c3_temperate',
  grid_size: 50,
};

const analysisBody = {
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
};

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

describe('useAnalyzeMutation', () => {
  it('starts idle with no start timestamp', () => {
    const { result } = renderHook(() => useAnalyzeMutation(), { wrapper: createWrapper() });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.startedAt).toBeNull();
  });

  it('runs an analysis end to end and returns the validated response', async () => {
    signIn();
    let auth: string | null = null;
    server.use(
      http.post('*/api/v1/analyze', ({ request: req }) => {
        auth = req.headers.get('authorization');
        return HttpResponse.json(analysisBody);
      }),
    );
    const { result } = renderHook(() => useAnalyzeMutation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(request);
    });

    expect(auth).toBe('Bearer tok-abc');
    expect(result.current.data?.features).toHaveLength(1);
    expect(result.current.isSuccess).toBe(true);
  });

  it('records when the run started, so the UI can show elapsed time', async () => {
    signIn();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    server.use(
      http.post('*/api/v1/analyze', async () => {
        await delay(50);
        return HttpResponse.json(analysisBody);
      }),
    );
    const { result } = renderHook(() => useAnalyzeMutation(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate(request);
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });
    expect(result.current.startedAt).toBe(1_700_000_000_000);
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('clears the start timestamp on reset', async () => {
    signIn();
    server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody)));
    const { result } = renderHook(() => useAnalyzeMutation(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync(request);
    });
    expect(result.current.startedAt).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.startedAt).toBeNull();
    expect(result.current.isIdle).toBe(true);
  });

  describe('cancel', () => {
    it('aborts the in-flight request and ends in an "aborted" error', async () => {
      signIn();
      let serverSawAbort = false;
      server.use(
        http.post('*/api/v1/analyze', async ({ request: req }) => {
          req.signal.addEventListener('abort', () => {
            serverSawAbort = true;
          });
          await delay(1000);
          return HttpResponse.json(analysisBody);
        }),
      );
      const { result } = renderHook(() => useAnalyzeMutation(), { wrapper: createWrapper() });
      act(() => {
        result.current.mutate(request);
      });
      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      act(() => {
        result.current.cancel();
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
      expect(result.current.error?.kind).toBe('aborted');
      expect(result.current.error && userMessage(result.current.error, { action: 'analyze' })).toBe(
        'Analysis cancelled.',
      );
      await waitFor(() => {
        expect(serverSawAbort).toBe(true);
      });
    });

    it('is a harmless no-op when nothing is running', () => {
      const { result } = renderHook(() => useAnalyzeMutation(), { wrapper: createWrapper() });

      expect(() => {
        act(() => {
          result.current.cancel();
        });
      }).not.toThrow();
      expect(result.current.isIdle).toBe(true);
    });

    it('does not poison the next run after a cancel', async () => {
      signIn();
      let calls = 0;
      server.use(
        http.post('*/api/v1/analyze', async () => {
          calls += 1;
          if (calls === 1) await delay(1000);
          return HttpResponse.json(analysisBody);
        }),
      );
      const { result } = renderHook(() => useAnalyzeMutation(), { wrapper: createWrapper() });
      act(() => {
        result.current.mutate(request);
      });
      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });
      act(() => {
        result.current.cancel();
      });
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      await act(async () => {
        await result.current.mutateAsync(request);
      });

      expect(result.current.isSuccess).toBe(true);
    });

    it('aborts an in-flight run when the component unmounts', async () => {
      signIn();
      let serverSawAbort = false;
      server.use(
        http.post('*/api/v1/analyze', async ({ request: req }) => {
          req.signal.addEventListener('abort', () => {
            serverSawAbort = true;
          });
          await delay(1000);
          return HttpResponse.json(analysisBody);
        }),
      );
      const { result, unmount } = renderHook(() => useAnalyzeMutation(), {
        wrapper: createWrapper(),
      });
      act(() => {
        result.current.mutate(request);
      });
      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      unmount();

      await waitFor(() => {
        expect(serverSawAbort).toBe(true);
      });
    });
  });

  describe('error shapes', () => {
    async function runWith(response: () => Response | Promise<Response>) {
      signIn();
      server.use(http.post('*/api/v1/analyze', response));
      const hook = renderHook(() => useAnalyzeMutation(), { wrapper: createWrapper() });
      await act(async () => {
        await hook.result.current.mutateAsync(request).catch(() => undefined);
      });
      await waitFor(() => {
        expect(hook.result.current.isError).toBe(true);
      });
      return hook.result.current.error;
    }

    it('400: domain error with its detail', async () => {
      const error = await runWith(() =>
        HttpResponse.json(
          { error: 'bad_request', detail: 'invalid polygon geometry', details: {} },
          { status: 400 },
        ),
      );

      expect(error?.kind).toBe('domain');
      expect(error && userMessage(error)).toBe('invalid polygon geometry');
    });

    it('422: validation error with field paths', async () => {
      const error = await runWith(() =>
        HttpResponse.json(
          {
            detail: [
              { loc: ['body', 'grid_size'], msg: 'Input should be greater than 0', type: 'x' },
            ],
          },
          { status: 422 },
        ),
      );

      expect(error?.kind === 'validation' && error.fieldErrors).toEqual({
        grid_size: 'Input should be greater than 0',
      });
    });

    it('500: server error', async () => {
      const error = await runWith(() =>
        HttpResponse.json({ error: 'internal_server_error', detail: 'x' }, { status: 500 }),
      );

      expect(error?.kind).toBe('server');
    });

    it('network failure', async () => {
      const error = await runWith(() => HttpResponse.error());

      expect(error?.kind).toBe('network');
    });

    it('401 ends the session so the router can send the user to /login', async () => {
      const events: unknown[] = [];
      const off = session.onEvent((event) => events.push(event));

      const error = await runWith(() => HttpResponse.json({ detail: 'x' }, { status: 401 }));
      off();

      expect(error?.kind).toBe('auth');
      expect(session.getSession()).toBeNull();
      expect(events).toEqual([{ type: 'expired', reason: 'unauthorized' }]);
    });

    it('a 200 with an unexpected body is an error, never a half-trusted result', async () => {
      const error = await runWith(() =>
        HttpResponse.json({ type: 'FeatureCollection', features: [] }),
      );

      expect(error?.kind).toBe('unknown');
    });

    it('does not retry a failed analysis (it may be slow and costly)', async () => {
      signIn();
      const hits = vi.fn();
      server.use(
        http.post('*/api/v1/analyze', () => {
          hits();
          return HttpResponse.json({ detail: 'x' }, { status: 500 });
        }),
      );
      const { result } = renderHook(() => useAnalyzeMutation(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync(request).catch(() => undefined);
      });

      expect(hits).toHaveBeenCalledTimes(1);
    });
  });
});
