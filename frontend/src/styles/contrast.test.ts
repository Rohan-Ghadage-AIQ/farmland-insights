import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHexColor, parseTokenBlocks, relativeLuminance } from './contrast';

describe('parseHexColor', () => {
  it('reads 6-digit and 3-digit hex colours', () => {
    expect(parseHexColor('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('rejects anything that is not a hex colour', () => {
    expect(() => parseHexColor('rgb(0 0 0)')).toThrow(/hex/i);
    expect(() => parseHexColor('#12')).toThrow(/hex/i);
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('contrastRatio', () => {
  it('gives 21:1 for black on white and 1:1 for identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#1d4ed8', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#1d4ed8'),
      10,
    );
  });

  it('matches the WCAG reference value for #767676 on white (4.54:1)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('parseTokenBlocks', () => {
  it('maps each selector to its custom properties and ignores comments', () => {
    const css = `
      /* a comment { with: braces } */
      :root { --a: #fff; --b: 4px; }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme='light']) { --a: #000; }
      }
    `;

    const blocks = parseTokenBlocks(css);

    expect(blocks.get(':root')).toEqual({ '--a': '#fff', '--b': '4px' });
    expect(blocks.get(":root:not([data-theme='light'])")).toEqual({ '--a': '#000' });
  });
});
