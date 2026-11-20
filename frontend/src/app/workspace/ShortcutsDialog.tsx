import { Dialog } from '@/components/ui';

export interface ShortcutsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const SHORTCUTS: readonly { readonly keys: string; readonly action: string }[] = [
  { keys: 'D', action: 'Draw the field boundary' },
  { keys: 'Esc', action: 'Cancel drawing, or deselect the current cell' },
  { keys: 'Ctrl/Cmd + Enter', action: 'Run the analysis' },
  { keys: '[ / ]', action: 'Select the previous / next cell' },
  { keys: 'L', action: 'Cycle the map layer' },
  { keys: '?', action: 'Show this shortcut sheet' },
];

/** The "?" shortcut sheet (spec 3.6). Presentational: the keys it lists are handled elsewhere. */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-3 text-sm">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys} className="contents">
            <dt>
              <kbd className="rounded-control border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                {shortcut.keys}
              </kbd>
            </dt>
            <dd className="text-fg-muted">{shortcut.action}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
