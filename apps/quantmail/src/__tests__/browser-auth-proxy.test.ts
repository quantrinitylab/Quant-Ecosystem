// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/auth/[action]/route';

const BACKEND_URL = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';
const contextFor = (action: string) => ({ params: Promise.resolve({ action }) });

const backendJson = (body: unknown, options: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });

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
});
