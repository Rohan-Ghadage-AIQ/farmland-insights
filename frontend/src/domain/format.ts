import { getMetric, type MetricKey } from './metrics';

export const NO_VALUE = '—';
const DEFAULT_LOCALE = 'en-US';

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(decimals: number, locale: string): Intl.NumberFormat {
  const cacheKey = `${locale}|${decimals}`;
  const cached = formatters.get(cacheKey);
  if (cached) return cached;
  const created = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    // Rounding -0.001 to two places should read 0.00, not -0.00.
    signDisplay: 'negative',
  });
  formatters.set(cacheKey, created);
  return created;
}

/** Fixed-decimal number with grouping. Non-finite values become a dash. */
export function formatNumber(
  value: number,
  decimals: number,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!Number.isFinite(value)) return NO_VALUE;
  return formatterFor(decimals, locale).format(value);
}

/** Indices and scores: two decimals. */
export function formatIndex(value: number): string {
  return formatNumber(value, 2);
}

/** Physical quantities: one decimal. */
export function formatPhysical(value: number): string {
  return formatNumber(value, 1);
}

/** These "units" describe a range or a flag and are not appended to a value. */
const DESCRIPTIVE_UNITS: ReadonlySet<string> = new Set(['0–100', '0 or 1', 'ratio']);

/** A metric value with its unit, using the metric's own precision. */
export function formatMetricValue(key: MetricKey, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_VALUE;
  const meta = getMetric(key);
  const text = formatNumber(value, meta.decimals);
  if (meta.unit === null || DESCRIPTIVE_UNITS.has(meta.unit)) return text;
  return meta.unit === '%' ? `${text}%` : `${text} ${meta.unit}`;
}

export function formatCount(value: number): string {
  return formatNumber(value, 0);
}

export function formatHectares(value: number): string {
  return `${formatNumber(value, 2)} ha`;
}

export function formatAcres(value: number): string {
  return `${formatNumber(value, 2)} ac`;
}

/** "≈ 240 cells" for the live grid-size estimate. */
export function formatCellEstimate(count: number): string {
  return `≈ ${formatCount(count)} ${count === 1 ? 'cell' : 'cells'}`;
}
