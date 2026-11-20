import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  deltaE2000,
  hexToLab,
  interpolateHex,
  lightness,
  parseHex,
  relativeLuminance,
  simulateColorVision,
  toHex,
  type Lab,
} from './color-math';

describe('hex parsing and formatting', () => {
  it('parses 6 and 3 digit hex in any case', () => {
    expect(parseHex('#FF8000')).toEqual([255, 128, 0]);
    expect(parseHex('#f80')).toEqual([255, 136, 0]);
  });

  it('round-trips through toHex as lower-case 6 digit hex', () => {
    expect(toHex([255, 128, 0])).toBe('#ff8000');
  });

  it('clamps and rounds channels when formatting', () => {
    expect(toHex([300, -4, 127.6])).toBe('#ff0080');
  });

  it('rejects malformed colors instead of returning NaN channels', () => {
    expect(() => parseHex('red')).toThrow(/hex/i);
    expect(() => parseHex('#12345')).toThrow(/hex/i);
  });
});

describe('WCAG contrast', () => {
  it('is 21:1 for black on white and 1:1 for identical colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#123456', '#fedcba')).toBeCloseTo(
      contrastRatio('#fedcba', '#123456'),
      10,
    );
  });

  it('matches the published value for #767676 on white (4.54:1)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('computes relative luminance per WCAG', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(relativeLuminance('#ff0000')).toBeCloseTo(0.2126, 4);
  });
});

describe('CIE Lab', () => {
  it('maps white to L=100 and black to L=0', () => {
    expect(lightness('#ffffff')).toBeCloseTo(100, 2);
    expect(lightness('#000000')).toBeCloseTo(0, 5);
  });

  it('maps sRGB red to the reference Lab value', () => {
    const lab = hexToLab('#ff0000');
    expect(lab.l).toBeCloseTo(53.24, 1);
    expect(lab.a).toBeCloseTo(80.09, 1);
    expect(lab.b).toBeCloseTo(67.2, 1);
  });
});

describe('CIEDE2000', () => {
  // Reference pairs from Sharma, Wu and Dalal (2005), the standard test data set.
  const pair = (a: Lab, b: Lab, expected: number) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 3);
  };

  it('matches the published reference pairs', () => {
    pair({ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425);
    pair({ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 }, 2.8615);
    pair({ l: 50, a: 2.5, b: 0 }, { l: 50, a: 0, b: -2.5 }, 4.3065);
  });

  it('is zero for identical colors and symmetric', () => {
    const a = hexToLab('#21918c');
    const b = hexToLab('#fde725');
    expect(deltaE2000(a, a)).toBe(0);
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 10);
  });
});

describe('color vision deficiency simulation (Machado 2009, severity 1.0)', () => {
  it('leaves neutral grays unchanged', () => {
    for (const mode of ['protanopia', 'deuteranopia'] as const) {
      const out = parseHex(simulateColorVision('#808080', mode));
      for (const channel of out) expect(Math.abs(channel - 128)).toBeLessThanOrEqual(1);
    }
  });

  it('collapses pure red and pure green toward similar hues for deuteranopia', () => {
    const red = hexToLab(simulateColorVision('#ff0000', 'deuteranopia'));
    const green = hexToLab(simulateColorVision('#00c000', 'deuteranopia'));
    // Both land on the yellow-brown axis: their b* is positive in both cases.
    expect(red.b).toBeGreaterThan(0);
    expect(green.b).toBeGreaterThan(0);
  });

  it('always returns a valid hex color', () => {
    expect(simulateColorVision('#fde725', 'protanopia')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('interpolateHex (Lab space)', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(interpolateHex('#440154', '#fde725', 0)).toBe('#440154');
    expect(interpolateHex('#440154', '#fde725', 1)).toBe('#fde725');
  });

  it('has lightness between the endpoints at t=0.5', () => {
    const mid = lightness(interpolateHex('#000000', '#ffffff', 0.5));
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(60);
  });
});
