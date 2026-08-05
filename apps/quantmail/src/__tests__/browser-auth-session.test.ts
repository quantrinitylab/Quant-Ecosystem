// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserAuthSession,
  cleanupLegacyBrowserTokens,
  LEGACY_TOKEN_KEYS,
} from '../services/browser-auth-session';

const authResponse = (
  data: { accessToken: string; expiresIn: number; tokenType?: string },
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
      '/auth/login',
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
      '/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );

    releaseRefresh(authResponse({ accessToken: 'access-rotated', expiresIn: 900 }));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(browserAuthSession.getAccessToken()).toBe('access-rotated');
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/auth/refresh');

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
      '/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});
