import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { FarmAnalysisResponse, FarmFeatureCollection, GridAnalysisFeature } from '@/domain';
import { useAnalysisFlow, type UseAnalysisFlowResult } from '@/features/analysis-setup';
import { useSessionHistory, type HistoryEntry } from '@/features/history';
import {
  cycleLayer,
  getClusterOptions,
  getMetricOptions,
  type HoverInfo,
  type LayerSelection,
  type MapActions,
} from '@/features/map';
import { useCellSelection, type UseCellSelectionResult } from '@/features/results';
import {
  noSessionStore,
  useSavedLocations,
  type SavedLocation,
  type SavedLocationStore,
  type SessionStore,
} from '@/features/saved-locations';
import { ShortcutsDialog } from './ShortcutsDialog';

const NO_CELLS: readonly GridAnalysisFeature[] = [];
const DEFAULT_LAYER: LayerSelection = { kind: 'cpi', cluster: 'Structural' };

export interface WorkspaceApi {
  readonly farm: FarmFeatureCollection | null;
  readonly setFarm: (farm: FarmFeatureCollection) => void;
  readonly flow: UseAnalysisFlowResult;
  /**
   * The result currently on screen: the live analysis, or a saved run while `historyView` is set.
   * `cells` is its features, or an empty, stable array before either exists.
   */
  readonly response: FarmAnalysisResponse | undefined;
  readonly cells: readonly GridAnalysisFeature[];
  /** One selection, shared by the map's `GridOverlay` and the inspector (ARCHITECTURE.md state table). */
  readonly selection: UseCellSelectionResult;
  readonly layer: LayerSelection;
  readonly setLayer: (layer: LayerSelection) => void;
  readonly hover: HoverInfo | null;
  readonly setHover: (hover: HoverInfo | null) => void;
  /** The map's imperative actions, supplied once `<MapView>` exists (see `MapActionsBridge`). */
  readonly mapActions: MapActions | null;
  readonly setMapActions: (actions: MapActions | null) => void;
  /** Session history (spec 3.4, Phase 7): the last 10 runs, newest first. */
  readonly historyEntries: readonly HistoryEntry[];
  readonly isHistoryLoading: boolean;
  /** The saved run currently shown in place of the live result, or `null` while showing it live. */
  readonly historyView: HistoryEntry | null;
  /** Shows a saved run's farm and results again, without re-running the analysis. */
  readonly openHistoryEntry: (entry: HistoryEntry) => void;
  readonly closeHistoryView: () => void;
  readonly clearHistory: () => Promise<void>;
  /** Named locations kept on this device (field, settings and results), newest first. */
  readonly savedLocations: readonly SavedLocation[];
  readonly isSavedLocationsLoading: boolean;
  /** Saves the current field and settings (and results, if shown) under `name`. */
  readonly saveLocation: (name: string) => Promise<void>;
  /** Restores a saved location: its field, settings and, if it has them, its results. */
  readonly openSavedLocation: (location: SavedLocation) => void;
  readonly deleteSavedLocation: (id: string) => Promise<void>;
}

export interface WorkspaceProviderProps {
  readonly children: ReactNode;
  /**
   * Where the last working session is remembered, so the field and settings come back when the app
   * reopens. Defaults to remembering nothing (tests, previews); the real app passes localStorage.
   */
  readonly sessionStore?: SessionStore;
  /** Where saved locations are kept. Defaults to the browser's IndexedDB. */
  readonly savedLocationStore?: SavedLocationStore;
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Owns the state the three workspace slots (setup, map, inspector) share: the field boundary, the
 * analysis flow, the selected/highlighted cells and the active map layer (spec 3.2-3.4). One
 * provider wraps the whole app so each slot's element, built in the same render, can read it
 * through `useWorkspace()` even though `AppShell` renders them in separate parts of the page.
 */
export function WorkspaceProvider({
  children,
  sessionStore = noSessionStore,
  savedLocationStore,
}: WorkspaceProviderProps) {
  // The last session, read once at startup so the first render already has it.
  const [restored] = useState(() => sessionStore.load());
  const [farm, setFarm] = useState<FarmFeatureCollection | null>(restored?.farm ?? null);
  const flow = useAnalysisFlow({
    farm,
    ...(restored === null ? {} : { initialValues: restored.inputs }),
  });
  const savedLocationsApi = useSavedLocations(savedLocationStore);
  const history = useSessionHistory();
  const [historyView, setHistoryView] = useState<HistoryEntry | null>(null);

  // Starting a fresh run always means leaving behind whatever saved run was on screen. Adjusted
  // during render with a state-tracks-state comparison (the documented React pattern for
  // resetting state when something changes: react.dev/learn/you-might-not-need-an-effect), not a
  // ref and not an effect, so `response` below sees it in this very render rather than one tick
  // later.
  const [previousFlowStatus, setPreviousFlowStatus] = useState(flow.state.status);
  if (flow.state.status !== previousFlowStatus) {
    setPreviousFlowStatus(flow.state.status);
    if (flow.state.status === 'running' && historyView !== null) {
      setHistoryView(null);
    }
  }

  const liveResponse = flow.state.status === 'success' ? flow.state.data : undefined;
  const response = historyView ? historyView.response : liveResponse;
  const cells = response ? response.features : NO_CELLS;
  const selection = useCellSelection(cells);
  const [layer, setLayer] = useState<LayerSelection>(DEFAULT_LAYER);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [mapActions, setMapActions] = useState<MapActions | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openHistoryEntry = useCallback((entry: HistoryEntry) => {
    setFarm(entry.request.farm_geojson);
    setHistoryView(entry);
  }, []);
  const closeHistoryView = useCallback(() => {
    setHistoryView(null);
  }, []);
  const clearHistory = history.clear;

  // Remember the working session (field and form settings) as it changes.
  useEffect(() => {
    const persist = (): void => {
      const { crop, startDate, endDate, gridSize, imageDate } = flow.form.getValues();
      sessionStore.save({ farm, inputs: { crop, startDate, endDate, gridSize, imageDate } });
    };
    persist();
    const subscription = flow.form.watch(persist);
    return () => {
      subscription.unsubscribe();
    };
  }, [farm, flow.form, sessionStore]);

  // The result on screen (a saved run, or the live one) and the request it came from.
  const run = useMemo(() => {
    if (historyView !== null) {
      return { request: historyView.request, response: historyView.response };
    }
    return flow.state.status === 'success'
      ? { request: flow.state.request, response: flow.state.data }
      : null;
  }, [historyView, flow.state]);
  const saveLocation = useCallback(
    async (name: string): Promise<void> => {
      if (farm === null) return;
      const { crop, startDate, endDate, gridSize, imageDate } = flow.form.getValues();
      await savedLocationsApi.save({
        name,
        farm,
        inputs: { crop, startDate, endDate, gridSize, imageDate },
        run,
      });
    },
    [farm, flow.form, run, savedLocationsApi],
  );
  const openSavedLocation = useCallback(
    (location: SavedLocation) => {
      setFarm(location.farm);
      flow.form.reset({ imageDate: '', ...location.inputs });
      // Re-check the restored settings now, so an out-of-date one is flagged straight away.
      void flow.form.trigger();
      setHistoryView(
        location.run === null
          ? null
          : {
              id: location.id,
              savedAt: location.savedAt,
              request: location.run.request,
              response: location.run.response,
            },
      );
    },
    [flow.form],
  );
  const deleteSavedLocation = savedLocationsApi.remove;

  // Records each new successful run once (not on every re-render the same success produces, e.g.
  // when the form later goes stale), and never while a saved run — not a fresh one — is on screen.
  const lastSavedHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (flow.state.status !== 'success' || historyView !== null) return;
    if (lastSavedHashRef.current === flow.state.requestHash) return;
    lastSavedHashRef.current = flow.state.requestHash;
    void history.add(flow.state.request, flow.state.data);
  }, [flow.state, historyView, history]);

  // `D`, `Esc` and Ctrl/Cmd+Enter live with the components they operate (DrawControl,
  // useAnalysisFlow); `[`/`]` live with ResultsPanel. Only the shortcuts with no single owning
  // component (spec 3.6) are handled here.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'l' || event.key === 'L') {
        setLayer((current) => cycleLayer(current, getClusterOptions(), getMetricOptions()));
      } else if (event.key === '?') {
        setShortcutsOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const value = useMemo<WorkspaceApi>(
    () => ({
      farm,
      setFarm,
      flow,
      response,
      cells,
      selection,
      layer,
      setLayer,
      hover,
      setHover,
      mapActions,
      setMapActions,
      historyEntries: history.entries,
      isHistoryLoading: history.isLoading,
      historyView,
      openHistoryEntry,
      closeHistoryView,
      clearHistory,
      savedLocations: savedLocationsApi.entries,
      isSavedLocationsLoading: savedLocationsApi.isLoading,
      saveLocation,
      openSavedLocation,
      deleteSavedLocation,
    }),
    [
      farm,
      flow,
      response,
      cells,
      selection,
      layer,
      hover,
      mapActions,
      history.entries,
      history.isLoading,
      historyView,
      openHistoryEntry,
      closeHistoryView,
      clearHistory,
      savedLocationsApi.entries,
      savedLocationsApi.isLoading,
      saveLocation,
      openSavedLocation,
      deleteSavedLocation,
    ],
  );

  return (
    <WorkspaceContext value={value}>
      {children}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </WorkspaceContext>
  );
}

export function useWorkspace(): WorkspaceApi {
  const value = useContext(WorkspaceContext);
  if (value === null) {
    throw new Error('useWorkspace must be used inside <WorkspaceProvider>.');
  }
  return value;
}
