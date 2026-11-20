import { useState } from 'react';
import { clusterLabel, farmBbox, getMetric } from '@/domain';
import { Button, Dialog } from '@/components/ui';
import { HistoryPanel } from '@/features/history';
import { buildLegendModel, getClusterOptions, getLayerModel, toLayerSpec } from '@/features/map';
import { ResultsPanel, type ReportSource, type ResultsStatus } from '@/features/results';
import { useTheme } from '../theme';
import { buildLegendInput } from './layer-display';
import { useWorkspace } from './WorkspaceContext';

function statusFor(flowStatus: 'idle' | 'running' | 'success' | 'error'): ResultsStatus {
  if (flowStatus === 'success') return 'success';
  if (flowStatus === 'running') return 'loading';
  // 'error' falls back to 'idle': the setup panel's AnalysisErrorPanel already shows the failure
  // prominently (spec 2.6), so the inspector just waits rather than repeating it a second time.
  return 'idle';
}

/**
 * The inspector (spec 3.4): farm summary or cell detail, backed by the shared analysis flow and
 * cell selection. Exports a PNG of the map once `MapActionsBridge` (in the map slot) has supplied
 * `mapActions` through the workspace context; results and map are sibling slots (ARCHITECTURE.md).
 * Also hosts session history (spec 3.4, Phase 7): a dialog listing the last 10 runs, and the
 * banner shown while one of them is on screen instead of the live result.
 */
export function InspectorSlot() {
  const {
    flow,
    farm,
    layer,
    response,
    cells,
    selection,
    mapActions,
    historyEntries,
    isHistoryLoading,
    historyView,
    openHistoryEntry,
    closeHistoryView,
    clearHistory,
  } = useWorkspace();
  const { state } = flow;
  const { theme } = useTheme();
  const [historyOpen, setHistoryOpen] = useState(false);
  // Showing a saved run makes the inspector look "done" even if the live flow never ran, or
  // failed, or is still running (drawing or running a new analysis automatically returns to live,
  // see WorkspaceContext): it is a completed result either way.
  const status: ResultsStatus = historyView !== null ? 'success' : statusFor(state.status);
  const stale = historyView === null && state.status === 'success' && state.isStale;
  // A bound wrapper, not `mapActions.exportPng` directly: extracting a method as a value risks
  // losing its `this` binding (`@typescript-eslint/unbound-method`).
  const exportMapPng = mapActions === null ? undefined : () => mapActions.exportPng();

  // The HTML report: the inputs the shown result came from, and a capture of the whole farm
  // (boundary, basemap and grid) once the map has finished drawing.
  const bounds = farm === null ? undefined : farmBbox(farm);
  // The same colour key the map shows, so the report can explain the colours in its map image.
  const layerSpec = toLayerSpec(layer, getClusterOptions());
  const legendModel =
    response === undefined
      ? null
      : buildLegendModel(
          buildLegendInput(layerSpec, getLayerModel(response, layerSpec, theme), theme),
        );
  const report: ReportSource = {
    legend:
      legendModel === null
        ? null
        : {
            title: legendModel.title,
            unit: legendModel.unit,
            gradient: legendModel.gradient,
            min: legendModel.min,
            max: legendModel.max,
          },
    request:
      historyView !== null
        ? historyView.request
        : state.status === 'success'
          ? state.request
          : null,
    farm,
    captureMap:
      mapActions === null
        ? undefined
        : () => mapActions.capturePng(bounds === undefined ? {} : { bounds }),
    mapCaption: `Farm boundary and analysis grid on the basemap. Layer shown: ${
      layer.kind === 'cpi'
        ? `${clusterLabel(layer.cluster)} (CPI score)`
        : getMetric(layer.metric).fullName
    }.`,
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-md font-semibold text-fg">Results</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setHistoryOpen(true);
          }}
        >
          History
        </Button>
      </div>

      {historyView === null ? null : (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface-muted px-3 py-2 text-base"
        >
          <span>Viewing a saved run — run a new analysis for current results.</span>
          <Button variant="secondary" size="sm" onClick={closeHistoryView}>
            Back to current
          </Button>
        </div>
      )}

      <ResultsPanel
        status={status}
        cells={cells}
        stale={stale}
        selection={selection}
        {...(response === undefined ? {} : { response })}
        {...(exportMapPng === undefined ? {} : { exportMapPng })}
        report={report}
      />

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen} title="Session history">
        <HistoryPanel
          entries={historyEntries}
          isLoading={isHistoryLoading}
          onReopen={(entry) => {
            openHistoryEntry(entry);
            setHistoryOpen(false);
          }}
          onClear={() => {
            void clearHistory();
          }}
        />
      </Dialog>
    </div>
  );
}
