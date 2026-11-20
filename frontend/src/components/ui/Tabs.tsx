import * as RadixTabs from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export function Tabs({ className, ...rest }: ComponentProps<typeof RadixTabs.Root>) {
  return <RadixTabs.Root className={cn('flex flex-col gap-3', className)} {...rest} />;
}

/** Give the list an aria-label so the group has a name. */
export function TabsList({ className, ...rest }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn('inline-flex gap-1 self-start rounded-control bg-surface-muted p-1', className)}
      {...rest}
    />
  );
}

export function TabsTrigger({ className, ...rest }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'inline-flex h-7 items-center rounded-control border border-transparent px-3 text-base text-fg-muted',
        'transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-50',
        // The selected tab gets a border instead of a shadow: one elevation level only.
        'data-[state=active]:border-border-strong data-[state=active]:bg-surface data-[state=active]:text-fg',
        className,
      )}
      {...rest}
    />
  );
}

export function TabsContent({ className, ...rest }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('outline-offset-4', className)} {...rest} />;
}
