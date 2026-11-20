import { act, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import type * as MapFeature from '@/features/map';
import type {
  DrawControlProps,
  GridOverlayProps,
  LayerSwitcherProps,
  MapActions,
  MapViewProps,
} from '@/features/map';
import type * as AnalysisSetupFeature from '@/features/analysis-setup';
import { useWorkspace } from './WorkspaceContext';
import { makeCell } from '@/features/results/test-support';
import { fakeMapActions, renderInWorkspaceWithTheme, sampleFarm } from './test-support';
import { MapSlot } from './MapSlot';

let lastMapViewProps: MapViewProps | null = null;
let lastDrawControlProps: DrawControlProps | null = null;
let lastGridOverlayProps: GridOverlayProps | null = null;
let lastLayerSwitcherProps: LayerSwitcherProps | null = null;
const unproject = vi.fn(({ x, y }: { x: number; y: number }): [number, number] => [x, y]);
const actions: MapActions = fakeMapActions({ unproject });

vi.mock('@/features/map', async (importOriginal) => {
  const actual = await importOriginal<typeof MapFeature>();
  return {
    ...actual,
    MapViewLazy: (props: MapViewProps) => {
      lastMapViewProps = props;
      return <div data-testid="map-view">{props.children}</div>;
    },
    DrawControlLazy: (props: DrawControlProps) => {
      lastDrawControlProps = props;
      return <div data-testid="draw-control" />;
    },
    GridOverlay: (props: GridOverlayProps) => {
      lastGridOverlayProps = props;
      return <div data-testid="grid-overlay" />;
    },
    LayerSwitcher: (props: LayerSwitcherProps) => {
      lastLayerSwitcherProps = props;
      return <div data-testid="layer-switcher" />;
    },
    Legend: () => <div data-testid="legend" />,
    HoverTooltip: () => <div data-testid="hover-tooltip" />,
    useMapActions: () => actions,
  };
});

vi.mock('@/features/analysis-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof AnalysisSetupFeature>();
  return {
    ...actual,
    RunningOverlay: () => <div data-testid="running-overlay" />,
  };
});

function HoverProbe() {
  const { hover } = useWorkspace();
  return (
    <span data-testid="hover">{hover === null ? 'no-hover' : `cell:${String(hover.id)}`}</span>
  );
}

function MapActionsProbe() {
  const { mapActions } = useWorkspace();
  return <span data-testid="probe-actions">{mapActions === null ? 'none' : 'present'}</span>;
}

/** Shows a saved run, which gives the workspace a result (and the farm) without calling the API. */
function OpenSavedRun() {
  const { openHistoryEntry } = useWorkspace();
  useEffect(() => {
    openHistoryEntry({
      id: 'run-1',
      savedAt: 1,
      request: {
        farm_geojson: sampleFarm(),
        start_date: '2024-01-01',
        end_date: '2024-01-07',
        crop_category: 'cereals_c3_temperate',
        grid_size: 50,
      },
      response: {
        type: 'FeatureCollection',
        features: [
          makeCell('7', { metrics: { ndvi: 0.31 }, cpi: { Structural: 0.3 } }),
          makeCell('8', { metrics: { ndvi: 0.6 }, cpi: { Structural: 0.7 } }),
        ],
      },
    });
  }, [openHistoryEntry]);
  return null;
}

function SetFarmOnMount() {
  const { setFarm } = useWorkspace();
  useEffect(() => {
    setFarm(sampleFarm());
  }, [setFarm]);
  return null;
}

describe('MapSlot', () => {
  it('fits the map to no bounds until a farm exists', () => {
    renderInWorkspaceWithTheme(<MapSlot />);
    expect(lastMapViewProps?.fieldBounds).toBeNull();
  });

  it("fits the map to the farm's bounding box once one exists", () => {
    renderInWorkspaceWithTheme(
      <>
        <SetFarmOnMount />
        <MapSlot />
      </>,
    );
    expect(lastMapViewProps?.fieldBounds).not.toBeNull();
    expect(lastMapViewProps?.fieldBounds).toHaveLength(4);
  });

  it('forwards the shared farm and locked state to the draw control', () => {
    renderInWorkspaceWithTheme(<MapSlot />);
    expect(lastDrawControlProps?.value).toBeNull();
    expect(lastDrawControlProps?.disabled).toBe(false);
  });

  it('ignores a null drawing (an in-progress edit), never clearing the shared farm', () => {
    renderInWorkspaceWithTheme(
      <>
        <SetFarmOnMount />
        <MapSlot />
      </>,
    );
    act(() => {
      lastDrawControlProps?.onChange?.(null);
    });
    // The farm is unchanged: still non-null, so the map still has bounds.
    expect(lastMapViewProps?.fieldBounds).not.toBeNull();
  });

  it('shares the hover state set by the grid overlay with the rest of the workspace', () => {
    renderInWorkspaceWithTheme(
      <>
        <MapSlot />
        <HoverProbe />
      </>,
    );
    expect(screen.getByTestId('hover')).toHaveTextContent('no-hover');

    act(() => {
      lastGridOverlayProps?.onHover?.({
        id: '7',
        point: { x: 1, y: 2 },
        cell: { gridId: '7', value: null, noData: true },
      });
    });

    expect(screen.getByTestId('hover')).toHaveTextContent('cell:7');
  });

  it("shares the layer switcher's change with the rest of the workspace", () => {
    renderInWorkspaceWithTheme(<MapSlot />);
    expect(lastLayerSwitcherProps?.value).toEqual({ kind: 'cpi', cluster: 'Structural' });

    act(() => {
      lastLayerSwitcherProps?.onChange({ kind: 'cpi', cluster: 'Chlorophyll' });
    });

    expect(lastLayerSwitcherProps?.value).toEqual({ kind: 'cpi', cluster: 'Chlorophyll' });
  });

  it('pushes the map actions bridge actions up into the shared workspace context', () => {
    renderInWorkspaceWithTheme(
      <>
        <MapSlot />
        <MapActionsProbe />
      </>,
    );
    expect(screen.getByTestId('probe-actions')).toHaveTextContent('present');
  });

  it('shows no running overlay while idle', () => {
    renderInWorkspaceWithTheme(<MapSlot />);
    expect(screen.queryByTestId('running-overlay')).not.toBeInTheDocument();
  });

  describe('cell details popup', () => {
    const mountWithResult = () =>
      renderInWorkspaceWithTheme(
        <>
          <OpenSavedRun />
          <MapSlot />
        </>,
      );

    it('opens beside the clicked cell, showing its details', () => {
      mountWithResult();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      act(() => {
        lastGridOverlayProps?.onSelect?.('7', { x: 120, y: 80 });
      });

      const dialog = screen.getByRole('dialog', { name: 'Details for cell 7' });
      expect(dialog).toHaveTextContent('Needs attention');
      expect(unproject).toHaveBeenCalledWith({ x: 120, y: 80 });
    });

    it('moves to another cell when a different one is clicked', () => {
      mountWithResult();
      act(() => {
        lastGridOverlayProps?.onSelect?.('7', { x: 1, y: 1 });
      });
      act(() => {
        lastGridOverlayProps?.onSelect?.('8', { x: 2, y: 2 });
      });
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('dialog', { name: 'Details for cell 8' })).toBeInTheDocument();
    });

    it('closes from its close button and clears the selection', () => {
      mountWithResult();
      act(() => {
        lastGridOverlayProps?.onSelect?.('7', { x: 1, y: 1 });
      });
      act(() => {
        screen.getByRole('button', { name: 'Close cell details' }).click();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(lastGridOverlayProps?.selectedId).toBeNull();
    });

    it('does not open for a cell that is not in the result', () => {
      mountWithResult();
      act(() => {
        lastGridOverlayProps?.onSelect?.('999', { x: 1, y: 1 });
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
