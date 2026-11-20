import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Button, Drawer, IconButton, PanelRightIcon } from '@/components/ui';
import { ThemeToggle } from '../theme';
import { ShellContext, type ShellApi } from './ShellContext';
import { useMediaQuery } from './use-media-query';

export interface AppShellProps {
  /** API health indicator. */
  readonly healthSlot?: ReactNode;
  /** User menu. */
  readonly userSlot?: ReactNode;
  /** 360px setup and run panel. */
  readonly setupPanel: ReactNode;
  /** Fluid map area. It must always stay visible. */
  readonly map: ReactNode;
  /** 380px inspector: farm summary or selected cell. */
  readonly inspector: ReactNode;
}

/** Spec 3.2: below this width the app still works, but the inspector becomes an overlay. */
export const WIDE_QUERY = '(min-width: 1280px)';

function DesktopNotice({
  visible,
  onDismiss,
}: {
  readonly visible: boolean;
  readonly onDismiss: () => void;
}) {
  // The live region always exists, so screen readers announce the text when it appears.
  return (
    <div role="status">
      {visible ? (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-accent-subtle px-4 py-2 text-base text-fg">
          <p>Best on a desktop screen. Some panels open as overlays on narrow windows.</p>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Three-panel workspace (spec 3.2): 56px top bar, 360px setup panel, fluid map, collapsible 380px
 * inspector. It holds no feature logic; features arrive through the typed slots.
 */
export function AppShell({ healthSlot, userSlot, setupPanel, map, inspector }: AppShellProps) {
  const isWide = useMediaQuery(WIDE_QUERY, true);
  // Two states so resizing never pops a drawer open, or hides a panel the user left open.
  const [wideOpen, setWideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const inspectorOpen = isWide ? wideOpen : drawerOpen;
  const setOpen = useCallback(
    (open: boolean) => {
      if (isWide) setWideOpen(open);
      else setDrawerOpen(open);
    },
    [isWide],
  );

  const api = useMemo<ShellApi>(
    () => ({
      isWide,
      inspectorOpen,
      openInspector: () => {
        setOpen(true);
      },
      closeInspector: () => {
        setOpen(false);
      },
      toggleInspector: () => {
        setOpen(!inspectorOpen);
      },
    }),
    [isWide, inspectorOpen, setOpen],
  );

  return (
    <ShellContext.Provider value={api}>
      <div className="flex h-dvh flex-col bg-bg text-fg">
        <a
          href="#map"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to map
        </a>

        <header className="flex h-[var(--topbar-height)] shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <h1 className="text-md font-semibold">Farmland Insights</h1>
          <div className="flex-1" />
          {healthSlot}
          {userSlot}
          <ThemeToggle />
          <IconButton
            label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
            icon={<PanelRightIcon />}
            aria-expanded={inspectorOpen}
            aria-controls="inspector-panel"
            onClick={api.toggleInspector}
          />
        </header>

        <DesktopNotice
          visible={!isWide && !noticeDismissed}
          onDismiss={() => {
            setNoticeDismissed(true);
          }}
        />

        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Setup"
            className="w-[var(--setup-width)] shrink-0 overflow-y-auto border-r border-border bg-surface"
          >
            {setupPanel}
          </aside>
          <main id="map" aria-label="Map" className="relative min-w-0 flex-1 bg-surface-muted">
            {map}
          </main>
          {isWide ? (
            <aside
              id="inspector-panel"
              aria-label="Inspector"
              hidden={!wideOpen}
              className="w-[var(--inspector-width)] shrink-0 overflow-y-auto border-l border-border bg-surface"
            >
              {inspector}
            </aside>
          ) : null}
        </div>

        {isWide ? null : (
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Inspector">
            {inspector}
          </Drawer>
        )}
      </div>
    </ShellContext.Provider>
  );
}
