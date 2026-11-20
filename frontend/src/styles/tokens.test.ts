import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseTokenBlocks } from './contrast';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');

const blocks = parseTokenBlocks(read('tokens.css'));
const light = blocks.get(':root') ?? {};
const darkAuto = blocks.get(":root:not([data-theme='light'])") ?? {};
const darkManual = blocks.get(":root[data-theme='dark']") ?? {};

const THEMES = [
  ['light', light],
  ['dark', { ...light, ...darkManual }],
] as const;

describe('token structure', () => {
  it('defines the 4px spacing scale', () => {
    const scale = [1, 2, 3, 4, 6, 8, 12].map((n) => light[`--space-${String(n)}`]);
    expect(scale).toEqual(['4px', '8px', '12px', '16px', '24px', '32px', '48px']);
  });

  it('uses 6px control radius and 10px panel radius', () => {
    expect(light['--radius-control']).toBe('6px');
    expect(light['--radius-panel']).toBe('10px');
  });

  it('defines the 12/13/14/16/20/24 type scale', () => {
    const sizes = ['xs', 'sm', 'base', 'md', 'lg', 'xl'].map((s) => light[`--font-size-${s}`]);
    expect(sizes).toEqual(['12px', '13px', '14px', '16px', '20px', '24px']);
  });

  it('has exactly one elevation level', () => {
    const shadows = Object.keys(light).filter((name) => name.startsWith('--shadow'));
    expect(shadows).toEqual(['--shadow']);
  });

  it('dark theme via prefers-color-scheme and via the manual toggle are identical', () => {
    expect(Object.keys(darkAuto).length).toBeGreaterThan(10);
    expect(darkAuto).toEqual(darkManual);
  });

  it('dark theme overrides every colour token that light defines', () => {
    const colourTokens = Object.entries(light)
      .filter(([, value]) => value.startsWith('#'))
      .map(([name]) => name);
    const missing = colourTokens.filter((name) => !(name in darkManual));
    expect(missing).toEqual([]);
  });
});

describe.each(THEMES)('%s theme contrast', (_name, tokens) => {
  const color = (token: string): string => {
    const value = tokens[token];
    if (value === undefined) throw new Error(`Missing token ${token}`);
    return value;
  };

  const TEXT_PAIRS: readonly (readonly [string, string])[] = [
    ['--fg', '--bg'],
    ['--fg', '--surface'],
    ['--fg', '--surface-muted'],
    ['--fg-muted', '--bg'],
    ['--fg-muted', '--surface'],
    ['--fg-muted', '--surface-muted'],
    ['--accent', '--bg'],
    ['--accent', '--surface'],
    ['--accent', '--accent-subtle'],
    ['--accent-fg', '--accent'],
    ['--success', '--bg'],
    ['--success', '--surface'],
    ['--success', '--success-bg'],
    ['--warning', '--bg'],
    ['--warning', '--surface'],
    ['--warning', '--warning-bg'],
    ['--danger', '--bg'],
    ['--danger', '--surface'],
    ['--danger', '--danger-bg'],
  ];

  it.each(TEXT_PAIRS)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  const UI_PAIRS: readonly (readonly [string, string])[] = [
    ['--border-strong', '--bg'],
    ['--border-strong', '--surface'],
    ['--accent', '--bg'],
    ['--accent', '--surface'],
    ['--accent', '--surface-muted'],
  ];

  it.each(UI_PAIRS)('UI boundary or mark %s against %s is at least 3:1', (fg, bg) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(3);
  });
});

describe('globals.css', () => {
  const globals = read('globals.css');

  it('turns on tabular numbers for the whole app', () => {
    expect(globals).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('draws a visible focus ring from the ring token', () => {
    expect(globals).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/);
  });

  it('respects prefers-reduced-motion', () => {
    expect(globals).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
