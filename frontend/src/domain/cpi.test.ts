import { describe, expect, it } from 'vitest';
import {
  ATTENTION_THRESHOLD,
  cellsNeedingAttention,
  clusterScore,
  farmClusterStats,
  gridIdOf,
  hasClusterData,
} from './cpi';
import { makeCell } from './fixtures';

describe('gridIdOf', () => {
  it('normalises numeric and string ids', () => {
    expect(gridIdOf(makeCell(3))).toBe('3');
    expect(gridIdOf(makeCell('A-3'))).toBe('A-3');
  });
});

describe('hasClusterData (ADR-003: presence of metric keys, not score)', () => {
  it('is true when the cell has any metric of the cluster', () => {
    const cell = makeCell(1, { metrics: { ndvi: 0.6 } });
    expect(hasClusterData(cell, 'Structural')).toBe(true);
  });

  it('is false for clusters whose metrics are all absent', () => {
    const cell = makeCell(1, { metrics: { ndvi: 0.6, t2m: 24 } });
    expect(hasClusterData(cell, 'Chlorophyll')).toBe(false);
    expect(hasClusterData(cell, 'Water_Drought')).toBe(false);
    expect(hasClusterData(cell, 'Environmental')).toBe(true);
  });

  it('is false when raw_metrics is missing or empty', () => {
    expect(hasClusterData(makeCell(1), 'Structural')).toBe(false);
    expect(hasClusterData(makeCell(1, { metrics: {} }), 'Structural')).toBe(false);
  });

  it('ignores keys that belong to no cluster', () => {
    const cell = makeCell(1, { metrics: { mystery: 1 } });
    for (const cluster of [
      'Structural',
      'Chlorophyll',
      'Water_Drought',
      'Environmental',
      'Agro_Meteo',
    ] as const) {
      expect(hasClusterData(cell, cluster)).toBe(false);
    }
  });

  it('does not treat a score of 0 as no data when the metrics are present', () => {
    const cell = makeCell(1, { metrics: { ndvi: 0.01 }, cpi: { Structural: 0 } });
    expect(hasClusterData(cell, 'Structural')).toBe(true);
  });

  it('does not treat a non-zero score as data when the metrics are absent', () => {
    const cell = makeCell(1, { metrics: {}, cpi: { Structural: 0.9 } });
    expect(hasClusterData(cell, 'Structural')).toBe(false);
  });

  it('ignores a metric key whose value is not a finite number', () => {
    const cell = makeCell(1, { metrics: { ndvi: Number.NaN } });
    expect(hasClusterData(cell, 'Structural')).toBe(false);
  });

  it('does not match inherited object keys', () => {
    expect(hasClusterData(makeCell(1, { metrics: {} }), 'Environmental')).toBe(false);
  });
});

describe('clusterScore', () => {
  it('returns the score when there is data and null when there is none', () => {
    const cell = makeCell(1, { metrics: { ndvi: 0.6 }, cpi: { Structural: 0.71, Chlorophyll: 0 } });
    expect(clusterScore(cell, 'Structural')).toBe(0.71);
    expect(clusterScore(cell, 'Chlorophyll')).toBeNull();
  });

  it('keeps a genuine 0 score', () => {
    const cell = makeCell(1, { metrics: { ndvi: 0.01 }, cpi: { Structural: 0 } });
    expect(clusterScore(cell, 'Structural')).toBe(0);
  });
});

describe('farmClusterStats', () => {
  const cells = [
    makeCell(1, { metrics: { ndvi: 1, gndvi: 1 }, cpi: { Structural: 0.2, Chlorophyll: 0.8 } }),
    makeCell(2, { metrics: { ndvi: 1 }, cpi: { Structural: 0.6, Chlorophyll: 0 } }),
    makeCell(3, { metrics: { ndvi: 1, gndvi: 1 }, cpi: { Structural: 1, Chlorophyll: 0.4 } }),
  ];

  it('computes mean, min and max across cells that have data', () => {
    const stats = farmClusterStats(cells);
    expect(stats.Structural.mean).toBeCloseTo(0.6);
    expect(stats.Structural.min).toBe(0.2);
    expect(stats.Structural.max).toBe(1);
    expect(stats.Structural.cellsWithData).toBe(3);
    expect(stats.Structural.totalCells).toBe(3);
  });

  it('ignores no-data cells instead of averaging their fake 0.0', () => {
    const stats = farmClusterStats(cells);
    expect(stats.Chlorophyll.mean).toBeCloseTo(0.6);
    expect(stats.Chlorophyll.min).toBe(0.4);
    expect(stats.Chlorophyll.max).toBe(0.8);
    expect(stats.Chlorophyll.cellsWithData).toBe(2);
    expect(stats.Chlorophyll.totalCells).toBe(3);
  });

  it('reports null stats for a cluster that has no data anywhere', () => {
    const stats = farmClusterStats(cells);
    expect(stats.Agro_Meteo).toEqual({
      cluster: 'Agro_Meteo',
      mean: null,
      min: null,
      max: null,
      cellsWithData: 0,
      totalCells: 3,
    });
  });

  it('handles an empty cell list', () => {
    const stats = farmClusterStats([]);
    expect(stats.Structural).toMatchObject({ mean: null, cellsWithData: 0, totalCells: 0 });
  });
});

describe('cellsNeedingAttention', () => {
  it('uses a named 0.4 heuristic', () => {
    expect(ATTENTION_THRESHOLD).toBe(0.4);
  });

  it('counts cells where any cluster with data scores below the threshold', () => {
    const cells = [
      makeCell(1, { metrics: { ndvi: 1 }, cpi: { Structural: 0.39 } }),
      makeCell(2, { metrics: { ndvi: 1 }, cpi: { Structural: 0.4 } }),
      makeCell(3, { metrics: { ndvi: 1, t2m: 20 }, cpi: { Structural: 0.9, Environmental: 0.1 } }),
      makeCell(4, { metrics: { ndvi: 1 }, cpi: { Structural: 0.9 } }),
    ];
    const result = cellsNeedingAttention(cells);
    expect(result.count).toBe(2);
    expect(result.total).toBe(4);
    expect(result.gridIds).toEqual(['1', '3']);
  });

  it('does not flag cells just because a no-data cluster is 0.0', () => {
    const cells = [
      makeCell(1, {
        metrics: { ndvi: 1 },
        cpi: { Structural: 0.9, Chlorophyll: 0, Agro_Meteo: 0 },
      }),
    ];
    expect(cellsNeedingAttention(cells).count).toBe(0);
  });

  it('flags a genuine 0 score', () => {
    const cells = [makeCell(1, { metrics: { ndvi: 1 }, cpi: { Structural: 0 } })];
    expect(cellsNeedingAttention(cells).gridIds).toEqual(['1']);
  });

  it('accepts a custom threshold', () => {
    const cells = [makeCell(1, { metrics: { ndvi: 1 }, cpi: { Structural: 0.45 } })];
    expect(cellsNeedingAttention(cells, 0.5).count).toBe(1);
    expect(cellsNeedingAttention(cells).count).toBe(0);
  });

  it('copes with cells that have no metrics at all', () => {
    expect(cellsNeedingAttention([makeCell(1)])).toEqual({ count: 0, total: 1, gridIds: [] });
  });
});
