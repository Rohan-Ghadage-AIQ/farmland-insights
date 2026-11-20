import { describe, expect, it } from 'vitest';
import { makeCell } from './fixtures';
import {
  MAX_HISTORY_ENTRIES,
  summarizeHistoryEntry,
  trimHistory,
  type HistoryEntry,
} from './history';
import type { FarmAnalysisRequest, FarmAnalysisResponse, FarmFeatureCollection } from './types';

function farm(): FarmFeatureCollection {
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
              [77.01, 28],
              [77.01, 28.01],
              [77, 28.01],
              [77, 28],
            ],
          ],
        },
        properties: {},
      },
    ],
  };
}

function request(overrides: Partial<FarmAnalysisRequest> = {}): FarmAnalysisRequest {
  return {
    farm_geojson: farm(),
    start_date: '2026-10-01',
    end_date: '2026-10-30',
    crop_category: 'cereals_c3_temperate',
    grid_size: 50,
    ...overrides,
  };
}

function response(cellCount = 2): FarmAnalysisResponse {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: cellCount }, (_, index) => makeCell(index)),
  };
}

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'h1',
    savedAt: 1,
    request: request(),
    response: response(),
    ...overrides,
  };
}

describe('summarizeHistoryEntry', () => {
  it('names the crop, the date range and the cell count', () => {
    const summary = summarizeHistoryEntry(entry());
    expect(summary).toContain('Cereals (C3, temperate)');
    expect(summary).toContain('2026-10-01');
    expect(summary).toContain('2026-10-30');
    expect(summary).toContain('2 cells');
  });

  it('uses singular "cell" for exactly one cell', () => {
    const summary = summarizeHistoryEntry(entry({ response: response(1) }));
    expect(summary).toContain('1 cell');
    expect(summary).not.toContain('1 cells');
  });
});

describe('trimHistory', () => {
  it('keeps at most MAX_HISTORY_ENTRIES entries, newest first', () => {
    const entries = Array.from({ length: MAX_HISTORY_ENTRIES + 5 }, (_, index) =>
      entry({ id: `h${String(index)}`, savedAt: index }),
    );
    const trimmed = trimHistory(entries);
    expect(trimmed).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(trimmed[0]?.savedAt).toBe(MAX_HISTORY_ENTRIES + 4);
    expect(trimmed.at(-1)?.savedAt).toBe(5);
  });

  it('does not mutate the input array', () => {
    const entries = [entry({ id: 'a', savedAt: 1 }), entry({ id: 'b', savedAt: 2 })];
    const copy = [...entries];
    trimHistory(entries);
    expect(entries).toEqual(copy);
  });

  it('leaves a short list untouched, newest first', () => {
    const entries = [entry({ id: 'a', savedAt: 1 }), entry({ id: 'b', savedAt: 2 })];
    expect(trimHistory(entries).map((item) => item.id)).toEqual(['b', 'a']);
  });
});
