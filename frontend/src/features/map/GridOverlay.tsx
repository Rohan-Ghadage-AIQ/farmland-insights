import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { getNoDataPattern, renderNoDataPattern } from './color-scales';
import type { CellValue } from './grid-source';
import { createHoverTracker, type CellId } from './hover-tracker';
import { getEmptyLayerModel, getLayerModel } from './layer-model';
import {
  FARM_SOURCE_ID,
  FARM_SOURCE_SPEC,
  GRID_SOURCE_ID,
  GRID_SOURCE_SPEC,
  LAYER_IDS,
  buildFillColor,
  buildGridLayers,
  farmToGeoJson,
} from './layers';
import { useMapActions } from './map-context';
import type { CellPointerEvent, OverlaySpec } from './map-actions';
import type { AnalysisResponse, FarmFeatureCollection, LayerSpec, Theme } from './types';

export interface HoverInfo {
  readonly id: CellId;
  /** Pixel position inside the map container, for placing the tooltip. */
  readonly point: { readonly x: number; readonly y: number };
  readonly cell: CellValue;
}

export interface GridOverlayProps {
  readonly response: AnalysisResponse | null;
  readonly layer: LayerSpec | null;
  readonly theme: Theme;
  /** The farm boundary (drawn, uploaded or pasted). */
  readonly farm?: FarmFeatureCollection | null;
  readonly selectedId?: CellId | null;
  /** Cells to emphasise, e.g. "applies to N of M cells" for an advisory. */
  readonly highlightIds?: readonly CellId[];
  readonly onHover?: (info: HoverInfo | null) => void;
  /** `point` is where the click landed, in pixels inside the map container. */
  readonly onSelect?: (id: CellId, point: { readonly x: number; readonly y: number }) => void;
}

const NO_IDS: readonly CellId[] = [];

type FlagKey = 'selected' | 'highlight';

/** Flags currently set on the map, so a prop change only touches the cells that changed. */
interface AppliedState {
  selected: Map<string, CellId>;
  highlight: Map<string, CellId>;
}

const freshApplied = (): AppliedState => ({ selected: new Map(), highlight: new Map() });

/**
 * Connects the pure layer builders to the map: installs sources and layers once (and again after
 * a basemap change), pushes data only when it changed, and applies hover, selection and
 * highlights as feature-state. Renders nothing.
 */
export function GridOverlay({
  response,
  layer,
  theme,
  farm = null,
  selectedId = null,
  highlightIds = NO_IDS,
  onHover,
  onSelect,
}: GridOverlayProps) {
  const actions = useMapActions();

  const model = useMemo(
    () =>
      response !== null && layer !== null
        ? getLayerModel(response, layer, theme)
        : getEmptyLayerModel(theme),
    [response, layer, theme],
  );

  const overlay = useMemo<OverlaySpec>(() => {
    const pattern = getNoDataPattern(theme);
    return {
      sources: { [GRID_SOURCE_ID]: GRID_SOURCE_SPEC, [FARM_SOURCE_ID]: FARM_SOURCE_SPEC },
      images: [{ id: pattern.id, image: renderNoDataPattern(pattern) }],
      layers: buildGridLayers({ theme, scale: model.scale, domain: model.domain }),
    };
  }, [theme, model.scale, model.domain]);

  const applied = useRef<AppliedState>(freshApplied());
  const pushed = useRef<{ grid: unknown; farm: unknown }>({ grid: null, farm: null });

  // 1. Install layers and push data. Order 0, so it runs before the state applier below.
  useEffect(
    () =>
      actions.onStyleReady(() => {
        const installed = actions.installOverlay(overlay);
        if (installed) pushed.current = { grid: null, farm: null };
        actions.setPaint(
          LAYER_IDS.gridFill,
          'fill-color',
          buildFillColor(model.scale, model.domain),
        );

        if (pushed.current.grid !== model.data) {
          actions.setData(GRID_SOURCE_ID, model.data.geojson);
          // A new analysis replaces the cells: old feature-state must not leak onto new ones.
          if (!installed) actions.clearFeatureState(GRID_SOURCE_ID);
          applied.current = freshApplied();
          pushed.current = { ...pushed.current, grid: model.data };
        }
        if (pushed.current.farm !== farm) {
          actions.setData(FARM_SOURCE_ID, farmToGeoJson(farm));
          pushed.current = { ...pushed.current, farm };
        }
      }, 0),
    [actions, overlay, model, farm],
  );

  // 2. Selection and highlight feature-state. Order 1: after the sources exist.
  useEffect(
    () =>
      actions.onStyleReady(() => {
        const sync = (key: FlagKey, wanted: readonly CellId[]): void => {
          const current = applied.current[key];
          const next = new Map<string, CellId>();
          for (const id of wanted) {
            // Use the id exactly as the source carries it, so 3 and "3" cannot diverge.
            const cell = model.data.byId.get(String(id));
            if (cell !== undefined) next.set(String(cell.gridId), cell.gridId);
          }
          for (const [text, id] of current) {
            if (!next.has(text))
              actions.setFeatureState({ source: GRID_SOURCE_ID, id }, { [key]: false });
          }
          for (const [text, id] of next) {
            if (!current.has(text))
              actions.setFeatureState({ source: GRID_SOURCE_ID, id }, { [key]: true });
          }
          applied.current[key] = next;
        };
        sync('selected', selectedId === null ? NO_IDS : [selectedId]);
        sync('highlight', highlightIds);
      }, 1),
    [actions, model.data, selectedId, highlightIds],
  );

  // 3. Pointer events. The handlers read the latest props without re-subscribing.
  const emitHover = useEffectEvent((info: HoverInfo | null) => {
    onHover?.(info);
  });
  const emitSelect = useEffectEvent(
    (id: CellId, point: { readonly x: number; readonly y: number }) => {
      onSelect?.(id, point);
    },
  );
  const lookup = useEffectEvent((id: CellId): CellValue | undefined =>
    model.data.byId.get(String(id)),
  );

  useEffect(() => {
    const tracker = createHoverTracker((id, hovered) => {
      actions.setFeatureState({ source: GRID_SOURCE_ID, id }, { hover: hovered });
    });
    const handle = (event: CellPointerEvent): void => {
      const cell = event.type === 'mouseleave' || event.id === null ? undefined : lookup(event.id);
      if (cell === undefined) {
        tracker.move(null);
        emitHover(null);
        return;
      }
      if (event.type === 'click') {
        emitSelect(cell.gridId, event.point);
        return;
      }
      tracker.move(cell.gridId);
      emitHover({ id: cell.gridId, point: event.point, cell });
    };
    const offs = (['mousemove', 'mouseleave', 'click'] as const).map((type) =>
      actions.onLayerEvent(type, LAYER_IDS.gridHit, handle),
    );
    return () => {
      for (const off of offs) off();
    };
  }, [actions]);

  return null;
}
