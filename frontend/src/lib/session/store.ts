import { isExpired } from './expiry';
import type { SafeStorage } from './storage';

/** The single storage key. The token lives in sessionStorage only, never localStorage. */
export const SESSION_STORAGE_KEY = 'farmland.session.v1';

export interface Session {
  readonly userId: string;
  readonly email: string;
  readonly accessToken: string;
  /** Epoch milliseconds, computed when the token was issued. */
  readonly expiresAt: number;
}

/** The fields of the backend's AuthTokenResponse that the session needs. */
export interface TokenGrant {
  readonly user_id: string;
  readonly email: string;
  readonly access_token: string;
  readonly expires_in_minutes: number;
}

/** Emitted for the router: sign-out, or the session ended (timer or a 401/403). */
export type SessionEvent =
  | { readonly type: 'signed-out' }
  | { readonly type: 'expired'; readonly reason: 'unauthorized' | 'timer' };

export interface SessionStore {
  readonly getSession: () => Session | null;
  /** The bearer token, or undefined when signed out or past its local expiry. */
  readonly getToken: () => string | undefined;
  readonly setSession: (grant: TokenGrant) => Session;
  /** User-initiated sign-out. */
  readonly signOut: () => void;
  /** A request came back 401/403: the session is invalid. Clears and emits once. */
  readonly handleAuthFailure: () => void;
  /** The expiry timer fired. */
  readonly expire: () => void;
  /** State changes, shaped for `useSyncExternalStore`. */
  readonly subscribe: (listener: () => void) => () => void;
  /** One-off events for navigation (e.g. redirect to /login). */
  readonly onEvent: (listener: (event: SessionEvent) => void) => () => void;
}

export interface SessionStoreOptions {
  readonly storage: SafeStorage;
  readonly now?: () => number;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.accessToken === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt)
  );
}

function notifyAll<T extends unknown[]>(
  listeners: ReadonlySet<(...args: T) => void>,
  ...args: T
): void {
  for (const listener of [...listeners]) {
    try {
      listener(...args);
    } catch {
      // A faulty listener must not stop the others (or leave the session half-cleared).
    }
  }
}

export function createSessionStore({
  storage,
  now = () => Date.now(),
}: SessionStoreOptions): SessionStore {
  const stateListeners = new Set<() => void>();
  const eventListeners = new Set<(event: SessionEvent) => void>();

  function load(): Session | null {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isSession(parsed) && !isExpired(parsed.expiresAt, now())) return parsed;
    } catch {
      // Corrupt entry: fall through and discard it.
    }
    storage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }

  let current = load();

  /** Clears the session; returns whether there was one. */
  function clear(): boolean {
    if (current === null) return false;
    current = null;
    storage.removeItem(SESSION_STORAGE_KEY);
    notifyAll(stateListeners);
    return true;
  }

  return {
    getSession: () => current,
    getToken: () =>
      current !== null && !isExpired(current.expiresAt, now()) ? current.accessToken : undefined,
    setSession(grant) {
      const session: Session = {
        userId: grant.user_id,
        email: grant.email,
        accessToken: grant.access_token,
        expiresAt: now() + grant.expires_in_minutes * 60_000,
      };
      current = session;
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      notifyAll(stateListeners);
      return session;
    },
    signOut() {
      if (clear()) notifyAll(eventListeners, { type: 'signed-out' });
    },
    handleAuthFailure() {
      if (clear()) notifyAll(eventListeners, { type: 'expired', reason: 'unauthorized' });
    },
    expire() {
      if (clear()) notifyAll(eventListeners, { type: 'expired', reason: 'timer' });
    },
    subscribe(listener) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
  };
}
