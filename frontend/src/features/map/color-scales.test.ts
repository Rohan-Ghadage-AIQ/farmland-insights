import { describe, expect, it } from 'vitest';
import {
  colorAt,
  cpiDomain,
  divergingDomain,
  divergingMidpoint,
  getColorScale,
  getNoDataPattern,
  metricDomain,
  percentile,
  renderNoDataPattern,
  sampleScale,
  valueToOffset,
  BASEMAP_REFERENCE_COLORS,
  type ColorScale,
  type ScaleKind,
} from './color-scales';
import {
  contrastRatio,
  deltaE2000,
  hexToLab,
  lightness,
  simulateColorVision,
  type ColorVisionMode,
} from './color-math';
import type { Theme } from './types';

const THEMES: readonly Theme[] = ['light', 'dark'];
const SEQUENTIAL: readonly ScaleKind[] = ['cpi', 'metric'];
const VISIONS: readonly (ColorVisionMode | 'normal')[] = ['normal', 'protanopia', 'deuteranopia'];

const see = (hex: string, vision: ColorVisionMode | 'normal'): string =>
  vision === 'normal' ? hex : simulateColorVision(hex, vision);

/** Smallest CIEDE2000 difference between neighbouring samples, as seen with the given vision. */
function minAdjacentDelta(colors: readonly string[], vision: ColorVisionMode | 'normal'): number {
  let min = Infinity;
  for (let i = 1; i < colors.length; i++) {
    const previous = colors[i - 1];
    const current = colors[i];
    if (previous === undefined || current === undefined) continue;
    min = Math.min(
      min,
      deltaE2000(hexToLab(see(previous, vision)), hexToLab(see(current, vision))),
    );
  }
  return min;
}

const lightnessSeries = (colors: readonly string[], vision: ColorVisionMode | 'normal'): number[] =>
  colors.map((c) => lightness(see(c, vision)));

const isStrictlyIncreasing = (values: readonly number[]): boolean =>
  values.every((v, i) => i === 0 || v > (values[i - 1] ?? Infinity));

const isStrictlyDecreasing = (values: readonly number[]): boolean =>
  values.every((v, i) => i === 0 || v < (values[i - 1] ?? -Infinity));

describe('scale structure', () => {
  for (const theme of THEMES) {
    for (const kind of ['cpi', 'metric', 'diverging'] as const) {
      it(`${kind}/${theme}: stops are valid hex with ascending offsets from 0 to 1`, () => {
        const scale = getColorScale(kind, theme);
        expect(scale.kind).toBe(kind);
        expect(scale.theme).toBe(theme);
        expect(scale.stops.length).toBeGreaterThanOrEqual(5);
        expect(scale.stops[0]?.offset).toBe(0);
        expect(scale.stops[scale.stops.length - 1]?.offset).toBe(1);
        scale.stops.forEach((stop, i) => {
          expect(stop.color).toMatch(/^#[0-9a-f]{6}$/);
          if (i > 0) expect(stop.offset).toBeGreaterThan(scale.stops[i - 1]?.offset ?? 1);
        });
      });
    }
  }

  it('uses viridis for CPI and cividis for raw metrics (distinct families)', () => {
    expect(getColorScale('cpi', 'light').stops[0]?.color).toBe('#440154');
    expect(getColorScale('metric', 'light').stops[0]?.color).toBe('#00224e');
  });

  it('colorAt returns the end stops at 0 and 1 and clamps outside the range', () => {
    const scale = getColorScale('cpi', 'light');
    expect(colorAt(scale, 0)).toBe(scale.stops[0]?.color);
    expect(colorAt(scale, 1)).toBe(scale.stops[scale.stops.length - 1]?.color);
    expect(colorAt(scale, -3)).toBe(colorAt(scale, 0));
    expect(colorAt(scale, 9)).toBe(colorAt(scale, 1));
  });

  it('sampleScale returns n evenly spaced colors including both ends', () => {
    const scale = getColorScale('metric', 'dark');
    const samples = sampleScale(scale, 5);
    expect(samples).toHaveLength(5);
    expect(samples[0]).toBe(colorAt(scale, 0));
    expect(samples[4]).toBe(colorAt(scale, 1));
  });
});

describe('colour-blind safety of sequential scales', () => {
  for (const theme of THEMES) {
    for (const kind of SEQUENTIAL) {
      const scale = getColorScale(kind, theme);
      const anchors = scale.stops.map((s) => s.color);
      const steps = sampleScale(scale, 7);
      const classes = sampleScale(scale, 6);

      for (const vision of VISIONS) {
        it(`${kind}/${theme}: lightness rises monotonically (${vision})`, () => {
          expect(isStrictlyIncreasing(lightnessSeries(anchors, vision))).toBe(true);
          expect(isStrictlyIncreasing(lightnessSeries(steps, vision))).toBe(true);
        });

        it(`${kind}/${theme}: 6 classes differ by at least dE2000 3, 7 by at least 2.3 (${vision})`, () => {
          // 2.3 is one just-noticeable difference; 3 leaves a margin for legend reading.
          expect(minAdjacentDelta(classes, vision)).toBeGreaterThanOrEqual(3);
          expect(minAdjacentDelta(steps, vision)).toBeGreaterThanOrEqual(2.3);
        });
      }

      it(`${kind}/${theme}: has no red hue, so it never pairs red with green`, () => {
        for (const color of anchors) {
          const lab = hexToLab(color);
          if (Math.hypot(lab.a, lab.b) < 25) continue;
          const hue = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
          // Lab hue angles: red, orange and brown sit at 10-75 degrees.
          expect(hue < 10 || hue > 75).toBe(true);
        }
      });
    }
  }
});

describe('diverging scale', () => {
  for (const theme of THEMES) {
    const scale = getColorScale('diverging', theme);
    const anchors = scale.stops.map((s) => s.color);
    const centre = Math.floor(anchors.length / 2);

    it(`${theme}: has an odd stop count with the neutral centre at offset 0.5`, () => {
      expect(anchors.length % 2).toBe(1);
      expect(scale.stops[centre]?.offset).toBeCloseTo(0.5, 10);
      const lab = hexToLab(anchors[centre] ?? '#000000');
      expect(Math.hypot(lab.a, lab.b)).toBeLessThan(8);
    });

    for (const vision of VISIONS) {
      it(`${theme}: lightness moves monotonically away from the centre (${vision})`, () => {
        const series = lightnessSeries(anchors, vision);
        const lowSide = series.slice(0, centre + 1).reverse(); // centre outwards to the low end
        const highSide = series.slice(centre);
        // Light theme marks must stay dark to keep contrast on a light basemap, so ends get darker.
        const monotone = theme === 'light' ? isStrictlyDecreasing : isStrictlyIncreasing;
        expect(monotone(lowSide)).toBe(true);
        expect(monotone(highSide)).toBe(true);
      });

      it(`${theme}: adjacent steps and the two ends stay distinguishable (${vision})`, () => {
        expect(minAdjacentDelta(sampleScale(scale, 7), vision)).toBeGreaterThanOrEqual(3);
        expect(minAdjacentDelta(sampleScale(scale, 9), vision)).toBeGreaterThanOrEqual(2.3);
        const first = anchors[0] ?? '#000000';
        const last = anchors[anchors.length - 1] ?? '#000000';
        expect(
          deltaE2000(hexToLab(see(first, vision)), hexToLab(see(last, vision))),
        ).toBeGreaterThan(15);
      });
    }

    it(`${theme}: uses blue and orange families, never red-green`, () => {
      for (const color of anchors) {
        const lab = hexToLab(color);
        if (Math.hypot(lab.a, lab.b) < 12) continue;
        const hue = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
        const blue = hue >= 230 && hue <= 300;
        const orange = hue >= 20 && hue <= 90;
        expect(blue || orange).toBe(true);
      }
    });
  }
});

describe('contrast of data marks against the basemap (WCAG 1.4.11, at least 3:1)', () => {
  const kinds: readonly ScaleKind[] = ['cpi', 'metric', 'diverging'];
  for (const theme of THEMES) {
    for (const kind of kinds) {
      it(`${kind}/${theme}: every point on the scale clears 3:1 on every ${theme} reference colour`, () => {
        const scale: ColorScale = getColorScale(kind, theme);
        const colors = sampleScale(scale, 60);
        let worst = Infinity;
        for (const color of colors) {
          for (const reference of BASEMAP_REFERENCE_COLORS[theme]) {
            worst = Math.min(worst, contrastRatio(color, reference));
          }
        }
        expect(worst).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe('value domains', () => {
  it('CPI always uses the fixed 0..1 domain and is never clipped', () => {
    expect(cpiDomain()).toEqual({
      min: 0,
      max: 1,
      observedMin: 0,
      observedMax: 1,
      clipped: false,
      flat: false,
    });
  });

  it('percentile interpolates linearly between ranks', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentile(sorted, 0)).toBe(10);
    expect(percentile(sorted, 100)).toBe(50);
    expect(percentile(sorted, 50)).toBe(30);
    expect(percentile(sorted, 25)).toBe(20);
    expect(percentile(sorted, 10)).toBeCloseTo(14, 10);
  });

  it('raw metrics clip an outlier to the 2nd-98th percentile and flag it', () => {
    const values = [...Array.from({ length: 100 }, (_, i) => i + 1), 10_000];
    const domain = metricDomain(values);
    expect(domain).not.toBeNull();
    expect(domain?.clipped).toBe(true);
    expect(domain?.observedMax).toBe(10_000);
    expect(domain?.observedMin).toBe(1);
    expect(domain?.max).toBeLessThan(110);
    expect(domain?.min).toBeGreaterThanOrEqual(1);
  });

  it('does not flag clipping when nothing falls outside the percentile band (uniform data)', () => {
    const domain = metricDomain([5, 5, 5, 5]);
    expect(domain?.clipped).toBe(false);
    expect(domain?.flat).toBe(true);
    expect(domain?.min).toBe(5);
    expect(domain?.max).toBe(5);
  });

  it('ignores non-finite values and returns null when there is nothing to scale', () => {
    expect(metricDomain([])).toBeNull();
    expect(metricDomain([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
    expect(metricDomain([1, Number.NaN, 3])?.observedMax).toBe(3);
  });

  it('small samples are not clipped when every value is inside the band', () => {
    const domain = metricDomain([0.2, 0.4, 0.6]);
    expect(domain?.min).toBeCloseTo(0.2 + 0.4 * 0.02, 10);
    expect(domain?.clipped).toBe(true); // the extremes sit outside the 2-98 band by definition
  });

  it('diverging domain is symmetric about the midpoint', () => {
    const domain = divergingDomain([-0.5, 0.1, 1.5], 0);
    expect(domain).not.toBeNull();
    expect(domain?.midpoint).toBe(0);
    expect((domain?.max ?? 0) + (domain?.min ?? 0)).toBeCloseTo(0, 10);
    expect(domain?.max).toBeGreaterThan(1.4);
  });

  it('knows which metrics have a meaningful midpoint (z-scores and the water balance)', () => {
    expect(divergingMidpoint('spi')).toBe(0);
    expect(divergingMidpoint('spei')).toBe(0);
    expect(divergingMidpoint('rwi')).toBe(0);
    expect(divergingMidpoint('cmi')).toBe(0);
    expect(divergingMidpoint('ndvi')).toBeUndefined();
    expect(divergingMidpoint('vci')).toBeUndefined();
  });

  it('valueToOffset clamps to 0..1 and maps a flat domain to the middle', () => {
    const domain = {
      min: 10,
      max: 20,
      observedMin: 0,
      observedMax: 40,
      clipped: true,
      flat: false,
    };
    expect(valueToOffset(15, domain)).toBeCloseTo(0.5, 10);
    expect(valueToOffset(-100, domain)).toBe(0);
    expect(valueToOffset(100, domain)).toBe(1);
    expect(valueToOffset(7, { ...domain, min: 7, max: 7, flat: true })).toBe(0.5);
  });
});

describe('no-data hatch pattern', () => {
  for (const theme of THEMES) {
    it(`${theme}: spec is neutral and its stroke clears 3:1 on the basemap`, () => {
      const spec = getNoDataPattern(theme);
      expect(spec.id).toBe(`no-data-hatch-${theme}`);
      const lab = hexToLab(spec.color);
      expect(Math.hypot(lab.a, lab.b)).toBeLessThan(6);
      for (const reference of BASEMAP_REFERENCE_COLORS[theme]) {
        expect(contrastRatio(spec.color, reference)).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('renders a seamless diagonal hatch as RGBA pixels with a transparent background', () => {
    const spec = getNoDataPattern('light');
    const image = renderNoDataPattern(spec);
    expect(image.width).toBe(spec.size);
    expect(image.height).toBe(spec.size);
    expect(image.data).toHaveLength(spec.size * spec.size * 4);

    const alphaAt = (x: number, y: number): number =>
      image.data[
        ((((y % spec.size) + spec.size) % spec.size) * spec.size +
          (((x % spec.size) + spec.size) % spec.size)) *
          4 +
          3
      ] ?? -1;
    let inked = 0;
    for (let y = 0; y < spec.size; y++) {
      for (let x = 0; x < spec.size; x++) {
        if (alphaAt(x, y) > 0) inked++;
        // Diagonal stripes: moving one pixel right and one pixel up stays on the same stripe.
        expect(alphaAt(x, y)).toBe(alphaAt(x + 1, y - 1));
      }
    }
    expect(inked).toBeGreaterThan(0);
    expect(inked).toBeLessThan(spec.size * spec.size);
    // Stroke colour is applied on inked pixels.
    const first = image.data.findIndex((_, i) => i % 4 === 3 && (image.data[i] ?? 0) > 0);
    expect(first).toBeGreaterThan(-1);
  });
});
