import type { CpiScores, GridAnalysisFeature } from './types';

interface CellOptions {
  metrics?: Record<string, number>;
  cpi?: Partial<CpiScores>;
  advisories?: Record<string, string>;
  /** Lower-left corner of a 0.001 degree square, so cells do not overlap. */
  origin?: [number, number];
}

const DEFAULT_CPI: CpiScores = {
  Structural: 0.5,
  Chlorophyll: 0.5,
  Water_Drought: 0.5,
  Environmental: 0.5,
  Agro_Meteo: 0.5,
};

/** Builds one analysis cell for tests. Omitting `metrics` yields a cell with `raw_metrics` absent. */
export function makeCell(gridId: string | number, options: CellOptions = {}): GridAnalysisFeature {
  const [x, y] = options.origin ?? [77, 28];
  const d = 0.001;
  return {
    type: 'Feature',
    id: gridId,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, y],
          [x + d, y],
          [x + d, y + d],
          [x, y + d],
          [x, y],
        ],
      ],
    },
    properties: {
      grid_id: gridId,
      ...(options.metrics ? { raw_metrics: options.metrics } : {}),
      cpi_scores: { ...DEFAULT_CPI, ...options.cpi },
      ...(options.advisories ? { advisories: options.advisories } : {}),
    },
  };
}
