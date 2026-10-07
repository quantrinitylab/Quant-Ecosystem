// Proxy cookie plumbing: for cookie-based (HttpOnly refresh) auth to work through
// the shared proxy, the proxy must (1) forward the inbound Cookie header to the
// backend so /auth/refresh can read the refresh cookie, and (2) relay the
// backend's Set-Cookie back to the browser so login/refresh can set/rotate it.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../proxy';

function jsonBackendResponse(setCookie?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (setCookie) headers.append('set-cookie', setCookie);
  return new Response(JSON.stringify({ success: true, data: { accessToken: 't' } }), {
    status: 200,
    headers,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('proxyToBackend cookie plumbing', () => {
  it('forwards the inbound Cookie header to the backend', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonBackendResponse(),
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: { cookie: 'quantmail_refresh=old-token', 'content-type': 'application/json' },
    });

    await proxyToBackend(req, { backendUrl: 'http://backend:3010', path: '/auth/refresh' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const passedInit = fetchMock.mock.calls[0]?.[1];
    const passedHeaders = new Headers(passedInit?.headers);
    expect(passedHeaders.get('cookie')).toBe('quantmail_refresh=old-token');
  });

  it('relays the backend Set-Cookie back to the client', async () => {
    const setCookie = 'quantmail_refresh=new-token; HttpOnly; Path=/auth; SameSite=Lax';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonBackendResponse(setCookie)),
    );

    const req = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });

    const res = await proxyToBackend(req, {
      backendUrl: 'http://backend:3010',
      path: '/auth/login',
      body: { email: 'a@b.co', password: 'x' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toContain('quantmail_refresh=new-token');
  });

  it('does not set a cookie header when the backend sends none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonBackendResponse()),
    );
    const req = new NextRequest('http://localhost/api/auth/userinfo', { method: 'GET' });
    const res = await proxyToBackend(req, { backendUrl: 'http://backend:3010', path: '/auth/me' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
