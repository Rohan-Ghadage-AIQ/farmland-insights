import { describe, expect, it } from 'vitest';
import { csvCell, flattenToCsv, toGeoJsonString } from './export';
import { makeCell } from './fixtures';
import type { FarmAnalysisResponse } from './types';

function parse(csv: string): string[][] {
  return csv.split('\r\n').map((line) => line.split(','));
}

describe('csvCell', () => {
  it('leaves plain text and numbers alone', () => {
    expect(csvCell('hello')).toBe('hello');
    expect(csvCell(0.64)).toBe('0.64');
    expect(csvCell(-0.5)).toBe('-0.5');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(null)).toBe('');
  });

  it('quotes values with commas, quotes or line breaks and doubles inner quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('two\r\nlines')).toBe('"two\r\nlines"');
  });

  it.each(['=SUM(A1)', '+1+1', '-2+3', '@cmd', '\tTabbed', '\rReturn'])(
    'neutralises spreadsheet formula injection in %j',
    (text) => {
      const cell = csvCell(text);
      const unquoted = cell.startsWith('"') ? cell.slice(1, -1) : cell;
      expect(unquoted.startsWith("'")).toBe(true);
      expect(unquoted.slice(1)).toBe(text);
    },
  );

  it('neutralises and quotes a formula that also needs quoting', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });

  it('does not alter text that merely contains an operator', () => {
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('Irrigate 2-3 times')).toBe('Irrigate 2-3 times');
  });

  it('writes non-finite numbers as empty', () => {
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('flattenToCsv', () => {
  const cells = [
    makeCell(1, {
      metrics: { t2m: 24.8, ndvi: 0.64 },
      cpi: { Structural: 0.71, Chlorophyll: 0.3, Environmental: 0.69 },
      advisories: { ndvi: 'Routine scout for pests', t2m: 'Maintain current irrigation' },
    }),
    makeCell('B2', {
      metrics: { ndvi: 0.2, ndre: 0.3 },
      cpi: { Structural: 0.1, Chlorophyll: 0.2 },
      advisories: { ndvi: 'Check canopy, urgently', ndre: 'Maintain N' },
    }),
  ];

  it('writes one header row and one row per cell', () => {
    const rows = parse(
      flattenToCsv(cells).replace('"Check canopy, urgently"', 'Check canopy urgently'),
    );
    expect(rows).toHaveLength(3);
  });

  it('starts with grid_id and the five CPI scores, then metrics in dictionary order, then advisories', () => {
    const header = parse(flattenToCsv(cells))[0];
    expect(header).toEqual([
      'grid_id',
      'cpi_Structural',
      'cpi_Chlorophyll',
      'cpi_Water_Drought',
      'cpi_Environmental',
      'cpi_Agro_Meteo',
      'ndvi',
      'ndre',
      't2m',
      'advisory_ndvi',
      'advisory_ndre',
      'advisory_t2m',
    ]);
  });

  it('fills values per cell and leaves missing metrics empty', () => {
    const lines = flattenToCsv(cells).split('\r\n');
    expect(lines[1]).toBe(
      '1,0.71,,,0.69,,0.64,,24.8,Routine scout for pests,,Maintain current irrigation',
    );
    expect(lines[2]).toBe('B2,0.1,0.2,,,,0.2,0.3,,"Check canopy, urgently",Maintain N,');
  });

  it('leaves CPI empty for a cluster with no data instead of a misleading 0.0 (ADR-003)', () => {
    const csv = flattenToCsv([
      makeCell(1, { metrics: { ndvi: 0.5 }, cpi: { Structural: 0.5, Chlorophyll: 0 } }),
    ]);
    const [header = '', row = ''] = csv.split('\r\n');
    const names = header.split(',');
    const values = row.split(',');
    expect(values[names.indexOf('cpi_Structural')]).toBe('0.5');
    expect(values[names.indexOf('cpi_Chlorophyll')]).toBe('');
  });

  it('keeps a genuine 0 score when the cluster has data', () => {
    const csv = flattenToCsv([makeCell(1, { metrics: { ndvi: 0.01 }, cpi: { Structural: 0 } })]);
    const [header = '', row = ''] = csv.split('\r\n');
    expect(row.split(',')[header.split(',').indexOf('cpi_Structural')]).toBe('0');
  });

  it('leaves out the advisory of a metric with no value (ADR-004) but keeps the column', () => {
    const csv = flattenToCsv([
      makeCell(1, {
        metrics: { ndvi: 0.5 },
        advisories: { ndvi: 'Fine', ndre: 'CRITICAL for missing data' },
      }),
    ]);
    expect(csv).not.toContain('CRITICAL');
    expect(csv.split('\r\n')[0]).toContain('advisory_ndre');
  });

  it('puts metrics the dictionary does not know after the known ones, sorted', () => {
    const header = flattenToCsv([makeCell(1, { metrics: { zeta: 1, alpha: 2, ndvi: 3 } })])
      .split('\r\n')[0]
      ?.split(',');
    expect(header?.slice(6)).toEqual(['ndvi', 'alpha', 'zeta']);
  });

  it('is injection-safe for advisory text and grid ids', () => {
    const csv = flattenToCsv([
      makeCell('=cmd', { metrics: { ndvi: 0.5 }, advisories: { ndvi: '=1+1' } }),
      makeCell('-7', { metrics: { ndvi: 0.5 }, advisories: { ndvi: '@SUM(A1)' } }),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]?.startsWith("'=cmd,")).toBe(true);
    expect(lines[1]?.endsWith(",'=1+1")).toBe(true);
    expect(lines[2]?.startsWith("'-7,")).toBe(true);
    expect(lines[2]?.endsWith(",'@SUM(A1)")).toBe(true);
  });

  it('escapes header names too', () => {
    const header = flattenToCsv([makeCell(1, { metrics: { '=evil': 1 } })]).split('\r\n')[0];
    expect(header).toContain("'=evil");
  });

  it('writes only the fixed columns for no cells', () => {
    expect(flattenToCsv([])).toBe(
      'grid_id,cpi_Structural,cpi_Chlorophyll,cpi_Water_Drought,cpi_Environmental,cpi_Agro_Meteo',
    );
  });

  it('handles cells without metrics or advisories', () => {
    const lines = flattenToCsv([makeCell(1)]).split('\r\n');
    expect(lines).toEqual([
      'grid_id,cpi_Structural,cpi_Chlorophyll,cpi_Water_Drought,cpi_Environmental,cpi_Agro_Meteo',
      '1,,,,,',
    ]);
  });
});

describe('toGeoJsonString', () => {
  const response: FarmAnalysisResponse = {
    type: 'FeatureCollection',
    features: [makeCell(1, { metrics: { ndvi: 0.5 } })],
  };

  it('serialises the collection as pretty-printed GeoJSON that round-trips', () => {
    const text = toGeoJsonString(response);
    expect(text).toContain('\n  "type": "FeatureCollection"');
    expect(JSON.parse(text)).toEqual(response);
  });

  it('keeps only type and features', () => {
    const extra = { ...response, bbox: [1], name: 'x' } as FarmAnalysisResponse;
    expect(Object.keys(JSON.parse(toGeoJsonString(extra)) as object)).toEqual(['type', 'features']);
  });

  it('can be compact', () => {
    expect(toGeoJsonString(response, 0)).not.toContain('\n');
  });
});
