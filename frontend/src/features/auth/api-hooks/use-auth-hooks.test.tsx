import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isApiError, userMessage } from '@/api';
import { env } from '@/lib/env';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import { createWrapper } from './test-wrapper';
import { useRegisterMutation } from './use-register-mutation';
import { useRenewSessionMutation } from './use-renew-session-mutation';
import { useTokenMutation } from './use-token-mutation';
import { useWhoAmI } from './use-whoami';

const tokenBody = {
  user_id: 'u_1',
  email: 'farmer@example.com',
  access_token: 'tok-abc',
  token_type: 'bearer',
  expires_in_minutes: 480,
};

const signedIn = () => session.setSession(tokenBody);

afterEach(() => {
  session.signOut();
});

describe('useWhoAmI', () => {
  it('does not call the API while signed out', () => {
    const hits = vi.fn();
    server.use(
      http.get('*/api/v1/auth/whoami', () => {
        hits();
        return HttpResponse.json({ user_id: 'u_1' });
      }),
    );

    const { result } = renderHook(() => useWhoAmI(), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(hits).not.toHaveBeenCalled();
  });

  it('loads the current user when a session exists', async () => {
    signedIn();
    server.use(
      http.get('*/api/v1/auth/whoami', () =>
        HttpResponse.json({ user_id: 'u_1', email: 'farmer@example.com', active_org_id: null }),
      ),
    );

    const { result } = renderHook(() => useWhoAmI(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({
      user_id: 'u_1',
      email: 'farmer@example.com',
      active_org_id: null,
    });
  });

  it('ends the session on a 401 and tells the router through a session event', async () => {
    signedIn();
    const hits = vi.fn();
    const events: unknown[] = [];
    const off = session.onEvent((event) => events.push(event));
    server.use(
      http.get('*/api/v1/auth/whoami', () => {
        hits();
        return HttpResponse.json({ detail: 'expired' }, { status: 401 });
      }),
    );
    renderHook(() => useWhoAmI(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(session.getSession()).toBeNull();
    });
    off();

    // The query is keyed by user, so once the session ends the hook moves off that query
    // (its cached error is not shown to a signed-out screen); the event carries the news.
    expect(events).toEqual([{ type: 'expired', reason: 'unauthorized' }]);
    expect(hits).toHaveBeenCalledTimes(1);
  });

  it('surfaces a non-auth failure as a typed ApiError', async () => {
    signedIn();
    server.use(
      http.get('*/api/v1/auth/whoami', () => HttpResponse.json({ detail: 'x' }, { status: 429 })),
    );
    const { result } = renderHook(() => useWhoAmI(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(isApiError(result.current.error) && result.current.error.kind).toBe('rateLimited');
    expect(session.getSession()).not.toBeNull();
  });

  it('stops querying once the session ends', async () => {
    signedIn();
    server.use(http.get('*/api/v1/auth/whoami', () => HttpResponse.json({ user_id: 'u_1' })));
    const { result } = renderHook(() => useWhoAmI(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    act(() => {
      session.signOut();
    });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('idle');
    });
  });
});

describe('useRegisterMutation', () => {
  it('registers, stores the session with the computed expiry, and exposes the response', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/register', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(tokenBody);
      }),
    );
    const { result } = renderHook(() => useRegisterMutation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ email: 'farmer@example.com', password: 'pw' });
    });

    expect(body).toEqual({
      email: 'farmer@example.com',
      password: 'pw',
      duration_in_minutes: env.tokenTtlMinutes,
    });
    expect(session.getToken()).toBe('tok-abc');
    const stored = session.getSession();
    expect(stored?.expiresAt).toBeGreaterThan(Date.now() + 479 * 60_000);
  });

  it('lets the caller choose the token lifetime', async () => {
    let body: { duration_in_minutes?: number } = {};
    server.use(
      http.post('*/api/v1/auth/register', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(tokenBody);
      }),
    );
    const { result } = renderHook(() => useRegisterMutation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ email: 'a@b.co', password: 'pw', durationInMinutes: 60 });
    });

    expect(body.duration_in_minutes).toBe(60);
  });

  it('keeps the user signed out and exposes field errors on a 400', async () => {
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ detail: { email: ['Email already in use'] } }, { status: 400 }),
      ),
    );
    const { result } = renderHook(() => useRegisterMutation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ email: 'a@b.co', password: 'pw' }).catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    const error = result.current.error;
    expect(error?.kind === 'domain' && error.fieldErrors).toEqual({
      email: 'Email already in use',
    });
    expect(session.getSession()).toBeNull();
  });

  it('surfaces a rate limit with plain-language copy', async () => {
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ detail: 'slow' }, { status: 429 }),
      ),
    );
    const { result } = renderHook(() => useRegisterMutation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ email: 'a@b.co', password: 'pw' }).catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.error?.kind).toBe('rateLimited');
    });
    expect(result.current.error && userMessage(result.current.error)).toMatch(/too many requests/i);
  });
});

describe('useTokenMutation (dev sign-in)', () => {
  it('requests a token for the email and stores the session', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/token', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(tokenBody);
      }),
    );
    const { result } = renderHook(() => useTokenMutation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ email: 'farmer@example.com' });
    });

    expect(body).toEqual({
      email: 'farmer@example.com',
      duration_in_minutes: env.tokenTtlMinutes,
    });
    expect(session.getToken()).toBe('tok-abc');
  });

  it('exposes "User not found." as a notFound error without signing in', async () => {
    server.use(
      http.post('*/api/v1/auth/token', () =>
        HttpResponse.json({ detail: 'User not found.' }, { status: 404 }),
      ),
    );
    const { result } = renderHook(() => useTokenMutation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ email: 'x@y.co' }).catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.error?.kind).toBe('notFound');
    });
    expect(session.getSession()).toBeNull();
  });
});

describe('useRenewSessionMutation ("Stay signed in")', () => {
  it('re-issues a token for the signed-in email and replaces the session', async () => {
    signedIn();
    let body: { email?: string } = {};
    server.use(
      http.post('*/api/v1/auth/token', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ...tokenBody, access_token: 'tok-renewed' });
      }),
    );
    const { result } = renderHook(() => useRenewSessionMutation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(body.email).toBe('farmer@example.com');
    expect(session.getToken()).toBe('tok-renewed');
  });

  it('fails with an auth error, without any request, when there is no session', async () => {
    const hits = vi.fn();
    server.use(
      http.post('*/api/v1/auth/token', () => {
        hits();
        return HttpResponse.json(tokenBody);
      }),
    );
    const { result } = renderHook(() => useRenewSessionMutation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.error?.kind).toBe('auth');
    });
    expect(hits).not.toHaveBeenCalled();
  });
});
