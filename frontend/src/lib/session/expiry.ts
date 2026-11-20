/** Show the "session expires soon" prompt this long before the token runs out. */
export const EXPIRY_WARNING_MS = 5 * 60_000;

/** `setTimeout` stores its delay in 32 bits; longer delays fire immediately. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function msUntilExpiry(expiresAt: number, now: number = Date.now()): number {
  return Math.max(0, expiresAt - now);
}

export function isExpired(expiresAt: number, now: number = Date.now()): boolean {
  return msUntilExpiry(expiresAt, now) === 0;
}

/** True while the session is still valid but within `leadMs` of expiring. */
export function shouldWarn(
  expiresAt: number,
  now: number = Date.now(),
  leadMs: number = EXPIRY_WARNING_MS,
): boolean {
  const remaining = msUntilExpiry(expiresAt, now);
  return remaining > 0 && remaining <= leadMs;
}

export interface ExpiryCallbacks {
  readonly onWarn: () => void;
  readonly onExpire: () => void;
}

/** Calls `callback` at `target` (epoch ms), re-arming when the delay exceeds the timer limit. */
function runAt(target: number, callback: () => void): () => void {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const arm = (): void => {
    const remaining = target - Date.now();
    if (remaining <= MAX_TIMEOUT_MS) {
      handle = setTimeout(callback, Math.max(0, remaining));
    } else {
      handle = setTimeout(arm, MAX_TIMEOUT_MS);
    }
  };
  arm();
  return () => {
    if (handle !== undefined) clearTimeout(handle);
  };
}

/**
 * Schedules the warning (5 minutes before) and the expiry callbacks for a session.
 * Returns a cancel function. A session already past expiry only expires; one already
 * inside the warning window warns on the next tick.
 */
export function scheduleExpiry(
  expiresAt: number,
  { onWarn, onExpire }: ExpiryCallbacks,
  leadMs: number = EXPIRY_WARNING_MS,
): () => void {
  const cancels: (() => void)[] = [];
  if (!isExpired(expiresAt)) {
    cancels.push(runAt(Math.max(expiresAt - leadMs, Date.now()), onWarn));
  }
  cancels.push(runAt(expiresAt, onExpire));
  return () => {
    for (const cancel of cancels) cancel();
  };
}
