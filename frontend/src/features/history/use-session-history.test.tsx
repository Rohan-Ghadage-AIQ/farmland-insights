import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FarmAnalysisRequest, FarmAnalysisResponse, FarmFeatureCollection } from '@/domain';
import { createMemoryHistoryStore } from './store';
import { useSessionHistory } from './use-session-history';

function farm(): FarmFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function request(): FarmAnalysisRequest {
  return {
    farm_geojson: farm(),
    start_date: '2026-10-01',
    end_date: '2026-10-30',
    crop_category: 'cereals_c3_temperate',
    grid_size: 50,
  };
}

function response(): FarmAnalysisResponse {
  return { type: 'FeatureCollection', features: [] };
}

describe('useSessionHistory', () => {
  it('starts loading, then reads what the store already has', async () => {
    const store = createMemoryHistoryStore([
      { id: 'a', savedAt: 1, request: request(), response: response() },
    ]);
    const { result } = renderHook(() => useSessionHistory(store));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.id).toBe('a');
  });

  it('adds a run and shows it newest first', async () => {
    const store = createMemoryHistoryStore();
    const { result } = renderHook(() => useSessionHistory(store));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.add(request(), response());
    });

    expect(result.current.entries).toHaveLength(1);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it('keeps at most 10 entries, evicting the oldest from storage too', async () => {
    const store = createMemoryHistoryStore();
    const { result } = renderHook(() => useSessionHistory(store));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    for (let i = 0; i < 12; i += 1) {
      await act(async () => {
        await result.current.add(request(), response());
      });
    }

    expect(result.current.entries).toHaveLength(10);
    await expect(store.list()).resolves.toHaveLength(10);
  });

  it('clears every saved run', async () => {
    const store = createMemoryHistoryStore([
      { id: 'a', savedAt: 1, request: request(), response: response() },
    ]);
    const { result } = renderHook(() => useSessionHistory(store));
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });

    await act(async () => {
      await result.current.clear();
    });

    expect(result.current.entries).toEqual([]);
    await expect(store.list()).resolves.toEqual([]);
  });
});
