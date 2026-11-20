import { describe, expect, it } from 'vitest';
import {
  CROP_CATEGORY_KEYS,
  CROP_CATEGORY_LABELS,
  SUPPORTED_CROPS,
  cropCategoryLabel,
  findCrop,
  groupCropsByCategory,
  normalizeForSearch,
  parseCropCategoryKey,
  searchCrops,
} from './crops';

describe('crop catalogue', () => {
  it('has the 12 category keys, each with a display label', () => {
    expect(CROP_CATEGORY_KEYS).toHaveLength(12);
    for (const key of CROP_CATEGORY_KEYS) {
      expect(CROP_CATEGORY_LABELS[key].length).toBeGreaterThan(0);
      expect(cropCategoryLabel(key)).toBe(CROP_CATEGORY_LABELS[key]);
    }
    expect(cropCategoryLabel('cereals_c3_temperate')).toBe('Cereals (C3, temperate)');
  });

  it('mirrors 82 supported crops, all in a known category with unique English names', () => {
    expect(SUPPORTED_CROPS).toHaveLength(82);
    const names = new Set<string>();
    for (const crop of SUPPORTED_CROPS) {
      expect(CROP_CATEGORY_KEYS).toContain(crop.category);
      expect(names.has(crop.english)).toBe(false);
      names.add(crop.english);
    }
    expect(SUPPORTED_CROPS[0]).toEqual({
      english: 'Wheat',
      desi: 'Gehu',
      category: 'cereals_c3_temperate',
    });
  });

  it('every category has at least one crop', () => {
    const grouped = groupCropsByCategory();
    for (const key of CROP_CATEGORY_KEYS) {
      expect(grouped[key].length).toBeGreaterThan(0);
    }
    expect(grouped.tubers_temperate.map((c) => c.english)).toEqual([
      'Potatoes',
      'Beetroot',
      'Turnip',
    ]);
  });
});

describe('parseCropCategoryKey', () => {
  it('accepts only exact category keys', () => {
    expect(parseCropCategoryKey('fruits_tropical')).toBe('fruits_tropical');
    expect(parseCropCategoryKey('Fruits_Tropical')).toBeNull();
    expect(parseCropCategoryKey('wheat')).toBeNull();
    expect(parseCropCategoryKey('')).toBeNull();
  });
});

describe('normalizeForSearch', () => {
  it('lowercases, strips accents, collapses whitespace and treats underscores as spaces', () => {
    expect(normalizeForSearch('  Pearl   MILLET ')).toBe('pearl millet');
    expect(normalizeForSearch('Gēhū')).toBe('gehu');
    expect(normalizeForSearch('café')).toBe('cafe'); // decomposed accent
    expect(normalizeForSearch('café')).toBe('cafe'); // precomposed accent
    expect(normalizeForSearch('cereals_c3_temperate')).toBe('cereals c3 temperate');
  });
});

describe('searchCrops', () => {
  it('returns every crop for an empty or blank query', () => {
    expect(searchCrops('')).toHaveLength(SUPPORTED_CROPS.length);
    expect(searchCrops('   ')).toHaveLength(SUPPORTED_CROPS.length);
  });

  it('finds crops by English name, case-insensitively', () => {
    expect(searchCrops('WHEAT').map((c) => c.english)).toEqual(['Wheat']);
    expect(searchCrops('millet').map((c) => c.english)).toEqual([
      'Pearl Millet',
      'Finger Millet',
      'Foxtail Millet',
      'Little Millet',
      'Barnyard Millet',
      'Kodo Millet',
    ]);
  });

  it('finds crops by desi name', () => {
    expect(searchCrops('gehu')[0]?.english).toBe('Wheat');
    expect(searchCrops('bajra')[0]?.english).toBe('Pearl Millet');
    expect(searchCrops('arhar')[0]?.english).toBe('Pigeon pea');
  });

  it('is accent-insensitive in both directions', () => {
    expect(searchCrops('Géhu')[0]?.english).toBe('Wheat');
    expect(searchCrops('GĒHŪ')[0]?.english).toBe('Wheat');
  });

  it('ranks exact, then prefix, then word-prefix, then substring matches', () => {
    const results = searchCrops('pea').map((c) => c.english);
    // Prefix matches first (Peach, Peanuts, Pear), then word prefix (Green Peas), then substring.
    expect(results.indexOf('Peach')).toBeLessThan(results.indexOf('Green Peas'));
    expect(results.indexOf('Green Peas')).toBeLessThan(results.indexOf('Chickpeas'));
    expect(searchCrops('maize')[0]?.english).toBe('Maize');
    expect(searchCrops('apple')[0]?.english).toBe('Apple');
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchCrops('zzzz')).toEqual([]);
  });

  it('trims the query', () => {
    expect(searchCrops('  wheat ').map((c) => c.english)).toEqual(['Wheat']);
  });
});

describe('findCrop', () => {
  it('resolves an exact English or desi name like the backend does', () => {
    expect(findCrop('Wheat')?.category).toBe('cereals_c3_temperate');
    expect(findCrop(' gehu ')?.english).toBe('Wheat');
    expect(findCrop('Tur / Arhar')?.english).toBe('Pigeon pea');
  });

  it('returns null for partial, unknown or blank names', () => {
    expect(findCrop('  ')).toBeNull();
    expect(findCrop('whe')).toBeNull();
    expect(findCrop('unknown')).toBeNull();
  });
});
