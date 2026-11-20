/**
 * Small, dependency-free colour maths used to build and verify the data colour scales:
 * WCAG contrast, CIE Lab, CIEDE2000, colour-vision-deficiency simulation and Lab interpolation.
 * Everything here is pure and works on `#rrggbb` strings.
 */

export type Rgb = readonly [number, number, number];

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export type ColorVisionMode = 'protanopia' | 'deuteranopia';

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parses `#rgb` or `#rrggbb` into 0..255 channels. */
export function parseHex(hex: string): Rgb {
  const match = HEX_PATTERN.exec(hex);
  const digits = match?.[1];
  if (digits === undefined) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((c) => c + c)
          .join('')
      : digits;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

const clampByte = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));

/** Formats 0..255 channels as lower-case `#rrggbb`, clamping out-of-gamut values. */
export function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => clampByte(c).toString(16).padStart(2, '0')).join('')}`;
}

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (linear: number): number => {
  const c = Math.min(1, Math.max(0, linear));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
};

type Vec3 = readonly [number, number, number];

const linearRgb = (hex: string): Vec3 => {
  const [r, g, b] = parseHex(hex);
  return [toLinear(r), toLinear(g), toLinear(b)];
};

/** WCAG 2.x relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1 to 21. Symmetric. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// D65 reference white.
const WHITE = { x: 0.95047, y: 1, z: 1.08883 } as const;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

const labF = (t: number): number => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const labFInverse = (t: number): number => {
  const cubed = t * t * t;
  return cubed > EPSILON ? cubed : (116 * t - 16) / KAPPA;
};

export function hexToLab(hex: string): Lab {
  const [r, g, b] = linearRgb(hex);
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const fx = labF(x / WHITE.x);
  const fy = labF(y / WHITE.y);
  const fz = labF(z / WHITE.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToHex(lab: Lab): string {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const x = labFInverse(fx) * WHITE.x;
  const y = (lab.l > KAPPA * EPSILON ? fy * fy * fy : lab.l / KAPPA) * WHITE.y;
  const z = labFInverse(fz) * WHITE.z;
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return toHex([fromLinear(r), fromLinear(g), fromLinear(b)]);
}

/** CIE L* (0 to 100), the perceptual lightness used for the "monotonic lightness" checks. */
export function lightness(hex: string): number {
  return hexToLab(hex).l;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (radians: number): number => (radians * 180) / Math.PI;

/** CIEDE2000 colour difference (kL = kC = kH = 1). About 2.3 is one just-noticeable difference. */
export function deltaE2000(c1: Lab, c2: Lab): number {
  const avgL = (c1.l + c2.l) / 2;
  const chroma1 = Math.hypot(c1.a, c1.b);
  const chroma2 = Math.hypot(c2.a, c2.b);
  const avgChroma = (chroma1 + chroma2) / 2;
  const g = 0.5 * (1 - Math.sqrt(avgChroma ** 7 / (avgChroma ** 7 + 25 ** 7)));
  const a1 = c1.a * (1 + g);
  const a2 = c2.a * (1 + g);
  const cp1 = Math.hypot(a1, c1.b);
  const cp2 = Math.hypot(a2, c2.b);
  const avgCp = (cp1 + cp2) / 2;
  const hueOf = (b: number, a: number): number => {
    if (a === 0 && b === 0) return 0;
    const h = deg(Math.atan2(b, a));
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hueOf(c1.b, a1);
  const hp2 = hueOf(c2.b, a2);

  let dhp = 0;
  if (cp1 * cp2 !== 0) {
    dhp = hp2 - hp1;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  let avgHp = hp1 + hp2;
  if (cp1 * cp2 !== 0) {
    avgHp =
      Math.abs(hp1 - hp2) > 180 ? (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2 : avgHp / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(rad(avgHp - 30)) +
    0.24 * Math.cos(rad(2 * avgHp)) +
    0.32 * Math.cos(rad(3 * avgHp + 6)) -
    0.2 * Math.cos(rad(4 * avgHp - 63));
  const deltaTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2);
  const sc = 1 + 0.045 * avgCp;
  const sh = 1 + 0.015 * avgCp * t;
  const rt = -Math.sin(rad(2 * deltaTheta)) * rc;

  const dl = c2.l - c1.l;
  const dc = cp2 - cp1;
  const dh = 2 * Math.sqrt(cp1 * cp2) * Math.sin(rad(dhp / 2));

  return Math.sqrt((dl / sl) ** 2 + (dc / sc) ** 2 + (dh / sh) ** 2 + rt * (dc / sc) * (dh / sh));
}

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear RGB.
const CVD_MATRICES: Record<ColorVisionMode, readonly [Vec3, Vec3, Vec3]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

const dot = (row: Vec3, v: Vec3): number => row[0] * v[0] + row[1] * v[1] + row[2] * v[2];

/** Simulates how a colour appears to a viewer with complete protan or deutan colour blindness. */
export function simulateColorVision(hex: string, mode: ColorVisionMode): string {
  const linear = linearRgb(hex);
  const [r, g, b] = CVD_MATRICES[mode];
  return toHex([
    fromLinear(dot(r, linear)),
    fromLinear(dot(g, linear)),
    fromLinear(dot(b, linear)),
  ]);
}

/** Interpolates two colours in Lab so the midpoint is perceptually halfway. */
export function interpolateHex(from: string, to: string, t: number): string {
  if (t <= 0) return from.length === 7 ? from.toLowerCase() : toHex(parseHex(from));
  if (t >= 1) return to.length === 7 ? to.toLowerCase() : toHex(parseHex(to));
  const a = hexToLab(from);
  const b = hexToLab(to);
  return labToHex({ l: a.l + (b.l - a.l) * t, a: a.a + (b.a - a.a) * t, b: a.b + (b.b - a.b) * t });
}
