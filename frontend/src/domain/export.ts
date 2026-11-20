import { clusterScore, gridIdOf, hasMetricValue } from './cpi';
import { CLUSTER_KEYS, METRIC_KEYS, isMetricKey } from './metrics';
import type { FarmAnalysisResponse, GridAnalysisFeature } from './types';

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * One CSV field. Quotes per RFC 4180, and defuses spreadsheet formula injection: text that starts
 * with = + - @ (or a tab or carriage return) gets a leading apostrophe. Numbers are written as is,
 * so a legitimate -0.5 stays a number.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = value !== '' && FORMULA_TRIGGERS.has(value.charAt(0)) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Known metrics in dictionary order, then unknown ones alphabetically. */
function orderedKeys(keys: ReadonlySet<string>): string[] {
  const known = METRIC_KEYS.filter((key) => keys.has(key));
  const unknown = [...keys].filter((key) => !isMetricKey(key)).sort();
  return [...known, ...unknown];
}

/**
 * One row per cell: grid_id, the five CPI scores, every metric, then every advisory.
 * A CPI score is left empty when the cell has no data for that cluster (ADR-003), and an advisory
 * is left empty when its metric has no value (ADR-004), so the file never carries made-up numbers
 * or advice triggered by missing data.
 */
export function flattenToCsv(cells: readonly GridAnalysisFeature[]): string {
  const metricKeys = new Set<string>();
  const advisoryKeys = new Set<string>();
  for (const { properties } of cells) {
    Object.keys(properties.raw_metrics ?? {}).forEach((key) => metricKeys.add(key));
    Object.keys(properties.advisories ?? {}).forEach((key) => advisoryKeys.add(key));
  }
  const metrics = orderedKeys(metricKeys);
  const advisories = orderedKeys(advisoryKeys);

  const header = [
    'grid_id',
    ...CLUSTER_KEYS.map((cluster) => `cpi_${cluster}`),
    ...metrics,
    ...advisories.map((metric) => `advisory_${metric}`),
  ];

  const rows = cells.map((cell) => [
    gridIdOf(cell),
    ...CLUSTER_KEYS.map((cluster) => clusterScore(cell, cluster)),
    ...metrics.map((metric) => cell.properties.raw_metrics?.[metric]),
    ...advisories.map((metric) =>
      hasMetricValue(cell, metric) ? cell.properties.advisories?.[metric] : undefined,
    ),
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** The analysis result as GeoJSON text, ready to save. */
export function toGeoJsonString(response: FarmAnalysisResponse, space = 2): string {
  return JSON.stringify({ type: response.type, features: response.features }, null, space);
}
