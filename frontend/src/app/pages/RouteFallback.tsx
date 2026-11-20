import { Skeleton } from '@/components/ui';

/** Shown while a lazily loaded route (such as the map bundle) is still arriving. */
export function RouteFallback() {
  return (
    <div role="status" className="flex min-h-screen flex-col gap-3 bg-bg p-6">
      <span className="sr-only">Loading</span>
      <Skeleton height={32} width={240} />
      <Skeleton lines={3} />
    </div>
  );
}
