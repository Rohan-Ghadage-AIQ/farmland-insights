import { clusterLabel, formatNumber, getMetric } from '@/domain';
import type { LayerModel, LayerSpec, LegendInput, Theme, TooltipRow } from '@/features/map';

/** A value for one cell on the active layer, as `GridOverlay`'s hover event carries it. */
export interface HoverCellValue {
  readonly gridId: string | number;
  readonly value: number | null;
  readonly noData: boolean;
}

export interface LayerDisplay {
  readonly title: string;
  readonly unit: string | null;
  /** Decimal places the legend and tooltip should use for this layer's values. */
  readonly decimals: number;
  /** `farm`: the same value in every cell. CPI layers are always per-cell. */
  readonly scope: 'cell' | 'farm';
}

/** CPI scores are always shown to 2 decimals, unitless, varying per cell (spec 2.5, 3.4). */
const CPI_DECIMALS = 2;

/**
 * What a map layer is called and how its values should read, from the domain's own cluster and
 * metric dictionaries. The single place the map slot, its legend and its hover tooltip agree on
 * a layer's title, unit, precision and scope.
 */
export function describeLayer(layer: LayerSpec): LayerDisplay {
  if (layer.kind === 'cpi') {
    return {
      title: clusterLabel(layer.cluster),
      unit: null,
      decimals: CPI_DECIMALS,
      scope: 'cell',
    };
  }
  const meta = getMetric(layer.metric);
  return { title: meta.label, unit: meta.unit, decimals: meta.decimals, scope: meta.scope };
}

/** Builds the `Legend`'s model input from the active layer and its already-computed `LayerModel`. */
export function buildLegendInput(layer: LayerSpec, model: LayerModel, theme: Theme): LegendInput {
  const display = describeLayer(layer);
  return {
    title: display.title,
    unit: display.unit,
    scale: model.scale,
    domain: model.domain,
    noDataCount: model.data.noDataCount,
    theme,
    decimals: display.decimals,
    scope: display.scope,
  };
}

export interface BuildHoverRowsOptions {
  readonly layer: LayerSpec;
  readonly gridId: string | number;
  readonly cellValue: HoverCellValue;
}

/** The hover tooltip's title and rows (spec 3.4: "grid id, the current layer's value"). */
export function buildHoverRows({ layer, gridId, cellValue }: BuildHoverRowsOptions): {
  readonly title: string;
  readonly rows: readonly TooltipRow[];
} {
  const display = describeLayer(layer);
  const value = cellValue.noData || cellValue.value === null ? null : cellValue.value;
  return {
    title: `Cell ${String(gridId)}`,
    rows: [
      {
        label: display.title,
        value: value === null ? null : formatNumber(value, display.decimals),
        // `exactOptionalPropertyTypes` forbids `unit: undefined`; omit the key entirely instead.
        ...(display.unit === null ? {} : { unit: display.unit }),
      },
    ],
  };
}
