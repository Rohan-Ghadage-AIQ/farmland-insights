import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import { useWorkspace, WorkspaceProvider } from './WorkspaceContext';
import { createTestQueryClient, renderInWorkspace, sampleFarm } from './test-support';
import { QueryClientProvider } from '@tanstack/react-query';

/** Reads and exposes a few `useWorkspace()` fields as text, for assertions without a real UI. */
function WorkspaceProbe() {
  const { farm, flow, layer, mapActions, selection, cells, historyEntries, historyView } =
    useWorkspace();
  return (
    <div>
      <span data-testid="farm">{farm === null ? 'no-farm' : 'has-farm'}</span>
      <span data-testid="layer">{`${layer.kind}:${layer.kind === 'cpi' ? layer.cluster : layer.metric}`}</span>
      <span data-testid="map-actions">{mapActions === null ? 'no-actions' : 'has-actions'}</span>
      <span data-testid="selected">{selection.selectedId ?? 'none'}</span>
      <span data-testid="highlights">{selection.highlightIds.join(',')}</span>
      <span data-testid="cell-count">{cells.length}</span>
      <span data-testid="history-count">{historyEntries.length}</span>
      <span data-testid="history-view">{historyView === null ? 'live' : historyView.id}</span>
      <span data-testid="can-submit">{flow.canSubmit ? 'yes' : 'no'}</span>
    </div>
  );
}

function analysisBody(cellCount = 1) {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: cellCount }, (_, index) => ({
      type: 'Feature',
      id: index,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      properties: {
        grid_id: index,
        raw_metrics: { ndvi: 0.5 },
        cpi_scores: {
          Structural: 0.5,
          Chlorophyll: 0.5,
          Water_Drought: 0.5,
          Environmental: 0.5,
          Agro_Meteo: 0.5,
        },
        advisories: {},
      },
    })),
    // The real API echoes the pass it used; without it the run is rejected as mixing every pass.
    imagery: { image_date: '2026-01-01', optical_date: '2026-01-01', radar_date: null },
  };
}

function signIn() {
  session.setSession({
    user_id: 'u_1',
    email: 'farmer@example.com',
    access_token: 'tok-abc',
    expires_in_minutes: 480,
  });
}

/** Fills every setup step with valid values, as `use-analysis-flow.test.tsx`'s `fillValidInputs` does. */
function FillFormButton() {
  const { flow, setFarm } = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => {
        setFarm(sampleFarm());
        flow.form.setValue('crop', 'Wheat', { shouldValidate: true });
        flow.form.setValue('startDate', '2026-10-01', { shouldValidate: true });
        flow.form.setValue('endDate', '2026-10-30', { shouldValidate: true });
        flow.form.setValue('gridSize', 50, { shouldValidate: true });
      }}
    >
      Fill form
    </button>
  );
}

function SubmitButton() {
  const { flow } = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => {
        void flow.submit();
      }}
    >
      Submit
    </button>
  );
}

/** Runs a real analysis to success through the real flow: fill, wait for valid, then submit. */
async function runAnalysis(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Fill form' }));
  await waitFor(() => {
    expect(screen.getByTestId('can-submit')).toHaveTextContent('yes');
  });
  await user.click(screen.getByRole('button', { name: 'Submit' }));
}

function OpenFirstHistoryEntryButton() {
  const { historyEntries, openHistoryEntry } = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => {
        const entry = historyEntries[0];
        if (entry) openHistoryEntry(entry);
      }}
    >
      Reopen first
    </button>
  );
}

function CloseHistoryViewButton() {
  const { closeHistoryView } = useWorkspace();
  return (
    <button type="button" onClick={closeHistoryView}>
      Back to current
    </button>
  );
}

function ClearHistoryButton() {
  const { clearHistory } = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => {
        void clearHistory();
      }}
    >
      Clear history
    </button>
  );
}

function SetFarmButton() {
  const { setFarm } = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => {
        setFarm(sampleFarm());
      }}
    >
      Set farm
    </button>
  );
}

function SetMapActionsButton({ actions }: { readonly actions: ReturnType<typeof vi.fn> }) {
  const { setMapActions } = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => {
        // A loosely-typed stand-in is fine here: only identity (null vs not-null) is asserted.
        setMapActions(actions as unknown as Parameters<typeof setMapActions>[0]);
      }}
    >
      Set map actions
    </button>
  );
}

function HighlightButton() {
  const { selection } = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => {
        selection.highlight(['a', 'b']);
      }}
    >
      Highlight
    </button>
  );
}

function renderConsole() {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('useWorkspace', () => {
  it('throws when used outside a WorkspaceProvider', () => {
    renderConsole();
    function Lonely() {
      useWorkspace();
      return null;
    }
    expect(() => render(<Lonely />)).toThrow(
      'useWorkspace must be used inside <WorkspaceProvider>.',
    );
  });
});

describe('WorkspaceProvider', () => {
  it('shares one farm state: setting it in one consumer is visible in a sibling', async () => {
    const user = userEvent.setup();
    renderInWorkspace(
      <>
        <SetFarmButton />
        <WorkspaceProbe />
      </>,
    );

    expect(screen.getByTestId('farm')).toHaveTextContent('no-farm');
    await user.click(screen.getByRole('button', { name: 'Set farm' }));
    expect(screen.getByTestId('farm')).toHaveTextContent('has-farm');
  });

  it('starts with no cells selected and an empty highlight set', () => {
    renderInWorkspace(<WorkspaceProbe />);
    expect(screen.getByTestId('selected')).toHaveTextContent('none');
    expect(screen.getByTestId('highlights')).toHaveTextContent('');
  });

  it('shares one selection instance: highlighting in one consumer is visible in a sibling', async () => {
    const user = userEvent.setup();
    renderInWorkspace(
      <>
        <HighlightButton />
        <WorkspaceProbe />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Highlight' }));
    expect(screen.getByTestId('highlights')).toHaveTextContent('a,b');
  });

  it('never shows a selection for a cell that is not in the current results (stale-selection guard)', async () => {
    const user = userEvent.setup();
    function SelectUnknownButton() {
      const { selection } = useWorkspace();
      return (
        <button
          type="button"
          onClick={() => {
            selection.select('not-a-real-cell');
          }}
        >
          Select unknown
        </button>
      );
    }
    renderInWorkspace(
      <>
        <SelectUnknownButton />
        <WorkspaceProbe />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Select unknown' }));
    // No analysis has run, so there are no real cells: any id must be filtered back to "none".
    expect(screen.getByTestId('selected')).toHaveTextContent('none');
  });

  it('shares the map actions set by one consumer (e.g. the map slot) with a sibling (e.g. the inspector)', async () => {
    const user = userEvent.setup();
    const actions = vi.fn();
    renderInWorkspace(
      <>
        <SetMapActionsButton actions={actions} />
        <WorkspaceProbe />
      </>,
    );

    expect(screen.getByTestId('map-actions')).toHaveTextContent('no-actions');
    await user.click(screen.getByRole('button', { name: 'Set map actions' }));
    expect(screen.getByTestId('map-actions')).toHaveTextContent('has-actions');
  });

  it('defaults to the CPI/Structural layer', () => {
    renderInWorkspace(<WorkspaceProbe />);
    expect(screen.getByTestId('layer')).toHaveTextContent('cpi:Structural');
  });

  it('cycles the map layer with the "L" shortcut', () => {
    renderInWorkspace(<WorkspaceProbe />);
    const before = screen.getByTestId('layer').textContent;

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    });

    expect(screen.getByTestId('layer').textContent).not.toBe(before);
  });

  it('does not cycle the layer when a modifier key is held (reserved for other shortcuts)', () => {
    renderInWorkspace(<WorkspaceProbe />);
    const before = screen.getByTestId('layer').textContent;

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true }),
      );
    });

    expect(screen.getByTestId('layer').textContent).toBe(before);
  });

  it('does not cycle the layer while typing in a field', () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <WorkspaceProvider>
          <input aria-label="Some field" />
          <WorkspaceProbe />
        </WorkspaceProvider>
      </QueryClientProvider>,
    );
    const before = screen.getByTestId('layer').textContent;
    const input = screen.getByRole('textbox', { name: 'Some field' });
    input.focus();

    fireEvent.keyDown(input, { key: 'l' });

    expect(screen.getByTestId('layer').textContent).toBe(before);
  });

  it('opens the shortcuts dialog with "?"', () => {
    renderInWorkspace(<WorkspaceProbe />);
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  describe('session history', () => {
    it('records a successful run and shows its cells live', async () => {
      signIn();
      server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody(2))));
      const user = userEvent.setup();
      renderInWorkspace(
        <>
          <FillFormButton />
          <SubmitButton />
          <WorkspaceProbe />
        </>,
      );

      await runAnalysis(user);

      await waitFor(() => {
        expect(screen.getByTestId('cell-count')).toHaveTextContent('2');
      });
      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('1');
      });
      expect(screen.getByTestId('history-view')).toHaveTextContent('live');
      session.signOut();
    });

    it('reopens a saved run (its cells show without re-running), then returns to the live result', async () => {
      signIn();
      server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody(2))));
      const user = userEvent.setup();
      renderInWorkspace(
        <>
          <FillFormButton />
          <SubmitButton />
          <OpenFirstHistoryEntryButton />
          <CloseHistoryViewButton />
          <WorkspaceProbe />
        </>,
      );

      await runAnalysis(user);
      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('1');
      });

      await user.click(screen.getByRole('button', { name: 'Reopen first' }));
      expect(screen.getByTestId('history-view')).not.toHaveTextContent('live');
      expect(screen.getByTestId('cell-count')).toHaveTextContent('2');

      await user.click(screen.getByRole('button', { name: 'Back to current' }));
      expect(screen.getByTestId('history-view')).toHaveTextContent('live');
      session.signOut();
    });

    it('clears every saved run', async () => {
      signIn();
      server.use(http.post('*/api/v1/analyze', () => HttpResponse.json(analysisBody(1))));
      const user = userEvent.setup();
      renderInWorkspace(
        <>
          <FillFormButton />
          <SubmitButton />
          <ClearHistoryButton />
          <WorkspaceProbe />
        </>,
      );

      await runAnalysis(user);
      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('1');
      });

      await user.click(screen.getByRole('button', { name: 'Clear history' }));
      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('0');
      });
      session.signOut();
    });
  });
});
