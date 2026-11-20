import * as RadixDialog from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { CloseIcon } from './icons';

export interface ModalSurfaceProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Required: it is the dialog's accessible name. */
  readonly title: string;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  /** Actions, usually right-aligned buttons. */
  readonly footer?: ReactNode;
}

interface InternalProps extends ModalSurfaceProps {
  readonly panelClassName: string;
  readonly side?: 'left' | 'right';
}

/** Shared modal behaviour for Dialog and Drawer: focus trap, Escape, scrim, close button. */
export function ModalSurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  panelClassName,
  side,
}: InternalProps) {
  // Radix only returns focus to a <Dialog.Trigger>. Ours are opened from anywhere (a toolbar
  // button, a keyboard shortcut), so remember the opener ourselves and give focus back to it.
  const opener = useRef<HTMLElement | null>(null);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fi-fade-in fixed inset-0 z-40 bg-overlay" />
        <RadixDialog.Content
          {...(side ? { 'data-side': side } : {})}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className={cn(
            'fixed z-50 flex flex-col gap-4 border border-border bg-surface p-4 shadow-float',
            panelClassName,
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <RadixDialog.Title className="text-md font-semibold text-fg">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton label="Close" size="sm" tooltip={false} icon={<CloseIcon />} />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="-mt-2 text-base text-fg-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
