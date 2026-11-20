import { describe, expect, it } from 'vitest';
import { colorAt, cpiDomain, divergingDomain, getColorScale, metricDomain } from './color-scales';
import { buildLegendModel } from './legend-model';

const cpiScale = getColorScale('cpi', 'light');

describe('buildLegendModel', () => {
  it('describes a CPI legend: fixed 0 to 1, no clipping note, gradient from the scale ends', () => {
    const model = buildLegendModel({
      title: 'Water & drought CPI',
      unit: null,
      scale: cpiScale,
      domain: cpiDomain(),
      noDataCount: 0,
      theme: 'light',
    });
    expect(model.title).toBe('Water & drought CPI');
    expect(model.min).toBe('0.00');
    expect(model.max).toBe('1.00');
    expect(model.midpoint).toBeNull();
    expect(model.clippedNote).toBeNull();
    expect(model.flatNote).toBeNull();
    expect(model.noData).toBeNull();
    expect(model.gradient.startsWith('linear-gradient(to right, ')).toBe(true);
    expect(model.gradient).toContain(`${colorAt(cpiScale, 0)} 0%`);
    expect(model.gradient).toContain(`${colorAt(cpiScale, 1)} 100%`);
  });

  it('formats labels with the requested decimals and keeps the unit separate', () => {
    const domain = metricDomain([10, 20, 30, 40, 50]);
    if (domain === null) throw new Error('expected a domain');
    const model = buildLegendModel({
      title: 'Air temperature',
      unit: '°C',
      scale: getColorScale('metric', 'light'),
      domain,
      noDataCount: 0,
      theme: 'light',
      decimals: 1,
    });
    expect(model.unit).toBe('°C');
    // 2nd and 98th percentile of 10..50 are 10.8 and 49.2.
    expect(model.min).toBe('10.8');
    expect(model.max).toBe('49.2');
  });

  it('explains clipping with the observed range when outliers were clipped', () => {
    const values = [...Array.from({ length: 100 }, (_, i) => i + 1), 5000];
    const domain = metricDomain(values);
    if (domain === null) throw new Error('expected a domain');
    const model = buildLegendModel({
      title: 'NDVI',
      unit: null,
      scale: getColorScale('metric', 'light'),
      domain,
      noDataCount: 0,
      theme: 'light',
      decimals: 0,
    });
    expect(model.clippedNote).toBe(
      'Colours clipped to the 2nd to 98th percentile. Observed range 1 to 5,000.',
    );
  });

  it('says every cell is the same for a flat farm-level metric, and for a flat cell metric', () => {
    const domain = metricDomain([24, 24, 24]);
    if (domain === null) throw new Error('expected a domain');
    const base = {
      title: 'Air temperature',
      unit: '°C',
      scale: getColorScale('metric', 'light'),
      domain,
      noDataCount: 0,
      theme: 'light',
    } as const;
    expect(buildLegendModel({ ...base, scope: 'farm' }).flatNote).toBe(
      'Same for every cell. Weather is measured at the farm centre.',
    );
    expect(buildLegendModel({ ...base, scope: 'cell' }).flatNote).toBe(
      'Every cell has the same value.',
    );
  });

  it('labels the midpoint of a diverging scale', () => {
    const domain = divergingDomain([-1.5, 0, 2], 0);
    if (domain === null) throw new Error('expected a domain');
    const model = buildLegendModel({
      title: 'SPI',
      unit: 'σ',
      scale: getColorScale('diverging', 'light'),
      domain,
      noDataCount: 0,
      theme: 'light',
    });
    expect(model.midpoint).toBe('0.00');
    expect(model.min).toBe(`-${model.max}`);
  });

  it('includes a no-data entry with the hatch colour only when some cells have no data', () => {
    const base = {
      title: 'CPI',
      unit: null,
      scale: cpiScale,
      domain: cpiDomain(),
      theme: 'dark',
    } as const;
    expect(buildLegendModel({ ...base, noDataCount: 0 }).noData).toBeNull();
    const withNoData = buildLegendModel({ ...base, noDataCount: 3 });
    expect(withNoData.noData).toEqual({ label: 'No data', count: 3, color: '#b0b0b0' });
  });

  it('never prints negative zero', () => {
    const domain = { ...cpiDomain(), min: -0.0001, max: 1 };
    const model = buildLegendModel({
      title: 'x',
      unit: null,
      scale: cpiScale,
      domain,
      noDataCount: 0,
      theme: 'light',
    });
    expect(model.min).toBe('0.00');
  });
});
