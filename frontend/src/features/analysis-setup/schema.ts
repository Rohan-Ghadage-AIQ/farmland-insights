import { z } from 'zod';
import {
  DEFAULT_GRID_SIZE,
  findCrop,
  isValidGridSize,
  validateDateRange,
  type IsoDate,
} from '@/domain';

/**
 * Values the setup form owns (spec 3.3 steps 2-4). The farm boundary (step 1) is owned by the
 * `field` feature and passed into this feature as a prop, not as a form field here.
 */
export interface AnalysisSetupFormValues {
  /** The crop's catalogue identity (its English name), not the category sent to the API. */
  crop: string;
  startDate: string;
  endDate: string;
  /** Whole metres. `null` means "empty", matching the NumberField contract. */
  gridSize: number | null;
  /** The satellite pass to analyse, `YYYY-MM-DD`; `''` means none chosen (every pass combined). */
  imageDate: string;
}

export function defaultAnalysisSetupValues(): AnalysisSetupFormValues {
  return { crop: '', startDate: '', endDate: '', gridSize: DEFAULT_GRID_SIZE, imageDate: '' };
}

const shape = z.object({
  crop: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  gridSize: z.number().nullable(),
  imageDate: z.string(),
});

/**
 * Builds the form's validation schema. `today` is injected (rather than read from `new Date()`
 * inside the schema) so the +16-day rule stays testable and in step with the rest of the app.
 */
export function createAnalysisSetupSchema(today: IsoDate) {
  return shape.superRefine((values, ctx) => {
    if (values.crop.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['crop'], message: 'Choose a crop.' });
    } else if (findCrop(values.crop) === null) {
      ctx.addIssue({ code: 'custom', path: ['crop'], message: 'Choose a crop from the list.' });
    }

    if (values.startDate === '') {
      ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'Choose a start date.' });
    }
    if (values.endDate === '') {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Choose an end date.' });
    }
    if (values.startDate !== '' && values.endDate !== '') {
      for (const issue of validateDateRange(values.startDate, values.endDate, today)) {
        ctx.addIssue({
          code: 'custom',
          path: [issue.field === 'start' ? 'startDate' : 'endDate'],
          message: issue.message,
        });
      }
    }

    if (
      values.imageDate !== '' &&
      values.startDate !== '' &&
      values.endDate !== '' &&
      (values.imageDate < values.startDate || values.imageDate > values.endDate)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['imageDate'],
        message: 'Choose a satellite date inside the period.',
      });
    }

    if (values.gridSize === null) {
      ctx.addIssue({ code: 'custom', path: ['gridSize'], message: 'Set a grid size.' });
    } else if (!isValidGridSize(values.gridSize)) {
      ctx.addIssue({
        code: 'custom',
        path: ['gridSize'],
        message: 'Grid size must be a whole number of metres, greater than zero.',
      });
    }
  });
}
