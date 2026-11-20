import { EmptyState } from '@/components/ui';

/** Clearly labelled stand-in for a panel a feature has not filled yet. */
export function SlotPlaceholder({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <EmptyState title={title} description={description} headingLevel={2} />
    </div>
  );
}
