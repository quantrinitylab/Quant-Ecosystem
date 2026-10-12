// ============================================================================
// QuantAI — auth proxy cookie-filter regression tests (F-202)
// ============================================================================
//
// The POST /auth/[action] proxy must NEVER forward the browser's raw Cookie
// header to the identity backend. The identity service only ever reads
// quantmail_refresh (rotation on /refresh, revocation on /logout); login and
// register read no cookies at all. These tests pin that contract:
//   - only quantmail_refresh crosses for refresh/logout,
//   - nothing crosses for login/register,
//   - JS-set QuantAI cookies (e.g. quant_access_token) never leak upstream.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, buildForwardedCookieHeader } from '../app/auth/[action]/route';

const REFRESH = 'r3fr3sh-t0k3n';
const ACCESS = 'js-set-access-token';

function requestFor(
  action: string,
  cookieHeader: string | null,
  body = '',
): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookieHeader !== null) headers.set('cookie', cookieHeader);
  return new NextRequest(`http://localhost/auth/${action}`, {
    method: 'POST',
    headers,
    body,
  });
}

function jsonFetchMock(status = 200, payload: unknown = { success: true }) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function forwardedCookieHeader(fetchMock: ReturnType<typeof jsonFetchMock>): string | null {
  const init = fetchMock.mock.calls[0]?.[1] as { headers?: Headers } | undefined;
  const headers = init?.headers;
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get('cookie');
  return (headers as Record<string, string>)['cookie'] ?? null;
}

describe('buildForwardedCookieHeader', () => {
  it('extracts only quantmail_refresh from a multi-cookie header', () => {
    expect(
      buildForwardedCookieHeader(
        `quant_access_token=${ACCESS}; quantmail_refresh=${REFRESH}; theme=dark`,
      ),
    ).toBe(`quantmail_refresh=${REFRESH}`);
  });

  it('returns null for null or empty headers', () => {
    expect(buildForwardedCookieHeader(null)).toBeNull();
    expect(buildForwardedCookieHeader('')).toBeNull();
  });

  it('returns null when the refresh cookie is absent', () => {
    expect(buildForwardedCookieHeader(`quant_access_token=${ACCESS}; theme=dark`)).toBeNull();
  });

  it('ignores malformed pairs and empty values', () => {
    expect(buildForwardedCookieHeader('quantmail_refresh=; quantmail_refresh2=x')).toBeNull();
    expect(buildForwardedCookieHeader('no-equals-here; quantmail_refresh=')).toBeNull();
  });

  it('does not match lookalike names', () => {
    expect(buildForwardedCookieHeader(`xquantmail_refresh=${REFRESH}`)).toBeNull();
    expect(buildForwardedCookieHeader(`quantmail_refresh2=${REFRESH}`)).toBeNull();
    // Cookie names are case-sensitive: a case-variant is a different cookie.
    expect(buildForwardedCookieHeader(`Quantmail_Refresh=${REFRESH}`)).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    expect(
      buildForwardedCookieHeader(`  quant_access_token=${ACCESS} ;  quantmail_refresh=${REFRESH}  `),
    ).toBe(`quantmail_refresh=${REFRESH}`);
  });
});

describe('POST /auth/[action] cookie forwarding', () => {
  let fetchMock: ReturnType<typeof jsonFetchMock>;

  beforeEach(() => {
    fetchMock = jsonFetchMock();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refresh forwards ONLY quantmail_refresh, never JS-set cookies', async () => {
    const res = await POST(
      requestFor('refresh', `quant_access_token=${ACCESS}; quantmail_refresh=${REFRESH}; theme=dark`),
      { params: Promise.resolve({ action: 'refresh' }) },
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forwardedCookieHeader(fetchMock)).toBe(`quantmail_refresh=${REFRESH}`);
  });

  it('logout forwards ONLY quantmail_refresh', async () => {
    await POST(
      requestFor('logout', `quant_access_token=${ACCESS}; quantmail_refresh=${REFRESH}`),
      { params: Promise.resolve({ action: 'logout' }) },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forwardedCookieHeader(fetchMock)).toBe(`quantmail_refresh=${REFRESH}`);
  });

  it('login sends NO Cookie header upstream even when the browser sends cookies', async () => {
    await POST(
      requestFor('login', `quant_access_token=${ACCESS}; quantmail_refresh=${REFRESH}`, '{"email":"a@b.c"}'),
      { params: Promise.resolve({ action: 'login' }) },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forwardedCookieHeader(fetchMock)).toBeNull();
  });

  it('register sends NO Cookie header upstream', async () => {
    await POST(
      requestFor('register', `quant_access_token=${ACCESS}; quantmail_refresh=${REFRESH}`, '{}'),
      { params: Promise.resolve({ action: 'register' }) },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forwardedCookieHeader(fetchMock)).toBeNull();
  });

  it('refresh without any cookie returns NO_SESSION without calling the backend', async () => {
    const res = await POST(requestFor('refresh', null), {
      params: Promise.resolve({ action: 'refresh' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'NO_SESSION' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refresh with cookies but no refresh cookie returns NO_SESSION without calling the backend', async () => {
    const res = await POST(requestFor('refresh', `quant_access_token=${ACCESS}; theme=dark`), {
      params: Promise.resolve({ action: 'refresh' }),
    });
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'NO_SESSION' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logout without a refresh cookie still calls the backend (no cookie header)', async () => {
    const res = await POST(requestFor('logout', null), {
      params: Promise.resolve({ action: 'logout' }),
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forwardedCookieHeader(fetchMock)).toBeNull();
  });

  it('rejects unknown actions', async () => {
    const res = await POST(requestFor('2fa', `quantmail_refresh=${REFRESH}`), {
      params: Promise.resolve({ action: '2fa' }),
    });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('relays backend Set-Cookie while still not forwarding the browser cookies', async () => {
    const backend = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'quantmail_refresh=new-token; Path=/auth; HttpOnly',
          },
        }),
    );
    vi.stubGlobal('fetch', backend);
    const res = await POST(
      requestFor('refresh', `quant_access_token=${ACCESS}; quantmail_refresh=${REFRESH}`),
      { params: Promise.resolve({ action: 'refresh' }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('quantmail_refresh=new-token');
    expect(forwardedCookieHeader(backend)).toBe(`quantmail_refresh=${REFRESH}`);
  });

  it('returns AUTH_BACKEND_INVALID_RESPONSE on non-JSON backend output', async () => {
    const html = vi.fn(async () => new Response('<html>nope</html>', { status: 200 }));
    vi.stubGlobal('fetch', html);
    const res = await POST(requestFor('refresh', `quantmail_refresh=${REFRESH}`), {
      params: Promise.resolve({ action: 'refresh' }),
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: { code: 'AUTH_BACKEND_INVALID_RESPONSE' },
    });
  });

  it('returns AUTH_BACKEND_UNAVAILABLE when the identity service is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const res = await POST(requestFor('login', null, '{}'), {
      params: Promise.resolve({ action: 'login' }),
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: { code: 'AUTH_BACKEND_UNAVAILABLE' },
    });
  });

  it('relays a backend 500 status without crashing', async () => {
    const failing = jsonFetchMock(500, { success: false, error: { code: 'INTERNAL' } });
    vi.stubGlobal('fetch', failing);
    const res = await POST(requestFor('refresh', `quantmail_refresh=${REFRESH}`), {
      params: Promise.resolve({ action: 'refresh' }),
    });
    expect(res.status).toBe(500);
  });
});
