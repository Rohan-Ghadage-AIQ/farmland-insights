import { Button } from '@/components/ui';
import {
  areaAcres,
  areaHectares,
  formatAcres,
  formatCount,
  formatHectares,
  vertexCount,
  type FarmFeatureCollection,
} from '@/domain';

export interface FieldSummaryProps {
  readonly field: FarmFeatureCollection;
  /** Pans/zooms the map to the field. Omit while there is nothing to zoom to from here. */
  readonly onZoomToField?: () => void;
}

/** Area (ha/acres) and vertex count for the current field, plus "Zoom to field" (spec 3.3.1). */
export function FieldSummary({ field, onZoomToField }: FieldSummaryProps) {
  const hectares = areaHectares(field);
  const acres = areaAcres(field);
  const vertices = vertexCount(field);

  return (
    <div className="flex items-center justify-between gap-3 rounded-panel border border-border bg-surface-muted p-3 text-sm">
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        <div className="flex gap-1">
          <dt className="text-fg-muted">Area</dt>
          <dd className="font-medium text-fg tabular-nums">
            {formatHectares(hectares)} · {formatAcres(acres)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-fg-muted">Vertices</dt>
          <dd className="font-medium text-fg tabular-nums">{formatCount(vertices)}</dd>
        </div>
      </dl>
      <Button
        variant="secondary"
        size="sm"
        disabled={onZoomToField === undefined}
        onClick={onZoomToField}
      >
        Zoom to field
      </Button>
    </div>
  );
}
