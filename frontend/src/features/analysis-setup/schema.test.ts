import { describe, expect, it } from 'vitest';
import type { IsoDate } from '@/domain';
import { createAnalysisSetupSchema, defaultAnalysisSetupValues } from './schema';

const TODAY = '2026-11-04' as IsoDate;

function parse(values: unknown) {
  return createAnalysisSetupSchema(TODAY).safeParse(values);
}

describe('createAnalysisSetupSchema', () => {
  it('accepts a fully valid set of values', () => {
    const result = parse({
      crop: 'Wheat',
      startDate: '2026-10-01',
      endDate: '2026-10-30',
      gridSize: 50,
      imageDate: '',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a desi crop name', () => {
    const result = parse({
      crop: 'Gehu',
      startDate: '2026-10-01',
      endDate: '2026-10-30',
      gridSize: 50,
      imageDate: '',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a blank crop', () => {
    const result = parse({
      crop: '',
      startDate: '2026-10-01',
      endDate: '2026-10-30',
      gridSize: 50,
      imageDate: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'crop')).toBe(true);
    }
  });

  it('rejects a crop that is not in the catalogue', () => {
    const result = parse({
      crop: 'Not a real crop',
      startDate: '2026-10-01',
      endDate: '2026-10-30',
      gridSize: 50,
      imageDate: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects blank dates', () => {
    const result = parse({
      crop: 'Wheat',
      startDate: '',
      endDate: '',
      gridSize: 50,
      imageDate: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('startDate');
      expect(paths).toContain('endDate');
    }
  });

  it('rejects a start date after the end date', () => {
    const result = parse({
      crop: 'Wheat',
      startDate: '2026-10-30',
      endDate: '2026-10-01',
      gridSize: 50,
      imageDate: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an end date beyond today + 16 days', () => {
    const result = parse({
      crop: 'Wheat',
      startDate: '2026-10-01',
      endDate: '2026-11-25',
      gridSize: 50,
      imageDate: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'endDate')).toBe(true);
    }
  });

  it('rejects a missing grid size', () => {
    const result = parse({
      crop: 'Wheat',
      startDate: '2026-10-01',
      endDate: '2026-10-30',
      gridSize: null,
      imageDate: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a non-integer grid size', () => {
    const result = parse({
      crop: 'Wheat',
      startDate: '2026-10-01',
      endDate: '2026-10-30',
      gridSize: 12.5,
      imageDate: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a grid size of zero or less', () => {
    const result = parse({
      crop: 'Wheat',
      startDate: '2026-10-01',
      endDate: '2026-10-30',
      gridSize: 0,
      imageDate: '',
    });

    expect(result.success).toBe(false);
  });
});

describe('defaultAnalysisSetupValues', () => {
  it('starts blank with the default grid size', () => {
    expect(defaultAnalysisSetupValues()).toEqual({
      crop: '',
      startDate: '',
      endDate: '',
      gridSize: 50,
      imageDate: '',
    });
  });
});
