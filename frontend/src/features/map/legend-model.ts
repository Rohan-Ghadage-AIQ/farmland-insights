import { getNoDataPattern, sampleScale, type ColorScale, type ValueDomain } from './color-scales';
import type { Theme } from './types';

export interface LegendModel {
  readonly title: string;
  readonly unit: string | null;
  /** CSS `background-image` value for the continuous colour bar. */
  readonly gradient: string;
  readonly min: string;
  readonly max: string;
  /** Label for the neutral centre of a diverging scale; null for sequential scales. */
  readonly midpoint: string | null;
  /** Shown when outliers were clipped to the 2nd-98th percentile. */
  readonly clippedNote: string | null;
  /** Shown when every cell has the same value, so the gradient carries no information. */
  readonly flatNote: string | null;
  /** Present only when at least one cell has no data. */
  readonly noData: {
    readonly label: string;
    readonly count: number;
    readonly color: string;
  } | null;
}

export interface LegendInput {
  readonly title: string;
  readonly unit: string | null;
  readonly scale: ColorScale;
  readonly domain: ValueDomain;
  readonly noDataCount: number;
  readonly theme: Theme;
  /** 2 for indices (default), 1 for physical units. */
  readonly decimals?: number;
  readonly scope?: 'cell' | 'farm';
}

const GRADIENT_STEPS = 9;

function formatter(decimals: number): (value: number) => string {
  const format = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (value) => {
    const text = format.format(value);
    // Rounding can produce "-0.00"; a zero should never carry a sign.
    return Number(text.replaceAll(',', '')) === 0 ? format.format(0) : text;
  };
}

export function buildLegendModel(input: LegendInput): LegendModel {
  const { domain, scale, noDataCount, theme } = input;
  const format = formatter(input.decimals ?? 2);

  const colors = sampleScale(scale, GRADIENT_STEPS);
  const stops = colors.map(
    (color, i) => `${color} ${Math.round((i / (GRADIENT_STEPS - 1)) * 100)}%`,
  );

  let flatNote: string | null = null;
  if (domain.flat) {
    flatNote =
      input.scope === 'farm'
        ? 'Same for every cell. Weather is measured at the farm centre.'
        : 'Every cell has the same value.';
  }

  const clippedNote =
    domain.clipped && !domain.flat
      ? `Colours clipped to the 2nd to 98th percentile. Observed range ${format(domain.observedMin)} to ${format(domain.observedMax)}.`
      : null;

  return {
    title: input.title,
    unit: input.unit,
    gradient: `linear-gradient(to right, ${stops.join(', ')})`,
    min: format(domain.min),
    max: format(domain.max),
    midpoint: domain.midpoint === undefined ? null : format(domain.midpoint),
    clippedNote,
    flatNote,
    noData:
      noDataCount > 0
        ? { label: 'No data', count: noDataCount, color: getNoDataPattern(theme).color }
        : null,
  };
}
