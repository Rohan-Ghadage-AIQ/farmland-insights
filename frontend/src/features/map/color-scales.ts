import { interpolateHex, parseHex } from './color-math';
import type { Theme } from './types';

/**
 * Data colour scales for the map. See docs/DESIGN.md "Data color scales" for the rationale and the
 * verification results (colour-blind simulation, lightness monotonicity, basemap contrast).
 *
 * Design constraints that shape the numbers below:
 * - No red-green. CPI uses viridis, raw metrics use cividis (both perceptually uniform and
 *   colour-blind safe); the diverging scale is blue to orange.
 * - Marks must reach 3:1 contrast against the basemap (WCAG 1.4.11). One luminance range cannot
 *   clear both a light and a dark basemap, so each theme gets the part of the palette that does:
 *   dark-to-mid tones on the light basemap, mid-to-light tones on the dim basemap.
 */

export type ScaleKind = 'cpi' | 'metric' | 'diverging';

export interface ColorStop {
  /** Position along the scale, 0..1. */
  readonly offset: number;
  readonly color: string;
}

export interface ColorScale {
  readonly kind: ScaleKind;
  readonly theme: Theme;
  readonly stops: readonly ColorStop[];
}

// matplotlib viridis and cividis sampled at 17 points (t = i/16).
const VIRIDIS = [
  '#440154',
  '#48186a',
  '#472d7b',
  '#424086',
  '#3b528b',
  '#33638d',
  '#2c728e',
  '#26828e',
  '#21918c',
  '#1fa088',
  '#28ae80',
  '#3fbc73',
  '#5ec962',
  '#84d44b',
  '#addc30',
  '#d8e219',
  '#fde725',
] as const;

const CIVIDIS = [
  '#00224e',
  '#002e6a',
  '#1a386f',
  '#32436d',
  '#434e6c',
  '#535a6d',
  '#61656f',
  '#6f7073',
  '#7d7c78',
  '#8c8878',
  '#9b9476',
  '#aba072',
  '#bcae6c',
  '#cdbb63',
  '#dec958',
  '#f0d846',
  '#fee838',
] as const;

// Blue (low) to neutral to orange-brown (high). Lightness is designed per theme, see DESIGN.md.
const DIVERGING_LIGHT = [
  '#002c70',
  '#164376',
  '#4d5976',
  '#6f6f6f',
  '#715341',
  '#663615',
  '#531500',
] as const;

const DIVERGING_DARK = [
  '#b4e2ff',
  '#aac6ff',
  '#9fabcb',
  '#969696',
  '#c7a490',
  '#f9b892',
  '#ffce96',
] as const;

const evenStops = (colors: readonly string[]): readonly ColorStop[] =>
  colors.map((color, i) => ({ color, offset: i / (colors.length - 1) }));

const SCALES: Record<ScaleKind, Record<Theme, readonly ColorStop[]>> = {
  cpi: {
    light: evenStops(VIRIDIS.slice(0, 7)),
    dark: evenStops(VIRIDIS.slice(9)),
  },
  metric: {
    light: evenStops(CIVIDIS.slice(0, 8)),
    dark: evenStops(CIVIDIS.slice(10)),
  },
  diverging: {
    light: evenStops(DIVERGING_LIGHT),
    dark: evenStops(DIVERGING_DARK),
  },
};

export function getColorScale(kind: ScaleKind, theme: Theme): ColorScale {
  return { kind, theme, stops: SCALES[kind][theme] };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Colour at position `t` (0..1) on the scale, interpolated in Lab. */
export function colorAt(scale: ColorScale, t: number): string {
  const position = clamp01(t);
  const stops = scale.stops;
  const last = stops[stops.length - 1];
  const first = stops[0];
  if (first === undefined || last === undefined) {
    throw new Error('A colour scale needs at least one stop');
  }
  if (position <= first.offset) return first.color;
  if (position >= last.offset) return last.color;
  for (let i = 1; i < stops.length; i++) {
    const upper = stops[i];
    const lower = stops[i - 1];
    if (upper === undefined || lower === undefined) continue;
    if (position <= upper.offset) {
      const span = upper.offset - lower.offset;
      return interpolateHex(
        lower.color,
        upper.color,
        span === 0 ? 0 : (position - lower.offset) / span,
      );
    }
  }
  return last.color;
}

/** `count` evenly spaced colours from one end of the scale to the other. */
export function sampleScale(scale: ColorScale, count: number): string[] {
  if (count < 2) return [colorAt(scale, 0)];
  return Array.from({ length: count }, (_, i) => colorAt(scale, i / (count - 1)));
}

// --- Basemap reference colours -----------------------------------------------------------------

/**
 * Representative basemap colours, as rendered with BASEMAP_RASTER_PAINT, that data marks must
 * contrast with by at least 3:1. Light: white (roads, buildings), OSM land, vegetation, water.
 * Dark: black and the brightest pixel the dimmed raster can produce (white at 25% brightness).
 */
export const BASEMAP_REFERENCE_COLORS: Record<Theme, readonly string[]> = {
  light: ['#ffffff', '#f2efe9', '#bcd8b2', '#aad3df'],
  dark: ['#000000', '#404040'],
};

/** MapLibre raster paint values that keep the basemap inside the reference ranges above. */
export const BASEMAP_RASTER_PAINT: Record<
  Theme,
  { readonly brightnessMin: number; readonly brightnessMax: number; readonly saturation: number }
> = {
  light: { brightnessMin: 0, brightnessMax: 1, saturation: -0.4 },
  dark: { brightnessMin: 0, brightnessMax: 0.25, saturation: -0.5 },
};

// --- Value domains -----------------------------------------------------------------------------

export interface ValueDomain {
  readonly min: number;
  readonly max: number;
  /** The unclipped extremes, for the legend note ("clipped to the 2nd-98th percentile"). */
  readonly observedMin: number;
  readonly observedMax: number;
  /** True when at least one observed value lies outside `min..max`. */
  readonly clipped: boolean;
  /** True when every value is the same, so a gradient would mean nothing. */
  readonly flat: boolean;
  readonly midpoint?: number;
}

/** CPI scores are always on the fixed 0..1 scale. */
export function cpiDomain(): ValueDomain {
  return { min: 0, max: 1, observedMin: 0, observedMax: 1, clipped: false, flat: false };
}

/** Linear-interpolation percentile (R type 7) of an ascending array. `p` is 0..100. */
export function percentile(sortedAscending: readonly number[], p: number): number {
  const count = sortedAscending.length;
  const first = sortedAscending[0];
  if (first === undefined) return Number.NaN;
  const rank = clamp01(p / 100) * (count - 1);
  const lowerIndex = Math.floor(rank);
  const lower = sortedAscending[lowerIndex] ?? first;
  const upper = sortedAscending[Math.min(lowerIndex + 1, count - 1)] ?? lower;
  return lower + (upper - lower) * (rank - lowerIndex);
}

const CLIP_LOW = 2;
const CLIP_HIGH = 98;

const finiteSorted = (values: readonly number[]): number[] =>
  values.filter(Number.isFinite).sort((a, b) => a - b);

/** Raw-metric domain: observed values clipped to the 2nd-98th percentile. Null when no values. */
export function metricDomain(values: readonly number[]): ValueDomain | null {
  const sorted = finiteSorted(values);
  const observedMin = sorted[0];
  const observedMax = sorted[sorted.length - 1];
  if (observedMin === undefined || observedMax === undefined) return null;
  const min = percentile(sorted, CLIP_LOW);
  const max = percentile(sorted, CLIP_HIGH);
  return {
    min,
    max,
    observedMin,
    observedMax,
    clipped: observedMin < min || observedMax > max,
    flat: min === max,
  };
}

/** Diverging domain, clipped like a raw metric and made symmetric about `midpoint`. */
export function divergingDomain(values: readonly number[], midpoint: number): ValueDomain | null {
  const base = metricDomain(values);
  if (base === null) return null;
  const half = Math.max(Math.abs(base.min - midpoint), Math.abs(base.max - midpoint));
  return {
    ...base,
    min: midpoint - half,
    max: midpoint + half,
    flat: half === 0,
    midpoint,
  };
}

/**
 * Metrics whose midpoint carries meaning: z-scores (spi, spei, rwi) are centred on a normal
 * year, and cmi is a water balance where 0 means rainfall equals demand. Everything else is a
 * one-directional index and stays sequential.
 */
const MIDPOINTS: Readonly<Record<string, number>> = { spi: 0, spei: 0, rwi: 0, cmi: 0 };

export function divergingMidpoint(metricKey: string): number | undefined {
  return Object.hasOwn(MIDPOINTS, metricKey) ? MIDPOINTS[metricKey] : undefined;
}

/** Position of `value` on the scale (0..1), clamped. A flat domain maps to the middle. */
export function valueToOffset(value: number, domain: ValueDomain): number {
  if (domain.flat || domain.max === domain.min) return 0.5;
  return clamp01((value - domain.min) / (domain.max - domain.min));
}

// --- No-data hatch -----------------------------------------------------------------------------

export interface NoDataPatternSpec {
  /** Image id registered with `map.addImage`. */
  readonly id: string;
  /** Tile edge in pixels. The stripe period equals this, so the tile repeats seamlessly. */
  readonly size: number;
  /** Stripe thickness in pixels, measured along the x axis. */
  readonly lineWidth: number;
  /** Neutral grey stroke; the background is transparent so the basemap stays visible. */
  readonly color: string;
}

export function getNoDataPattern(theme: Theme): NoDataPatternSpec {
  return {
    id: `no-data-hatch-${theme}`,
    size: 8,
    lineWidth: 2,
    color: theme === 'light' ? '#595959' : '#b0b0b0',
  };
}

export interface PatternImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major. */
  readonly data: Uint8ClampedArray;
}

/** Rasterises the hatch without needing a canvas, so it is testable and worker-safe. */
export function renderNoDataPattern(spec: NoDataPatternSpec): PatternImage {
  const { size, lineWidth } = spec;
  const [r, g, b] = parseHex(spec.color);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size < lineWidth) {
        const offset = (y * size + x) * 4;
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
      }
    }
  }
  return { width: size, height: size, data };
}
