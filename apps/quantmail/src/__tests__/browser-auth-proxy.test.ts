// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/auth/[action]/route';
import { GET as getUserInfo } from '../app/api/oauth/userinfo/route';

const BACKEND_URL = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';
const contextFor = (action: string) => ({ params: Promise.resolve({ action }) });

const backendJson = (body: unknown, options: ResponseInit = {}): Response => {
  const headers = new Headers(options.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), {
    ...options,
    status: options.status ?? 200,
    headers,
  });
};

describe('QuantMail same-origin browser auth proxy', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards login origin/body and preserves the hardened refresh cookie', async () => {
    const cookie =
      'quantmail_refresh=refresh-secret; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=2592000';
    fetchMock.mockResolvedValueOnce(
      backendJson(
        { success: true, data: { accessToken: 'access-token', expiresIn: 900 } },
        { headers: { 'set-cookie': cookie } },
      ),
    );
    const body = JSON.stringify({ email: 'user@quantmail.in', password: 'password' });
    const request = new NextRequest('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body,
    });

    const response = await POST(request, contextFor('login'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(new URL('/auth/login', BACKEND_URL).toString());
    expect(init.method).toBe('POST');
    expect(init.body).toBe(body);
    expect(init.cache).toBe('no-store');
    expect(init.redirect).toBe('manual');
    expect(new Headers(init.headers).get('origin')).toBe('http://localhost:3000');
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBe(cookie);
    expect(await response.json()).toEqual({
      success: true,
      data: { accessToken: 'access-token', expiresIn: 900 },
    });
  });

  it('forwards the path-scoped cookie during refresh and returns its rotation', async () => {
    const rotatedCookie =
      'quantmail_refresh=rotated-secret; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=2592000';
    fetchMock.mockResolvedValueOnce(
      backendJson(
        { success: true, data: { accessToken: 'rotated-access', expiresIn: 900 } },
        { headers: { 'set-cookie': rotatedCookie } },
      ),
    );
    const request = new NextRequest('http://localhost:3000/auth/refresh', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'quantmail_refresh=refresh-secret',
        'content-type': 'application/json',
      },
    });

    const response = await POST(request, contextFor('refresh'));

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(new URL('/auth/refresh', BACKEND_URL).toString());
    const headers = new Headers(init.headers);
    expect(headers.get('origin')).toBe('http://localhost:3000');
    expect(headers.get('cookie')).toBe('quantmail_refresh=refresh-secret');
    expect(response.headers.get('set-cookie')).toBe(rotatedCookie);
  });

  it('forwards the in-memory bearer for profile hydration', async () => {
    const user = {
      id: 'user-1',
      email: 'user@quantmail.in',
      username: 'user',
      displayName: 'User',
      role: 'USER',
    };
    fetchMock.mockResolvedValueOnce(backendJson({ success: true, data: user }));
    const request = new NextRequest('http://localhost:3000/api/oauth/userinfo', {
      headers: { authorization: 'Bearer access-rotated' },
    });

    const response = await getUserInfo(request);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(new URL('/oauth/userinfo', BACKEND_URL).toString());
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-rotated');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: user });
  });

  it('rejects unknown auth actions without contacting the backend', async () => {
    const request = new NextRequest('http://localhost:3000/auth/unknown', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });

    const response = await POST(request, contextFor('unknown'));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: 'AUTH_ACTION_NOT_FOUND',
        message: 'Authentication action not found.',
        statusCode: 404,
      },
    });
  });

  it('fails closed without exposing backend connection details', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:3010'));
    const request = new NextRequest('http://localhost:3000/auth/logout', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'quantmail_refresh=refresh-secret',
      },
    });

    const response = await POST(request, contextFor('logout'));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe('AUTH_BACKEND_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('ECONNREFUSED');
  });

  it('returns clean 200 NO_SESSION without hitting backend when refresh cookie is missing', async () => {
    const request = new NextRequest('http://localhost:3000/auth/refresh', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
    });

    const response = await POST(request, contextFor('refresh'));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: 'NO_SESSION',
        message: 'No active session.',
        statusCode: 200,
      },
    });
  });
});
