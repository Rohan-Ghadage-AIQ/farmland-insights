// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CROP_CATEGORY_KEYS, SUPPORTED_CROPS } from './crops';

// frontend/src/domain -> repository root is three levels up.
const REQUESTS_PY = fileURLToPath(new URL('../../../app/models/requests.py', import.meta.url));

/** Reads the Python source with normalised line endings (the repo is edited on Windows too). */
function readPython(): string {
  return readFileSync(REQUESTS_PY, 'utf8').replace(/\r\n/g, '\n');
}

interface ParsedPython {
  categories: string[];
  crops: { english: string; desi: string; category: string }[];
}

/** Extracts the CropCategory enum values and the SUPPORTED_CROPS tuple from the Python source. */
function parseRequestsPy(source: string): ParsedPython {
  const enumMatch = /class CropCategory\(str, Enum\):\n((?:[ \t]+\w+ = "[^"]+"\n)+)/.exec(source);
  const categories = [...(enumMatch?.[1] ?? '').matchAll(/^[ \t]+\w+ = "([^"]+)"$/gm)].map(
    (m) => m[1] ?? '',
  );

  const cropsMatch = /SUPPORTED_CROPS[^=]*=\s*\(\n([\s\S]*?)\n\)\n/.exec(source);
  const crops = [
    ...(cropsMatch?.[1] ?? '').matchAll(
      /\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*CropCategory\.(\w+)\s*\)/g,
    ),
  ].map((m) => ({ english: m[1] ?? '', desi: m[2] ?? '', category: m[3] ?? '' }));

  return { categories, crops };
}

describe('SUPPORTED_CROPS drift check against app/models/requests.py', () => {
  const python = parseRequestsPy(readPython());

  it('parsed something (guards against a vacuous pass)', () => {
    expect(python.categories.length).toBe(12);
    expect(python.crops.length).toBeGreaterThan(70);
  });

  it('has the same category keys, in the same order', () => {
    expect(python.categories).toEqual([...CROP_CATEGORY_KEYS]);
  });

  it('has the same crops (English name, desi name, category), in the same order', () => {
    expect(SUPPORTED_CROPS.map((c) => ({ ...c }))).toEqual(python.crops);
  });

  it('the parser notices a changed, added or removed crop', () => {
    const source = readPython();
    const changed = parseRequestsPy(source.replace('("Wheat", "Gehu"', '("Wheat", "Gehun"'));
    expect(changed.crops).not.toEqual(SUPPORTED_CROPS.map((c) => ({ ...c })));
    const removed = parseRequestsPy(source.replace(/ {4}\("Rye".*\n/, ''));
    expect(removed.crops).toHaveLength(SUPPORTED_CROPS.length - 1);
    const added = parseRequestsPy(
      source.replace(
        '    ("Wheat"',
        '    ("Teff", "Teff", CropCategory.cereals_c4_tropical),\n    ("Wheat"',
      ),
    );
    expect(added.crops).toHaveLength(SUPPORTED_CROPS.length + 1);
  });
});
