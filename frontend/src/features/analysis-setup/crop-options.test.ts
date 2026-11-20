import { describe, expect, it } from 'vitest';
import { SUPPORTED_CROPS } from '@/domain';
import { buildCropOptions, cropOptionValue } from './crop-options';

describe('cropOptionValue', () => {
  it('uses the crop English name as its unique identity', () => {
    const wheat = SUPPORTED_CROPS.find((crop) => crop.english === 'Wheat');
    if (!wheat) throw new Error('fixture crop "Wheat" is missing');
    expect(cropOptionValue(wheat)).toBe('Wheat');
  });
});

describe('buildCropOptions', () => {
  it('lists every supported crop', () => {
    const options = buildCropOptions([]);
    expect(options).toHaveLength(SUPPORTED_CROPS.length);
  });

  it('shows the English and desi name as the label, and the category as secondary text', () => {
    const options = buildCropOptions([]);
    const wheat = options.find((option) => option.value === 'Wheat');

    expect(wheat?.label).toBe('Wheat · Gehu');
    expect(wheat?.secondary).toBe('Cereals (C3, temperate)');
  });

  it('includes the desi name as a search keyword', () => {
    const options = buildCropOptions([]);
    const wheat = options.find((option) => option.value === 'Wheat');

    expect(wheat?.keywords).toContain('Gehu');
  });

  it('puts recent crops first, most recent first, without duplicating them', () => {
    const options = buildCropOptions(['Mustard', 'Wheat']);

    expect(options[0]?.value).toBe('Mustard');
    expect(options[1]?.value).toBe('Wheat');
    expect(options.filter((option) => option.value === 'Wheat')).toHaveLength(1);
    expect(options).toHaveLength(SUPPORTED_CROPS.length);
  });

  it('ignores a recent entry that is no longer a known crop', () => {
    const options = buildCropOptions(['Not a real crop', 'Wheat']);

    expect(options[0]?.value).toBe('Wheat');
    expect(options).toHaveLength(SUPPORTED_CROPS.length);
  });
});
