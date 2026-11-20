import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import type * as ResultsFeature from '@/features/results';
import type { ResultsPanelProps } from '@/features/results';
import { useWorkspace } from './WorkspaceContext';
import { fakeMapActions, renderInWorkspaceWithTheme } from './test-support';
import { InspectorSlot } from './InspectorSlot';

let lastProps: ResultsPanelProps | null = null;

vi.mock('@/features/results', async (importOriginal) => {
  const actual = await importOriginal<typeof ResultsFeature>();
  return {
    ...actual,
    ResultsPanel: (props: ResultsPanelProps) => {
      lastProps = props;
      return <div data-testid="results-panel">{props.status}</div>;
    },
  };
});

describe('InspectorSlot', () => {
  it('shows "idle" before any analysis has been submitted', () => {
    renderInWorkspaceWithTheme(<InspectorSlot />);
    expect(lastProps?.status).toBe('idle');
    expect(lastProps?.response).toBeUndefined();
    expect(lastProps?.stale).toBe(false);
  });

  it('passes the shared cells and selection through to ResultsPanel', () => {
    renderInWorkspaceWithTheme(<InspectorSlot />);
    expect(lastProps?.cells).toEqual([]);
    expect(lastProps?.selection).toBeDefined();
  });

  it('has no exportMapPng until the map slot has supplied actions', () => {
    renderInWorkspaceWithTheme(<InspectorSlot />);
    expect(lastProps?.exportMapPng).toBeUndefined();
  });

  it('offers exportMapPng, bound to the shared map actions, once the map slot supplies them', () => {
    // A standalone spy, not read back off `actions` (an interface-typed object): reading a
    // method off it would trip `@typescript-eslint/unbound-method`, same as `InspectorSlot`'s
    // own `exportMapPng` wrapper exists to avoid.
    const exportPng = vi.fn(() => 'data:image/png;base64,fake');
    const actions = fakeMapActions({ exportPng });

    function InstallMapActions() {
      const { setMapActions } = useWorkspace();
      useEffect(() => {
        setMapActions(actions);
      }, [setMapActions]);
      return null;
    }

    renderInWorkspaceWithTheme(
      <>
        <InstallMapActions />
        <InspectorSlot />
      </>,
    );

    expect(lastProps?.exportMapPng).toBeInstanceOf(Function);
    lastProps?.exportMapPng?.();
    expect(exportPng).toHaveBeenCalledTimes(1);
  });
});
