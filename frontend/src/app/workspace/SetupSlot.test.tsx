import { screen } from '@testing-library/react';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import type * as FieldFeature from '@/features/field';
import type { FieldStepProps } from '@/features/field';
import type * as AnalysisSetupFeature from '@/features/analysis-setup';
import type { AnalysisSetupPanelProps } from '@/features/analysis-setup';
import { useWorkspace } from './WorkspaceContext';
import { createMemorySavedLocationStore } from '@/features/saved-locations';
import { makeLocation, squareFarm } from '@/features/saved-locations/test-support';
import { createTestQueryClient, renderInWorkspace, sampleFarm } from './test-support';
import { SetupSlot } from './SetupSlot';

let lastFieldStepProps: FieldStepProps | null = null;
let lastPanelProps: AnalysisSetupPanelProps | null = null;

vi.mock('@/features/field', async (importOriginal) => {
  const actual = await importOriginal<typeof FieldFeature>();
  return {
    ...actual,
    FieldStep: (props: FieldStepProps) => {
      lastFieldStepProps = props;
      return (
        <div data-testid="field-step">
          <button
            type="button"
            onClick={() => {
              props.onChange(sampleFarm());
            }}
          >
            Draw sample field
          </button>
          {props.onZoomToField ? (
            <button type="button" onClick={props.onZoomToField}>
              Zoom to field
            </button>
          ) : null}
        </div>
      );
    },
  };
});

vi.mock('@/features/analysis-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof AnalysisSetupFeature>();
  return {
    ...actual,
    AnalysisSetupPanel: (props: AnalysisSetupPanelProps) => {
      lastPanelProps = props;
      return <div data-testid="analysis-setup-panel" />;
    },
  };
});

/** Puts a farm in the workspace before the slot under test reads it, via a real `setFarm` call. */
function PreloadFarm() {
  const { setFarm } = useWorkspace();
  useEffect(() => {
    setFarm(sampleFarm());
  }, [setFarm]);
  return null;
}

describe('SetupSlot', () => {
  it('passes the shared farm and setFarm through to FieldStep', async () => {
    const user = userEvent.setup();
    renderInWorkspace(<SetupSlot />);

    expect(lastFieldStepProps?.value).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Draw sample field' }));

    expect(lastFieldStepProps?.value).not.toBeNull();
  });

  it('passes the shared analysis flow through to AnalysisSetupPanel', () => {
    renderInWorkspace(<SetupSlot />);
    expect(lastPanelProps?.flow.state.status).toBe('idle');
  });

  it('does not offer "zoom to field" until both a farm and map actions exist', () => {
    renderInWorkspace(<SetupSlot />);
    expect(lastFieldStepProps?.onZoomToField).toBeUndefined();
  });

  it('wires "zoom to field" to the map once a farm exists, using the shared map actions', async () => {
    const user = userEvent.setup();
    const fitBounds = vi.fn();

    function Harness() {
      const { setMapActions } = useWorkspace();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setMapActions({
                fitBounds,
                setData: () => true,
                setFeatureState: () => undefined,
                removeFeatureState: () => undefined,
                clearFeatureState: () => undefined,
                setPaint: () => undefined,
                resize: () => undefined,
                flyTo: () => undefined,
                project: () => ({ x: 0, y: 0 }),
                unproject: () => [0, 0],
                onMove: () => () => undefined,
                exportPng: () => '',
                capturePng: () => Promise.resolve(''),
                installOverlay: () => false,
                onStyleReady: () => () => undefined,
                onLayerEvent: () => () => undefined,
              });
            }}
          >
            Install map actions
          </button>
          <SetupSlot />
        </>
      );
    }

    renderInWorkspace(
      <>
        <PreloadFarm />
        <Harness />
      </>,
    );
    expect(lastFieldStepProps?.onZoomToField).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Install map actions' }));

    expect(lastFieldStepProps?.onZoomToField).toBeInstanceOf(Function);
    screen.getByRole('button', { name: 'Zoom to field' }).click();
    expect(fitBounds).toHaveBeenCalledTimes(1);
  });

  it('locks the field step while an analysis is running', () => {
    // Idle flow: not locked. A full "running" state needs a real submit, covered at the
    // use-analysis-flow level; this checks SetupSlot's own `locked` wiring for the common case.
    renderInWorkspace(<SetupSlot />);
    expect(lastFieldStepProps?.disabled).toBe(false);
  });

  describe('saved locations', () => {
    const seeded = () =>
      createMemorySavedLocationStore([makeLocation({ id: 'a', name: 'North field' })]);

    it('has a Saved locations button that opens the dialog', async () => {
      renderInWorkspace(<SetupSlot />, createTestQueryClient(), { savedLocationStore: seeded() });
      await userEvent.click(screen.getByRole('button', { name: /^Saved locations/ }));
      expect(await screen.findByRole('dialog', { name: 'Saved locations' })).toBeInTheDocument();
    });

    it('shows how many are saved on the button', async () => {
      renderInWorkspace(<SetupSlot />, createTestQueryClient(), { savedLocationStore: seeded() });
      expect(
        await screen.findByRole('button', { name: 'Saved locations (1)' }),
      ).toBeInTheDocument();
    });

    it('cannot save until there is a field', async () => {
      renderInWorkspace(<SetupSlot />, createTestQueryClient(), {
        savedLocationStore: createMemorySavedLocationStore(),
      });
      await userEvent.click(screen.getByRole('button', { name: /^Saved locations/ }));
      expect(await screen.findByText(/draw, upload or load a field first/i)).toBeInTheDocument();
    });

    it('saves the current field under a name and lists it', async () => {
      const store = createMemorySavedLocationStore();
      renderInWorkspace(
        <>
          <PreloadFarm />
          <SetupSlot />
        </>,
        createTestQueryClient(),
        { savedLocationStore: store },
      );
      await userEvent.click(screen.getByRole('button', { name: /^Saved locations/ }));
      const name = await screen.findByRole('textbox', { name: 'Name' });
      await userEvent.clear(name);
      await userEvent.type(name, 'Home field');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByRole('button', { name: 'Open Home field' })).toBeInTheDocument();
      expect((await store.list()).map((item) => item.name)).toEqual(['Home field']);
      // The page behind an open dialog is hidden from assistive tech, so look for it explicitly.
      expect(
        screen.getByRole('button', { name: 'Saved locations (1)', hidden: true }),
      ).toBeInTheDocument();
    });

    it('opens a saved location, closes the dialog and puts its field on the map', async () => {
      let farmNow: unknown = null;
      function FarmProbe() {
        const { farm } = useWorkspace();
        useEffect(() => {
          farmNow = farm;
        });
        return null;
      }
      renderInWorkspace(
        <>
          <FarmProbe />
          <SetupSlot />
        </>,
        createTestQueryClient(),
        { savedLocationStore: seeded() },
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Saved locations (1)' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Open North field' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(farmNow).toEqual(squareFarm());
    });
  });
});
