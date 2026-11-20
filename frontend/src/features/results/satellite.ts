import { getMetric, isMetricKey, type GridAnalysisFeature } from '@/domain';

/**
 * Whether any cell has a value for a metric that actually varies by cell: a satellite or radar
 * index (`scope: 'cell'` in the metric dictionary), as opposed to farm-level weather broadcast
 * to every cell from the centroid (ADR-005). When this is false across the whole run, Earth
 * Engine returned nothing for any cell and only weather data (if any) came back.
 */
export function hasAnySatelliteMetric(cells: readonly GridAnalysisFeature[]): boolean {
  return cells.some((cell) => {
    const raw = cell.properties.raw_metrics;
    if (raw === undefined) return false;
    return Object.entries(raw).some(
      ([key, value]) =>
        Number.isFinite(value) && isMetricKey(key) && getMetric(key).scope === 'cell',
    );
  });
}
