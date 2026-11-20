import { CLUSTERS, METRIC_KEYS, getMetric, metricsInCluster } from '@/domain';
import type { ClusterOption, MetricOption } from './types';

/**
 * Adapters from the metric dictionary in `src/domain` to the props the layer picker takes. The map
 * components stay prop-driven (easy to test with small fixtures); this is the one place that knows
 * the real dictionary.
 */

const CLUSTER_OPTIONS: readonly ClusterOption[] = CLUSTERS.map(({ key, label }) => ({
  key,
  label,
  metricKeys: metricsInCluster(key),
}));

const METRIC_OPTIONS: readonly MetricOption[] = METRIC_KEYS.map((key) => {
  const meta = getMetric(key);
  return {
    key,
    label: meta.label,
    // The picker uses an empty string for "no unit"; the domain uses null.
    unit: meta.unit ?? '',
    cluster: meta.cluster,
    scope: meta.scope,
    decimals: meta.decimals,
  };
});

/** All five clusters, in domain order. The same array every call. */
export function getClusterOptions(): readonly ClusterOption[] {
  return CLUSTER_OPTIONS;
}

/** Every metric in the domain dictionary. The same array every call. */
export function getMetricOptions(): readonly MetricOption[] {
  return METRIC_OPTIONS;
}
