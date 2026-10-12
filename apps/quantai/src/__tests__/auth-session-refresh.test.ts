import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAuthToken,
  clearAuthSession,
} from '../lib/auth';
import {
  authSession,
  getAccessToken,
  clearAccessToken,
  ingestSSOToken,
} from '../services/auth-session';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetchOnce(res: Response | Error): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      res instanceof Error ? Promise.reject(res) : Promise.resolve(res),
    ),
  );
}

describe('authSession.refresh — F-203 (no stale-token resurrection)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAccessToken();
    clearAuthSession();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    clearAccessToken();
    clearAuthSession();
  });

  it('returns the genuine failure and clears ALL local token material on server-side revocation', async () => {
    // Session fully established before revocation (memory + localStorage + cookie)
    ingestSSOToken('jwt-dead-access-111', {
      id: 'usr_1',
      email: 'member@quantmail.in',
      name: 'Quant Member',
    });
    expect(getAccessToken()).toBe('jwt-dead-access-111');
    expect(getAuthToken()).toBe('jwt-dead-access-111');

    // Server revoked the refresh cookie: 401, no token
    mockFetchOnce(
      jsonResponse(
        {
          success: false,
          error: { code: 'REFRESH_REVOKED', message: 'Refresh token revoked.' },
        },
        401,
      ),
    );

    const result = await authSession.refresh();

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('REFRESH_REVOKED');
    // In-memory module token, lib/auth memory cache, every localStorage key, cookie
    expect(getAccessToken()).toBeNull();
    expect(getAuthToken()).toBeNull();
    expect(localStorage.getItem('quant_access_token')).toBeNull();
    expect(localStorage.getItem('quant_auth_token')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('quant_token')).toBeNull();
    expect(document.cookie).not.toContain('quant_access_token=jwt-dead-access-111');
  });

  it('a network error during rotation fails closed instead of resurrecting the stale token', async () => {
    localStorage.setItem('quant_access_token', 'jwt-stale-222');

    mockFetchOnce(new Error('Network error'));

    const result = await authSession.refresh();

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NETWORK');
    expect(getAccessToken()).toBeNull();
    expect(getAuthToken()).toBeNull();
    expect(localStorage.getItem('quant_access_token')).toBeNull();
  });

  it('a malformed (non-JSON) server response is treated as refresh failure and clears the session', async () => {
    localStorage.setItem('quant_access_token', 'jwt-stale-333');

    mockFetchOnce(new Response('not-json{{{', { status: 200 }));

    const result = await authSession.refresh();

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_RESPONSE');
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('quant_access_token')).toBeNull();
  });

  it('success-without-token (NO_SESSION) reports failure and clears the stale local token', async () => {
    localStorage.setItem('quant_access_token', 'jwt-stale-444');

    mockFetchOnce(jsonResponse({ success: true, data: {} }));

    const result = await authSession.refresh();

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NO_SESSION');
    expect(getAccessToken()).toBeNull();
    expect(getAuthToken()).toBeNull();
    expect(localStorage.getItem('quant_access_token')).toBeNull();
  });

  it('success path still hydrates the fresh token and persists the user profile', async () => {
    mockFetchOnce(
      jsonResponse({
        success: true,
        data: {
          accessToken: 'jwt-fresh-555',
          user: {
            id: 'usr_1',
            email: 'member@quantmail.in',
            displayName: 'Quant Member',
          },
        },
      }),
    );

    const result = await authSession.refresh();

    expect(result.success).toBe(true);
    expect(result.data?.accessToken).toBe('jwt-fresh-555');
    expect(getAccessToken()).toBe('jwt-fresh-555');
    expect(getAuthToken()).toBe('jwt-fresh-555');
    expect(localStorage.getItem('quant_access_token')).toBe('jwt-fresh-555');
  });
});
