// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserAuthSession,
  cleanupLegacyBrowserTokens,
  LEGACY_TOKEN_KEYS,
} from '../services/browser-auth-session';

const authResponse = (
  data: {
    accessToken: string;
    expiresIn: number;
    tokenType?: string;
    user?: { id: string; email: string; username: string; displayName: string; role: string };
  },
  status = 200,
): Response =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const failedAuthResponse = (status = 401): Response =>
  new Response(
    JSON.stringify({
      success: false,
      error: { code: 'INVALID_REFRESH_SESSION', message: 'Invalid session.', statusCode: status },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );

const makeStorage = () => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(() => null),
  length: 0,
});

describe('browserAuthSession', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let localStorage: ReturnType<typeof makeStorage>;
  let sessionStorage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    browserAuthSession.clearAccessToken();
    fetchMock = vi.fn();
    localStorage = makeStorage();
    sessionStorage = makeStorage();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { localStorage, sessionStorage });
  });

  afterEach(() => {
    browserAuthSession.clearAccessToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps login access credentials in memory and includes browser cookies', async () => {
    fetchMock.mockResolvedValueOnce(
      authResponse({ accessToken: 'access-login', expiresIn: 900, tokenType: 'Bearer' }),
    );

    const result = await browserAuthSession.login('user@quantmail.in', 'password');

    expect(result.success).toBe(true);
    expect(browserAuthSession.getAccessToken()).toBe('access-login');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'user@quantmail.in', password: 'password' }),
      }),
    );
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it('removes every historical token key from both browser stores', () => {
    cleanupLegacyBrowserTokens();

    for (const key of LEGACY_TOKEN_KEYS) {
      expect(localStorage.removeItem).toHaveBeenCalledWith(key);
      expect(sessionStorage.removeItem).toHaveBeenCalledWith(key);
    }
    expect(localStorage.removeItem).toHaveBeenCalledTimes(LEGACY_TOKEN_KEYS.length);
    expect(sessionStorage.removeItem).toHaveBeenCalledTimes(LEGACY_TOKEN_KEYS.length);
  });

  it('collapses concurrent cookie refreshes into one network rotation', async () => {
    let releaseRefresh!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          releaseRefresh = resolve;
        }),
    );

    const first = browserAuthSession.refresh();
    const second = browserAuthSession.refresh();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );

    releaseRefresh(authResponse({ accessToken: 'access-rotated', expiresIn: 900 }));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(browserAuthSession.getAccessToken()).toBe('access-rotated');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the inline user on refresh so hydration skips the profile round trip', async () => {
    // fix/qm-api-roundtrip-latency: POST /api/auth/refresh now carries the
    // profile inline (same shape as GET /oauth/userinfo). The session layer
    // must pass it through untouched — the auth provider consumes it instead
    // of firing a second sequential fetch.
    const inlineUser = {
      id: 'user-1',
      email: 'ada@quantmail.in',
      username: 'ada',
      displayName: 'Ada Lovelace',
      role: 'user',
    };
    fetchMock.mockResolvedValueOnce(
      authResponse({ accessToken: 'access-rotated', expiresIn: 900, user: inlineUser }),
    );

    const result = await browserAuthSession.refresh();

    expect(result.success).toBe(true);
    expect(result.data?.user).toEqual(inlineUser);
    expect(browserAuthSession.getAccessToken()).toBe('access-rotated');
  });

  it('leaves user undefined on refresh when the backend omits it (older deploys)', async () => {
    fetchMock.mockResolvedValueOnce(authResponse({ accessToken: 'access-rotated', expiresIn: 900 }));

    const result = await browserAuthSession.refresh();

    expect(result.success).toBe(true);
    expect(result.data?.user).toBeUndefined();
    expect(browserAuthSession.getAccessToken()).toBe('access-rotated');
  });

  it('surfaces the inline user on login so sign-in skips the profile round trip', async () => {
    const inlineUser = {
      id: 'user-1',
      email: 'ada@quantmail.in',
      username: 'ada',
      displayName: 'Ada Lovelace',
      role: 'user',
    };
    fetchMock.mockResolvedValueOnce(
      authResponse({ accessToken: 'access-login', expiresIn: 900, user: inlineUser }),
    );

    const result = await browserAuthSession.login('ada@quantmail.in', 's3cret');

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ user: inlineUser });
    expect(browserAuthSession.getAccessToken()).toBe('access-login');
  });

  it('performs only one refresh and one request retry after a 401', async () => {
    fetchMock.mockResolvedValueOnce(authResponse({ accessToken: 'access-old', expiresIn: 900 }));
    await browserAuthSession.login('user@quantmail.in', 'password');
    fetchMock.mockReset();

    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(authResponse({ accessToken: 'access-new', expiresIn: 900 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    const response = await browserAuthSession.authenticatedFetch('/api/emails');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/refresh');

    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const retryRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(new Headers(firstRequest.headers).get('Authorization')).toBe('Bearer access-old');
    expect(new Headers(retryRequest.headers).get('Authorization')).toBe('Bearer access-new');
    expect(firstRequest.credentials).toBe('include');
    expect(retryRequest.credentials).toBe('include');
  });

  it('returns the original 401 and clears memory when cookie refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(authResponse({ accessToken: 'access-old', expiresIn: 900 }));
    await browserAuthSession.login('user@quantmail.in', 'password');
    fetchMock.mockReset();

    const originalUnauthorized = new Response(null, { status: 401 });
    fetchMock
      .mockResolvedValueOnce(originalUnauthorized)
      .mockResolvedValueOnce(failedAuthResponse());

    const response = await browserAuthSession.authenticatedFetch('/api/emails');

    expect(response).toBe(originalUnauthorized);
    expect(browserAuthSession.getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears memory even when logout cannot reach the server', async () => {
    fetchMock.mockResolvedValueOnce(authResponse({ accessToken: 'access-old', expiresIn: 900 }));
    await browserAuthSession.login('user@quantmail.in', 'password');
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    await browserAuthSession.logout();

    expect(browserAuthSession.getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('purges the legacy unscoped recent-search key on logout but keeps v2 keys', async () => {
    // qm-search-history-scope: the pre-fix shared key is not attributable
    // to any account, so logout must drop it; the account-scoped v2 key
    // partitions safely and survives for the account's own next sign-in.
    const storageKeys = ['quantmail_recent_searches', 'quantmail_searches.v2.user-1'];
    localStorage.length = storageKeys.length;
    localStorage.key = vi.fn((i: number) => storageKeys[i] ?? null);

    fetchMock.mockResolvedValueOnce(authResponse({ accessToken: 'access-old', expiresIn: 900 }));
    await browserAuthSession.login('user@quantmail.in', 'password');
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    await browserAuthSession.logout();

    expect(localStorage.removeItem).toHaveBeenCalledWith('quantmail_recent_searches');
    expect(localStorage.removeItem).not.toHaveBeenCalledWith('quantmail_searches.v2.user-1');
  });

  it('purges the legacy unscoped contact-rename key on logout but keeps v2 keys', async () => {
    // qm-contact-names-scope: the pre-fix shared key is not attributable
    // to any account, so logout must drop it; the account-scoped v2 key
    // partitions safely and survives for the account's own next sign-in.
    const storageKeys = ['quantmail_contact_names', 'quantmail_contact_names.v2.user-1'];
    localStorage.length = storageKeys.length;
    localStorage.key = vi.fn((i: number) => storageKeys[i] ?? null);

    fetchMock.mockResolvedValueOnce(authResponse({ accessToken: 'access-old', expiresIn: 900 }));
    await browserAuthSession.login('user@quantmail.in', 'password');
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    await browserAuthSession.logout();

    expect(localStorage.removeItem).toHaveBeenCalledWith('quantmail_contact_names');
    expect(localStorage.removeItem).not.toHaveBeenCalledWith(
      'quantmail_contact_names.v2.user-1',
    );
  });

  it('purges the legacy unscoped booking-links key on logout but keeps v2 keys', async () => {
    // qm-booking-links-scope: the pre-fix shared key is not attributable
    // to any account, so logout must drop it; the account-scoped v2 key
    // partitions safely and survives for the account's own next sign-in.
    const storageKeys = ['quant_calendar_booking_links', 'quant_calendar_booking_links.v2.user-1'];
    localStorage.length = storageKeys.length;
    localStorage.key = vi.fn((i: number) => storageKeys[i] ?? null);

    fetchMock.mockResolvedValueOnce(authResponse({ accessToken: 'access-old', expiresIn: 900 }));
    await browserAuthSession.login('user@quantmail.in', 'password');
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    await browserAuthSession.logout();

    expect(localStorage.removeItem).toHaveBeenCalledWith('quant_calendar_booking_links');
    expect(localStorage.removeItem).not.toHaveBeenCalledWith('quant_calendar_booking_links.v2.user-1');
  });

  it('aborts a hung request after the global timeout', async () => {
    vi.useFakeTimers();
    try {
      // Never-resolving fetch: simulates a backend that hangs forever.
      fetchMock.mockImplementation(
        (_input: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
            });
          }),
      );

      const promise = browserAuthSession.authenticatedFetch('/api/emails');
      // Attach the rejection handler BEFORE advancing timers, so the abort
      // rejection is never momentarily unhandled.
      const assertion = expect(promise).rejects.toThrow(/timed out/i);
      // Advance past the 30s timeout.
      await vi.advanceTimersByTimeAsync(31_000);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('honors the caller signal: caller abort wins without waiting for timeout', async () => {
    const caller = new AbortController();
    fetchMock.mockImplementation(
      (_input: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const promise = browserAuthSession.authenticatedFetch('/api/emails', {
      signal: caller.signal,
    });
    caller.abort(new Error('cancelled by caller'));

    await expect(promise).rejects.toThrow(/cancelled by caller/);
  });

  it('times out a hung login instead of hanging forever', async () => {
    vi.useFakeTimers();
    try {
      // Never-resolving fetch: simulates an auth backend that hangs forever.
      fetchMock.mockImplementation(
        (_input: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
            });
          }),
      );

      const promise = browserAuthSession.login('user@example.com', 'password');
      // Advance past the 30s timeout; post() converts the abort into a
      // resolved TIMEOUT error rather than a rejection.
      await vi.advanceTimersByTimeAsync(31_000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.error?.message).toMatch(/timed out/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes an abort signal on auth posts and returns fast responses unchanged', async () => {
    fetchMock.mockResolvedValueOnce(
      authResponse({ accessToken: 'access-login', expiresIn: 900, tokenType: 'Bearer' }),
    );

    const result = await browserAuthSession.login('user@example.com', 'password');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('routes browser auth through the /api/auth proxy by default, never bare /auth/*', async () => {
    // Regression lock for the 2026-10-12 login outage: with NEXT_PUBLIC_AUTH_URL
    // unset, the client used to POST to /auth/login, which the edge middleware
    // 307-redirects to the login HTML page (not a public path, no session
    // cookie) — the JSON check then failed with "invalid response" and nobody
    // could sign in from a browser. /api/* is matcher-excluded from the
    // middleware, so the proxy routes are the only safe default. Re-import the
    // module with a clean env so the default (not a leaked test value) is
    // what the assertion exercises.
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_AUTH_URL;
    const fresh = await import('../services/browser-auth-session');
    fetchMock.mockResolvedValueOnce(
      authResponse({ accessToken: 'access-login', expiresIn: 900, tokenType: 'Bearer' }),
    );

    await fresh.browserAuthSession.login('user@example.com', 'password');

    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toBe('/api/auth/login');
    expect(calledUrl).not.toMatch(/^\/auth\//);
  });

  it('routes the 2FA second leg through /api/auth/2fa/verify (P0 regression lock)', async () => {
    // CODEX-REVIEW P0 on PR #1032: completeTwoFactor posted to /auth/2fa/verify
    // while the client base moved to /api, so the second leg would 404.
    // The contract is: the client ALWAYS hits the /api/auth proxy path, and a
    // route file MUST exist there (asserted by the proxy test importing it).
    fetchMock.mockResolvedValueOnce(
      authResponse({ accessToken: 'access-after-2fa', expiresIn: 900, tokenType: 'Bearer' }),
    );

    await browserAuthSession.completeTwoFactor('signed-challenge', '123456');

    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toBe('/api/auth/2fa/verify');
    expect(calledUrl).not.toMatch(/^\/auth\//);
  });

  it('requests 2FA recovery through /api/auth/2fa/recover with the email', async () => {
    // fix/qm-2fa-challenge-recovery-link: the lost-authenticator panel's
    // request leg must hit the real recovery endpoint via the /api proxy.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { message: 'neutral copy' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await browserAuthSession.requestTwoFactorRecovery('user@quantmail.in');

    expect(result.success).toBe(true);
    expect(result.data?.message).toBe('neutral copy');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/2fa/recover',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'user@quantmail.in' }),
      }),
    );
  });

  it('confirms 2FA recovery through /api/auth/2fa/recover/confirm and surfaces backend errors honestly', async () => {
    // The confirm leg disables 2FA with password + code and issues no
    // session: rememberAccess must NOT store anything from it.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_RECOVERY_CODE', message: 'That code was not accepted.', statusCode: 400 },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await browserAuthSession.confirmTwoFactorRecovery(
      'user@quantmail.in',
      'correct-horse',
      '123456',
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_RECOVERY_CODE');
    expect(result.error?.message).toBe('That code was not accepted.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/2fa/recover/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@quantmail.in', password: 'correct-horse', code: '123456' }),
      }),
    );
    expect(browserAuthSession.getAccessToken()).toBeNull();
  });
});
