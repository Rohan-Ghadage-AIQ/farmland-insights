import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import type { FarmFeatureCollection } from '@/domain';
import { FieldSummary } from './FieldSummary';
import { PasteField } from './PasteField';
import { SAMPLE_FIELD } from './sample-field';
import { UploadField } from './UploadField';

export interface FieldStepProps {
  /** The current field, normalized by draw, upload or paste. Null until one is given. */
  readonly value: FarmFeatureCollection | null;
  readonly onChange: (collection: FarmFeatureCollection) => void;
  /** Pans/zooms the shared map to the field; omit where the map is not reachable from here. */
  readonly onZoomToField?: () => void;
  /** True while an analysis is running: the step locks (spec 3.4). */
  readonly disabled?: boolean;
}

/**
 * Step 1, "Field" (spec 3.3.1): draw on the map (default), upload or paste a GeoJSON file, plus
 * a sample field and the area/vertex summary. The three inputs all produce the same normalized
 * `FarmFeatureCollection` through `domain.validateFarmGeometry`.
 *
 * The actual drawing canvas lives on the shared map (`features/map`'s `DrawControl`), driven by
 * the same `value`/`onChange`; this step only shows the Draw tab's instructions and status.
 */
export function FieldStep({ value, onChange, onZoomToField, disabled = false }: FieldStepProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-fg">Field</h3>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onChange(SAMPLE_FIELD);
          }}
        >
          Load sample field
        </Button>
      </div>

      <Tabs defaultValue="draw">
        <TabsList aria-label="How to give the farm boundary">
          <TabsTrigger value="draw" disabled={disabled}>
            Draw
          </TabsTrigger>
          <TabsTrigger value="upload" disabled={disabled}>
            Upload
          </TabsTrigger>
          <TabsTrigger value="paste" disabled={disabled}>
            Paste
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draw">
          <p className="text-sm text-fg-muted">
            {value === null
              ? 'Draw the field outline on the map, using the drawing tools above it.'
              : 'Edit the field outline on the map, or switch tools below.'}
          </p>
        </TabsContent>

        <TabsContent value="upload">
          <UploadField onLoad={onChange} disabled={disabled} />
        </TabsContent>

        <TabsContent value="paste">
          <PasteField onLoad={onChange} disabled={disabled} />
        </TabsContent>
      </Tabs>

      {value === null ? null : (
        <FieldSummary field={value} {...(onZoomToField === undefined ? {} : { onZoomToField })} />
      )}
    </div>
  );
}
