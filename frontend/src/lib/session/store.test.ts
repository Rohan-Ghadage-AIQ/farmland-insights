import { describe, expect, it, vi } from 'vitest';
import { createSafeStorage } from './storage';
import { createSessionStore, SESSION_STORAGE_KEY, type SessionEvent } from './store';

const MIN = 60_000;

const tokenResponse = {
  user_id: 'u_1',
  email: 'farmer@example.com',
  access_token: 'tok-abc',
  token_type: 'bearer',
  expires_in_minutes: 480,
} as const;

function setup(now = 1_000_000) {
  const clock = { now };
  const backend = window.sessionStorage;
  backend.clear();
  const storage = createSafeStorage(backend);
  const store = createSessionStore({ storage, now: () => clock.now });
  return { store, clock, backend, storage };
}

describe('session store', () => {
  it('starts signed out', () => {
    const { store } = setup();

    expect(store.getSession()).toBeNull();
    expect(store.getToken()).toBeUndefined();
  });

  it('stores a token response with a computed expiresAt', () => {
    const { store } = setup(1_000_000);

    const session = store.setSession(tokenResponse);

    expect(session).toEqual({
      userId: 'u_1',
      email: 'farmer@example.com',
      accessToken: 'tok-abc',
      expiresAt: 1_000_000 + 480 * MIN,
    });
    expect(store.getSession()).toBe(session);
    expect(store.getToken()).toBe('tok-abc');
  });

  it('persists to sessionStorage (never localStorage) and survives a reload', () => {
    const { store, backend, clock } = setup();
    store.setSession(tokenResponse);

    expect(backend.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    const reloaded = createSessionStore({
      storage: createSafeStorage(backend),
      now: () => clock.now,
    });
    expect(reloaded.getToken()).toBe('tok-abc');
    expect(reloaded.getSession()?.expiresAt).toBe(clock.now + 480 * MIN);
  });

  it('does not restore an expired session and clears the stale entry', () => {
    const { store, backend, clock } = setup();
    store.setSession(tokenResponse);
    clock.now += 481 * MIN;

    const reloaded = createSessionStore({
      storage: createSafeStorage(backend),
      now: () => clock.now,
    });

    expect(reloaded.getSession()).toBeNull();
    expect(backend.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['not JSON', '{oops'],
    ['wrong shape', JSON.stringify({ accessToken: 5 })],
    ['null', 'null'],
    [
      'a non-finite expiry',
      JSON.stringify({ userId: 'u', email: 'e', accessToken: 't', expiresAt: 'soon' }),
    ],
  ])('ignores and removes a corrupt stored session (%s)', (_label, raw) => {
    const { backend, clock } = setup();
    backend.setItem(SESSION_STORAGE_KEY, raw);

    const store = createSessionStore({ storage: createSafeStorage(backend), now: () => clock.now });

    expect(store.getSession()).toBeNull();
    expect(backend.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('does not hand out a token that has expired locally', () => {
    const { store, clock } = setup();
    store.setSession(tokenResponse);

    clock.now += 480 * MIN;

    expect(store.getToken()).toBeUndefined();
  });

  it('works entirely in memory when sessionStorage is unusable', () => {
    const storage = createSafeStorage(undefined);
    const store = createSessionStore({ storage, now: () => 0 });

    store.setSession(tokenResponse);

    expect(store.getToken()).toBe('tok-abc');
  });

  describe('signOut', () => {
    it('clears memory and storage, notifies subscribers and emits "signed-out"', () => {
      const { store, backend } = setup();
      store.setSession(tokenResponse);
      const listener = vi.fn();
      const events: SessionEvent[] = [];
      store.subscribe(listener);
      store.onEvent((event) => events.push(event));

      store.signOut();

      expect(store.getSession()).toBeNull();
      expect(backend.getItem(SESSION_STORAGE_KEY)).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(events).toEqual([{ type: 'signed-out' }]);
    });

    it('is a quiet no-op when already signed out', () => {
      const { store } = setup();
      const listener = vi.fn();
      const onEvent = vi.fn();
      store.subscribe(listener);
      store.onEvent(onEvent);

      store.signOut();

      expect(listener).not.toHaveBeenCalled();
      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  describe('handleAuthFailure (401/403)', () => {
    it('clears the session and emits an "expired" event with reason "unauthorized"', () => {
      const { store, backend } = setup();
      store.setSession(tokenResponse);
      const events: SessionEvent[] = [];
      store.onEvent((event) => events.push(event));

      store.handleAuthFailure();

      expect(store.getSession()).toBeNull();
      expect(backend.getItem(SESSION_STORAGE_KEY)).toBeNull();
      expect(events).toEqual([{ type: 'expired', reason: 'unauthorized' }]);
    });

    it('emits once even if several in-flight requests fail with 401', () => {
      const { store } = setup();
      store.setSession(tokenResponse);
      const onEvent = vi.fn();
      store.onEvent(onEvent);

      store.handleAuthFailure();
      store.handleAuthFailure();
      store.handleAuthFailure();

      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    it('does nothing when there is no session to invalidate', () => {
      const { store } = setup();
      const onEvent = vi.fn();
      store.onEvent(onEvent);

      store.handleAuthFailure();

      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  describe('expire (timer)', () => {
    it('clears and emits "expired" with reason "timer"', () => {
      const { store } = setup();
      store.setSession(tokenResponse);
      const events: SessionEvent[] = [];
      store.onEvent((event) => events.push(event));

      store.expire();

      expect(store.getSession()).toBeNull();
      expect(events).toEqual([{ type: 'expired', reason: 'timer' }]);
    });
  });

  describe('subscribe', () => {
    it('notifies on sign-in, and stops after unsubscribe', () => {
      const { store } = setup();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.setSession(tokenResponse);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      store.signOut();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('replaces the snapshot on renewal so React sees a change', () => {
      const { store } = setup();
      const first = store.setSession(tokenResponse);

      const second = store.setSession({ ...tokenResponse, access_token: 'tok-new' });

      expect(second).not.toBe(first);
      expect(store.getToken()).toBe('tok-new');
    });

    it('keeps notifying other listeners when one throws', () => {
      const { store } = setup();
      const good = vi.fn();
      store.subscribe(() => {
        throw new Error('listener bug');
      });
      store.subscribe(good);

      store.setSession(tokenResponse);

      expect(good).toHaveBeenCalledTimes(1);
    });

    it('stops delivering events after unsubscribe', () => {
      const { store } = setup();
      store.setSession(tokenResponse);
      const onEvent = vi.fn();
      const off = store.onEvent(onEvent);

      off();
      store.signOut();

      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  it('never writes the token anywhere except the one storage key', () => {
    const { store, backend } = setup();

    store.setSession(tokenResponse);

    const keys = Array.from({ length: backend.length }, (_, i) => backend.key(i));
    expect(keys).toEqual([SESSION_STORAGE_KEY]);
    expect(window.localStorage.length).toBe(0);
  });
});
