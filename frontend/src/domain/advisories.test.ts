import { describe, expect, it } from 'vitest';
import { groupAdvisories, topAdvisories } from './advisories';
import { makeCell } from './fixtures';

describe('groupAdvisories', () => {
  const cells = [
    makeCell(1, {
      metrics: { ndvi: 0.6, t2m: 24 },
      advisories: { ndvi: 'Routine scout for pests', t2m: 'Maintain current irrigation' },
    }),
    makeCell(2, {
      metrics: { ndvi: 0.5, t2m: 24 },
      advisories: { ndvi: 'Routine scout for pests', t2m: 'Maintain current irrigation' },
    }),
    makeCell(3, {
      metrics: { ndvi: 0.2, t2m: 24 },
      advisories: { ndvi: 'Check canopy for stress', t2m: 'Maintain current irrigation' },
    }),
  ];

  it('returns the five clusters in API order', () => {
    expect(groupAdvisories(cells).clusters.map((g) => g.cluster)).toEqual([
      'Structural',
      'Chlorophyll',
      'Water_Drought',
      'Environmental',
      'Agro_Meteo',
    ]);
  });

  it('groups by cluster and de-duplicates the same text across cells', () => {
    const { clusters } = groupAdvisories(cells);
    const structural = clusters.find((g) => g.cluster === 'Structural');
    expect(structural?.items).toEqual([
      {
        metric: 'ndvi',
        cluster: 'Structural',
        text: 'Routine scout for pests',
        cellIds: ['1', '2'],
        cellCount: 2,
        totalCells: 3,
      },
      {
        metric: 'ndvi',
        cluster: 'Structural',
        text: 'Check canopy for stress',
        cellIds: ['3'],
        cellCount: 1,
        totalCells: 3,
      },
    ]);
    const env = clusters.find((g) => g.cluster === 'Environmental');
    expect(env?.items).toHaveLength(1);
    expect(env?.items[0]).toMatchObject({ cellCount: 3, cellIds: ['1', '2', '3'], totalCells: 3 });
  });

  it('leaves clusters without advisories empty', () => {
    const chlorophyll = groupAdvisories(cells).clusters.find((g) => g.cluster === 'Chlorophyll');
    expect(chlorophyll?.items).toEqual([]);
  });

  it('keeps identical text for different metrics as separate items', () => {
    const result = groupAdvisories([
      makeCell(1, { metrics: { ndvi: 1, evi: 1 }, advisories: { ndvi: 'Scout', evi: 'Scout' } }),
    ]);
    const structural = result.clusters.find((g) => g.cluster === 'Structural');
    expect(structural?.items.map((i) => i.metric)).toEqual(['ndvi', 'evi']);
  });

  it('puts advisories for metrics without a value into noData, never into a cluster (ADR-004)', () => {
    const result = groupAdvisories([
      makeCell(1, {
        metrics: { ndvi: 0.6 },
        advisories: { ndvi: 'Fine', ndre: 'CRITICAL: act now' },
      }),
      makeCell(2, {
        metrics: { ndvi: 0.6 },
        advisories: { ndvi: 'Fine', ndre: 'CRITICAL: act now' },
      }),
    ]);
    const all = result.clusters.flatMap((g) => g.items);
    expect(all.map((i) => i.metric)).toEqual(['ndvi']);
    expect(result.noData).toEqual([
      {
        metric: 'ndre',
        cluster: 'Chlorophyll',
        text: 'CRITICAL: act now',
        cellIds: ['1', '2'],
        cellCount: 2,
        totalCells: 2,
      },
    ]);
  });

  it('splits one advisory by cell when only some cells have a value', () => {
    const result = groupAdvisories([
      makeCell(1, { metrics: { ndre: 0.4 }, advisories: { ndre: 'Same text' } }),
      makeCell(2, { metrics: {}, advisories: { ndre: 'Same text' } }),
    ]);
    const chlorophyll = result.clusters.find((g) => g.cluster === 'Chlorophyll');
    expect(chlorophyll?.items[0]).toMatchObject({ cellIds: ['1'], cellCount: 1, totalCells: 2 });
    expect(result.noData[0]).toMatchObject({ cellIds: ['2'], cellCount: 1, totalCells: 2 });
  });

  it('treats a cell with no raw_metrics as having no values at all', () => {
    const result = groupAdvisories([makeCell(1, { advisories: { ndvi: 'Critical' } })]);
    expect(result.noData).toHaveLength(1);
    expect(result.clusters.flatMap((g) => g.items)).toEqual([]);
  });

  it('collects advisories for unknown metrics under other', () => {
    const result = groupAdvisories([
      makeCell(1, { metrics: { mystery: 1 }, advisories: { mystery: 'Odd' } }),
      makeCell(2, { advisories: { mystery2: 'Odd, no value' } }),
    ]);
    expect(result.other).toEqual([
      {
        metric: 'mystery',
        cluster: null,
        text: 'Odd',
        cellIds: ['1'],
        cellCount: 1,
        totalCells: 2,
      },
    ]);
    expect(result.noData).toEqual([
      {
        metric: 'mystery2',
        cluster: null,
        text: 'Odd, no value',
        cellIds: ['2'],
        cellCount: 1,
        totalCells: 2,
      },
    ]);
  });

  it('orders items by how many cells they cover, then metric order, then text', () => {
    const result = groupAdvisories([
      makeCell(1, { metrics: { ndvi: 1, evi: 1 }, advisories: { ndvi: 'B', evi: 'A' } }),
      makeCell(2, { metrics: { ndvi: 1, evi: 1 }, advisories: { ndvi: 'C', evi: 'A' } }),
      makeCell(3, { metrics: { ndvi: 1, evi: 1 }, advisories: { ndvi: 'B', evi: 'D' } }),
    ]);
    const structural = result.clusters.find((g) => g.cluster === 'Structural');
    expect(structural?.items.map((i) => `${i.metric}:${i.text}`)).toEqual([
      'ndvi:B',
      'evi:A',
      'ndvi:C',
      'evi:D',
    ]);
  });

  it('sorts unknown metrics after known ones and alphabetically among themselves', () => {
    const result = groupAdvisories([
      makeCell(1, { metrics: { zeta: 1, alpha: 1 }, advisories: { zeta: 'Z', alpha: 'A' } }),
    ]);
    expect(result.other.map((i) => i.metric)).toEqual(['alpha', 'zeta']);
  });

  it('handles no cells and cells without advisories', () => {
    const empty = groupAdvisories([]);
    expect(empty.noData).toEqual([]);
    expect(empty.other).toEqual([]);
    expect(
      groupAdvisories([makeCell(1, { metrics: { ndvi: 1 } })]).clusters.flatMap((g) => g.items),
    ).toEqual([]);
  });
});

describe('topAdvisories', () => {
  it('lists the most widespread actions across clusters and excludes no-data advisories', () => {
    const cells = [
      makeCell(1, {
        metrics: { ndvi: 1, t2m: 1 },
        advisories: { ndvi: 'A', t2m: 'B', ndre: 'Phantom' },
      }),
      makeCell(2, {
        metrics: { ndvi: 1, t2m: 1 },
        advisories: { ndvi: 'A', t2m: 'C', ndre: 'Phantom' },
      }),
      makeCell(3, { metrics: { ndvi: 1, t2m: 1 }, advisories: { ndvi: 'A', t2m: 'C' } }),
    ];
    const top = topAdvisories(groupAdvisories(cells), 2);
    expect(top.map((i) => i.text)).toEqual(['A', 'C']);
    expect(topAdvisories(groupAdvisories(cells)).map((i) => i.text)).toEqual(['A', 'C', 'B']);
  });
});
