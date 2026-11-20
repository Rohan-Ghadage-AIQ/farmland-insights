import { Badge } from '@/components/ui';

/**
 * Spec 3.4: "Never silently mix old results with new inputs." Spec 3.6: "Use aria-live for
 * analysis status and errors" — wrapped in a polite live region so its appearance is announced,
 * the same way the loading and running states already are.
 */
export function StaleBadge() {
  return (
    <div role="status" aria-live="polite">
      <Badge tone="warning">Inputs changed {'—'} re-run to update</Badge>
    </div>
  );
}
