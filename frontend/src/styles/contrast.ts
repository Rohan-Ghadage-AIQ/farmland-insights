/**
 * WCAG 2.x contrast maths, used by tokens.test.ts to prove the palette meets AA
 * (4.5:1 for text, 3:1 for UI boundaries and marks) instead of eyeballing it.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parses `#rgb` or `#rrggbb`. Anything else (rgb(), named colours, alpha) is rejected on purpose. */
export function parseHexColor(hex: string): Rgb {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (digits === undefined) {
    throw new Error(`Expected a hex colour like #1d4ed8, got "${hex}"`);
  }
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((c) => c + c)
          .join('')
      : digits;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance as defined by WCAG 2.x (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** Contrast ratio between two opaque colours, from 1 to 21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Reads `selector { --name: value; }` rules out of a stylesheet. At-rule wrappers (such as the
 * prefers-color-scheme media query) are skipped so their inner rules map by their own selector.
 */
export function parseTokenBlocks(css: string): Map<string, Record<string, string>> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = new Map<string, Record<string, string>>();
  for (const [, rawSelector, body] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rawSelector?.trim();
    if (
      selector === undefined ||
      selector === '' ||
      selector.startsWith('@') ||
      body === undefined
    ) {
      continue;
    }
    const declarations: Record<string, string> = {};
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (name !== undefined && value !== undefined) declarations[name] = value.trim();
    }
    blocks.set(selector, { ...blocks.get(selector), ...declarations });
  }
  return blocks;
}
