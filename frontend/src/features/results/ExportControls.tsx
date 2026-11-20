import { useState } from 'react';
import {
  flattenToCsv,
  toGeoJsonString,
  type FarmAnalysisRequest,
  type FarmAnalysisResponse,
  type FarmFeatureCollection,
  type GridAnalysisFeature,
} from '@/domain';
import { Button, Tooltip } from '@/components/ui';
import { downloadDataUrl, downloadText } from './download';
import { buildHtmlReport, reportFilename, type ReportLegend } from './report';

/** What the HTML report needs beyond the results themselves. */
export interface ReportSource {
  /** The inputs the shown result was computed from. */
  readonly request?: FarmAnalysisRequest | null | undefined;
  readonly farm?: FarmFeatureCollection | null | undefined;
  /**
   * Frames the whole farm, waits for the map to finish drawing and returns a PNG data URL
   * (`useMapActions().capturePng`). Without it the report is exported without a map image.
   */
  readonly captureMap?: (() => Promise<string>) | undefined;
  /** One line under the map image, e.g. which layer it shows. */
  readonly mapCaption?: string | undefined;
  /** The colour key for the layer shown in the map image. */
  readonly legend?: ReportLegend | null | undefined;
}

export interface ExportControlsProps {
  readonly response: FarmAnalysisResponse;
  readonly cells: readonly GridAnalysisFeature[];
  /**
   * `useMapActions().exportPng` from the map feature, supplied by whoever composes the app.
   * Results and the map live in sibling AppShell slots (see ARCHITECTURE.md), so this component
   * cannot reach the map's React context itself; the integrator passes the function down once the
   * map exists. PNG export is disabled, with an explanation, until it is supplied.
   */
  readonly exportMapPng?: (() => string) | undefined;
  readonly report?: ReportSource | undefined;
  readonly filenamePrefix?: string;
}

/**
 * Downloads the analysis as GeoJSON, a flattened CSV, a PNG of the map (spec 3.4 "Export"), or a
 * self-contained HTML report with the map image and every parameter value.
 */
export function ExportControls({
  response,
  cells,
  exportMapPng,
  report,
  filenamePrefix = 'farmland-analysis',
}: ExportControlsProps) {
  const hasCells = cells.length > 0;
  const [reportState, setReportState] = useState<'idle' | 'busy' | 'no-map'>('idle');

  const exportReport = async (): Promise<void> => {
    setReportState('busy');
    let mapImage: string | null = null;
    let mapFailed = false;
    if (report?.captureMap !== undefined) {
      try {
        mapImage = await report.captureMap();
      } catch {
        mapFailed = true;
      }
    }
    const generatedAt = new Date();
    downloadText(
      buildHtmlReport({
        cells,
        request: report?.request,
        farm: report?.farm,
        imagery: response.imagery,
        mapImage,
        mapCaption: report?.mapCaption,
        legend: report?.legend,
        generatedAt,
      }),
      reportFilename(report?.request, generatedAt),
      'text/html',
    );
    setReportState(mapFailed ? 'no-map' : 'idle');
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={!hasCells}
        onClick={() => {
          downloadText(
            toGeoJsonString(response),
            `${filenamePrefix}.geojson`,
            'application/geo+json',
          );
        }}
      >
        Export GeoJSON
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={!hasCells}
        onClick={() => {
          downloadText(flattenToCsv(cells), `${filenamePrefix}.csv`, 'text/csv');
        }}
      >
        Export CSV
      </Button>
      <Tooltip content={exportMapPng === undefined ? 'The map has not loaded yet.' : null}>
        <Button
          variant="secondary"
          size="sm"
          disabled={exportMapPng === undefined}
          onClick={() => {
            if (exportMapPng === undefined) return;
            downloadDataUrl(exportMapPng(), `${filenamePrefix}.png`);
          }}
        >
          Export map as PNG
        </Button>
      </Tooltip>
      <Button
        variant="secondary"
        size="sm"
        disabled={!hasCells || reportState === 'busy'}
        onClick={() => {
          void exportReport();
        }}
      >
        {reportState === 'busy' ? 'Preparing report…' : 'Export HTML report'}
      </Button>
      {reportState === 'no-map' ? (
        <p role="status" className="text-fg-muted w-full text-sm">
          The map image could not be captured, so the report was exported without it.
        </p>
      ) : null}
    </div>
  );
}
