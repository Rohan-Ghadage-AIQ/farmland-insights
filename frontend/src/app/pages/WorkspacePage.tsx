import type { ReactNode } from 'react';
import { ApiHealthIndicator } from '../ApiHealthIndicator';
import { PanelErrorBoundary } from '../errors';
import { AppShell } from '../layout';
import { SlotPlaceholder } from './SlotPlaceholder';

/** What features plug into the workspace. Each slot gets its own error boundary. */
export interface WorkspaceSlots {
  readonly user?: ReactNode;
  readonly setup?: ReactNode;
  readonly map?: ReactNode;
  readonly inspector?: ReactNode;
}

export function WorkspacePage({ slots = {} }: { readonly slots?: WorkspaceSlots }) {
  return (
    <AppShell
      healthSlot={<ApiHealthIndicator />}
      userSlot={slots.user}
      setupPanel={
        <PanelErrorBoundary label="the setup panel">
          {slots.setup ?? (
            <SlotPlaceholder
              title="Setup panel"
              description="Field, crop, period and grid steps appear here."
            />
          )}
        </PanelErrorBoundary>
      }
      map={
        <PanelErrorBoundary label="the map">
          {slots.map ?? (
            <SlotPlaceholder title="Map" description="The map and the results grid appear here." />
          )}
        </PanelErrorBoundary>
      }
      inspector={
        <PanelErrorBoundary label="the inspector">
          {slots.inspector ?? (
            <SlotPlaceholder
              title="Inspector"
              description="Farm summary and cell details appear here."
            />
          )}
        </PanelErrorBoundary>
      }
    />
  );
}
