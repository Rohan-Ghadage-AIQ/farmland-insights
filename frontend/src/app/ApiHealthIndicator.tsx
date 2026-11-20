import { useHealthQuery } from '@/api/health';
import { Badge, type BadgeTone } from '@/components/ui';

export type HealthIndicatorStatus = 'checking' | 'healthy' | 'unreachable';

const PRESENTATION: Record<HealthIndicatorStatus, { text: string; tone: BadgeTone }> = {
  checking: { text: 'Checking API\u2026', tone: 'neutral' },
  // "reachable", not "healthy": /health is liveness only (BACKEND_REQUESTS.md #11) and says
  // nothing about PropelAuth or Earth Engine, which are what the user's flow actually depends on.
  healthy: { text: 'API reachable', tone: 'success' },
  unreachable: { text: 'API unreachable', tone: 'danger' },
};

/** Presentational: a status dot plus words, so the state never relies on colour alone. */
export function HealthBadge({ status }: { readonly status: HealthIndicatorStatus }) {
  const { text, tone } = PRESENTATION[status];
  return (
    <span role="status">
      <Badge tone={tone} dot>
        {text}
      </Badge>
    </span>
  );
}

/** Top-bar API health slot, polling GET /health through the shared query. */
export function ApiHealthIndicator() {
  const health = useHealthQuery();
  const status: HealthIndicatorStatus = health.isPending
    ? 'checking'
    : health.isError
      ? 'unreachable'
      : 'healthy';
  return <HealthBadge status={status} />;
}
