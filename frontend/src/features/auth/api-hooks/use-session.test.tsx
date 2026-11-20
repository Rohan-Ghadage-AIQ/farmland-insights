import { renderHook, act } from '@testing-library/react';
import { type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import { useSession } from './use-session';
import { useSessionExpiry } from './use-session-expiry';
import { useSignOut } from './use-sign-out';
import { createTestQueryClient, createWrapper } from './test-wrapper';

const MIN = 60_000;
const grant = (minutes = 480) => ({
  user_id: 'u_1',
  email: 'farmer@example.com',
  access_token: 'tok-abc',
  expires_in_minutes: minutes,
});

afterEach(() => {
  session.signOut();
});

describe('useSession', () => {
  it('reflects sign-in and sign-out without a reload', () => {
    const { result } = renderHook(() => useSession());
    expect(result.current).toBeNull();

    act(() => {
      session.setSession(grant());
    });
    expect(result.current?.email).toBe('farmer@example.com');

    act(() => {
      session.signOut();
    });
    expect(result.current).toBeNull();
  });
});

describe('useSignOut', () => {
  it('ends the session and wipes the query cache so farm data does not outlive it', () => {
    const client: QueryClient = createTestQueryClient();
    client.setQueryData(['analysis'], { secret: 'farm data' });
    session.setSession(grant());
    const { result } = renderHook(() => useSignOut(), { wrapper: createWrapper(client) });

    act(() => {
      result.current();
    });

    expect(session.getSession()).toBeNull();
    expect(client.getQueryData(['analysis'])).toBeUndefined();
  });
});

describe('useSessionExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags "expiring soon" 5 minutes before expiry, then ends the session at expiry', () => {
    session.setSession(grant(30));
    const { result } = renderHook(() => useSessionExpiry());
    expect(result.current.expiringSoon).toBe(false);

    act(() => {
      vi.advanceTimersByTime(25 * MIN);
    });
    expect(result.current.expiringSoon).toBe(true);
    expect(session.getSession()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(5 * MIN);
    });
    expect(session.getSession()).toBeNull();
  });

  it('resets the warning when the token is renewed', () => {
    session.setSession(grant(30));
    const { result } = renderHook(() => useSessionExpiry());
    act(() => {
      vi.advanceTimersByTime(26 * MIN);
    });
    expect(result.current.expiringSoon).toBe(true);

    act(() => {
      session.setSession(grant(480));
    });

    expect(result.current.expiringSoon).toBe(false);
    act(() => {
      vi.advanceTimersByTime(30 * MIN);
    });
    expect(session.getSession()).not.toBeNull();
  });

  it('does nothing while signed out, and cleans up its timers on unmount', () => {
    const { result, unmount } = renderHook(() => useSessionExpiry());
    expect(result.current.expiringSoon).toBe(false);
    unmount();

    session.setSession(grant(1));
    const second = renderHook(() => useSessionExpiry());
    second.unmount();
    act(() => {
      vi.advanceTimersByTime(5 * MIN);
    });

    // The unmounted hook must not expire the session behind the app's back.
    expect(session.getSession()).not.toBeNull();
  });
});
