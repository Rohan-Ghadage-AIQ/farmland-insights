import { Suspense, useEffect, useState } from 'react';
import { farmBbox, gridIdOf } from '@/domain';
import { RunningOverlay } from '@/features/analysis-setup';
import {
  buildLegendModel,
  DrawControlLazy,
  getClusterOptions,
  getEmptyLayerModel,
  getLayerModel,
  getMetricOptions,
  GridOverlay,
  HoverTooltip,
  Legend,
  LayerSwitcher,
  MapViewLazy,
  toLayerSpec,
  useMapActions,
  type LngLat,
} from '@/features/map';
import { Skeleton } from '@/components/ui';
import { useTheme } from '../theme';
import { CellPopup } from './CellPopup';
import { buildHoverRows, buildLegendInput } from './layer-display';
import { useWorkspace } from './WorkspaceContext';

function MapFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <Skeleton height={320} width="100%" />
    </div>
  );
}

/**
 * Renders nothing: lives inside `<MapView>` only to push its `useMapActions()` up into the
 * workspace context, so the inspector slot (a sibling, outside the map's React context) can
 * export a PNG (see ARCHITECTURE.md: results and map are sibling AppShell slots).
 */
function MapActionsBridge() {
  const actions = useMapActions();
  const { setMapActions } = useWorkspace();
  useEffect(() => {
    setMapActions(actions);
    return () => {
      setMapActions(null);
    };
  }, [actions, setMapActions]);
  return null;
}

/**
 * The map slot (spec 3.2-3.4): the basemap and farm/grid overlay, drawing, the layer switcher and
 * legend, the hover tooltip, and the non-blocking running overlay. Code-split through
 * `MapViewLazy`/`DrawControlLazy` so MapLibre and Terra Draw stay out of the initial bundle.
 */
export function MapSlot() {
  const { theme } = useTheme();
  const {
    farm,
    setFarm,
    flow,
    response: sharedResponse,
    selection,
    layer,
    setLayer,
    hover,
    setHover,
    mapActions,
  } = useWorkspace();
  // The cell whose details popup is open, and where on the map it was clicked.
  const [popup, setPopup] = useState<{ readonly id: string; readonly lngLat: LngLat } | null>(null);
  const locked = flow.state.status === 'running';
  // `undefined` (no result yet, or no `<MapView>`-less fallback needed) reads as `null` here:
  // `GridOverlay` and `getLayerModel` use `null` for "nothing to show".
  const response = sharedResponse ?? null;

  const clusters = getClusterOptions();
  const metrics = getMetricOptions();
  const layerSpec = toLayerSpec(layer, clusters);
  const layerModel =
    response === null ? getEmptyLayerModel(theme) : getLayerModel(response, layerSpec, theme);
  const legendModel = buildLegendModel(buildLegendInput(layerSpec, layerModel, theme));
  const bounds = farm === null ? null : farmBbox(farm);
  // The popup only shows while its cell is still the selected one (closing it, or selecting
  // elsewhere, hides it), and only for a cell that exists in the result on screen.
  const popupCell =
    popup !== null && selection.selectedId === popup.id && response !== null
      ? response.features.find((cell) => String(gridIdOf(cell)) === popup.id)
      : undefined;

  return (
    <div className="relative h-full w-full">
      <Suspense fallback={<MapFallback />}>
        <MapViewLazy theme={theme} fieldBounds={bounds}>
          <MapActionsBridge />
          <Suspense fallback={null}>
            <DrawControlLazy
              value={farm}
              onChange={(next) => {
                if (next !== null) setFarm(next);
              }}
              disabled={locked}
            />
          </Suspense>
          <GridOverlay
            response={response}
            layer={layerSpec}
            theme={theme}
            farm={farm}
            selectedId={selection.selectedId}
            highlightIds={selection.highlightIds}
            onHover={setHover}
            onSelect={(id, point) => {
              selection.select(String(id));
              if (mapActions !== null) {
                setPopup({ id: String(id), lngLat: mapActions.unproject(point) });
              }
            }}
          />
          <div className="pointer-events-none absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
            <div className="pointer-events-auto">
              <LayerSwitcher
                clusters={clusters}
                metrics={metrics}
                value={layer}
                onChange={setLayer}
              />
            </div>
            <div className="pointer-events-auto">
              <Legend model={legendModel} />
            </div>
          </div>
          {popup === null || popupCell === undefined ? null : (
            <CellPopup
              cell={popupCell}
              lngLat={popup.lngLat}
              onClose={() => {
                selection.select(null);
              }}
            />
          )}
          {hover === null || (popupCell !== undefined && String(hover.id) === popup?.id) ? null : (
            <HoverTooltip
              point={hover.point}
              container={null}
              {...buildHoverRows({ layer: layerSpec, gridId: hover.id, cellValue: hover.cell })}
            />
          )}
        </MapViewLazy>
      </Suspense>

      {flow.state.status === 'running' ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <div className="pointer-events-auto">
            <RunningOverlay startedAt={flow.state.startedAt} onCancel={flow.cancel} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
