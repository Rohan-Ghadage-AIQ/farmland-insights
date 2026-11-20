import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createRecentCropsStore, type RecentCropsStore } from './crop-recents';
import { useRecentCrops } from './use-recent-crops';

function fakeStore(): RecentCropsStore {
  let list: string[] = [];
  return {
    getRecents: () => list,
    addRecent: (crop) => {
      list = [crop, ...list.filter((entry) => entry !== crop)];
      return list;
    },
  };
}

describe('useRecentCrops', () => {
  it('reads the initial recents from the store', () => {
    const store = createRecentCropsStore();
    store.addRecent('Wheat');
    const { result } = renderHook(() => useRecentCrops(store));

    expect(result.current.recents).toEqual(['Wheat']);
  });

  it('updates after addRecent, re-rendering with the new order', () => {
    const store = fakeStore();
    const { result } = renderHook(() => useRecentCrops(store));

    act(() => {
      result.current.addRecent('Wheat');
    });
    expect(result.current.recents).toEqual(['Wheat']);

    act(() => {
      result.current.addRecent('Mustard');
    });
    expect(result.current.recents).toEqual(['Mustard', 'Wheat']);
  });
});
