import { describe, expect, it } from 'vitest';
import { makeCell } from '@/features/results/test-support';
import { buildCellDetails } from './cell-details';

const CELL = makeCell('12', {
  metrics: { ndvi: 0.31, gndvi: 0.2, lst: 28.5, t2m: 22.4, mystery: 3.14159 },
  cpi: { Structural: 0.3, Chlorophyll: 0.8, Environmental: 0.55 },
  advisories: {
    ndvi: 'Scout this cell for pests.',
    ndmi: 'Critical: irrigate now (this cell has no NDMI value).',
  },
});

describe('buildCellDetails', () => {
  const details = buildCellDetails(CELL);

  it('identifies the cell', () => {
    expect(details.id).toBe('12');
  });

  it('gives every area a score and a rating that reads the way the report does', () => {
    const byKey = Object.fromEntries(details.groups.map((group) => [group.key, group]));
    expect(byKey.Structural).toMatchObject({ score: '0.30', rating: 'attention' });
    expect(byKey.Chlorophyll).toMatchObject({ score: '0.80', rating: 'good' });
    expect(byKey.Environmental).toMatchObject({ score: '0.55', rating: 'fair' });
  });

  it('shows a dash and "no data" for an area the cell has no parameters for', () => {
    const water = details.groups.find((group) => group.key === 'Water_Drought');
    expect(water).toMatchObject({ score: '—', rating: 'none', rows: [] });
  });

  it('lists only the parameters the cell has, under their area, with units', () => {
    const structural = details.groups.find((group) => group.key === 'Structural');
    expect(structural?.rows).toEqual([{ label: 'NDVI', value: '0.31' }]);
    const environment = details.groups.find((group) => group.key === 'Environmental');
    expect(environment?.rows.map((row) => row.label)).toEqual(['Air temp', 'LST']);
  });

  it('puts parameters the app does not know in their own group, without a score', () => {
    const other = details.groups.find((group) => group.key === 'other');
    expect(other).toMatchObject({
      title: 'Other parameters',
      score: null,
      rating: null,
      rows: [{ label: 'mystery', value: '3.14' }],
    });
  });

  it('keeps advice only for parameters that have a value', () => {
    expect(details.advice).toEqual([{ label: 'NDVI', text: 'Scout this cell for pests.' }]);
  });

  it('copes with a cell that has no metrics at all', () => {
    const empty = buildCellDetails(makeCell('1'));
    expect(empty.advice).toEqual([]);
    expect(empty.groups.every((group) => group.rows.length === 0)).toBe(true);
    expect(empty.groups.some((group) => group.key === 'other')).toBe(false);
  });
});
