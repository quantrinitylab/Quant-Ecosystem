// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as login } from '../app/api/auth/login/route';
import { POST as logout } from '../app/api/auth/logout/route';
import { POST as refresh } from '../app/api/auth/refresh/route';
import { POST as verifyTwoFactor } from '../app/api/auth/2fa/verify/route';
import { POST as requestTwoFactorRecovery } from '../app/api/auth/2fa/recover/route';
import { POST as confirmTwoFactorRecovery } from '../app/api/auth/2fa/recover/confirm/route';
import { GET as getUserInfo } from '../app/api/oauth/userinfo/route';
import { GET as catchAllGet } from '../app/api/[...path]/route';

const BACKEND_URL = process.env['QUANTMAIL_BACKEND_URL'] ?? 'http://localhost:3010';

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
      'quantmail_refresh=refresh-secret; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000';
    fetchMock.mockResolvedValueOnce(
      backendJson(
        { success: true, data: { accessToken: 'access-token', expiresIn: 900 } },
        { headers: { 'set-cookie': cookie } },
      ),
    );
    const body = JSON.stringify({ email: 'user@quantmail.in', password: 'password' });
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body,
    });

    const response = await login(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(new URL('/auth/login', BACKEND_URL).toString());
    expect(init.method).toBe('POST');
    expect(init.body).toBe(body);
    expect(init.cache).toBe('no-store');
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
      'quantmail_refresh=rotated-secret; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000';
    fetchMock.mockResolvedValueOnce(
      backendJson(
        { success: true, data: { accessToken: 'rotated-access', expiresIn: 900 } },
        { headers: { 'set-cookie': rotatedCookie } },
      ),
    );
    const request = new NextRequest('http://localhost:3000/api/auth/refresh', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'theme=dark; quantmail_refresh=refresh-secret; analytics=on',
        'content-type': 'application/json',
      },
    });

    const response = await refresh(request);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(new URL('/auth/refresh', BACKEND_URL).toString());
    const headers = new Headers(init.headers);
    expect(headers.get('origin')).toBe('http://localhost:3000');
    expect(headers.get('cookie')).toBe('theme=dark; quantmail_refresh=refresh-secret; analytics=on');
    expect(response.headers.get('set-cookie')).toBe(rotatedCookie);
  });

  it('forwards the dedicated 2FA completion route and preserves the backend refresh cookie', async () => {
    const refreshCookie =
      'quantmail_refresh=second-leg-secret; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000';
    const backendHeaders = new Headers({ 'content-type': 'application/json' });
    backendHeaders.append('set-cookie', refreshCookie);
    backendHeaders.append('set-cookie', 'unrelated_cookie=must-not-cross; Path=/');
    fetchMock.mockResolvedValueOnce(
      backendJson(
        { success: true, data: { accessToken: 'access-after-2fa', expiresIn: 900 } },
        { headers: backendHeaders },
      ),
    );
    const body = JSON.stringify({ challenge: 'signed-challenge', code: '123456' });
    const request = new NextRequest('http://localhost:3000/api/auth/2fa/verify', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'theme=dark; analytics=on',
        'content-type': 'application/json',
      },
      body,
    });

    const response = await verifyTwoFactor(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(new URL('/auth/2fa/verify', BACKEND_URL).toString());
    expect(init.body).toBe(body);
    const headers = new Headers(init.headers);
    expect(headers.get('origin')).toBe('http://localhost:3000');
    expect(headers.get('cookie')).toBe('theme=dark; analytics=on');
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('quantmail_refresh=second-leg-secret');
    expect(await response.json()).toEqual({
      success: true,
      data: { accessToken: 'access-after-2fa', expiresIn: 900 },
    });
  });

  it('forwards 2FA recovery request + confirm through the dedicated proxy routes', async () => {
    // fix/qm-2fa-challenge-recovery-link: without these route files the
    // recovery panel's POSTs to /api/auth/2fa/recover(+/confirm) 404 on the
    // edge, so the locked-out user never reaches the backend.
    fetchMock.mockResolvedValueOnce(
      backendJson({ success: true, data: { message: 'neutral copy' } }),
    );
    const requestBody = JSON.stringify({ email: 'user@quantmail.in' });
    const request = new NextRequest('http://localhost:3000/api/auth/2fa/recover', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: requestBody,
    });

    const response = await requestTwoFactorRecovery(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(new URL('/auth/2fa/recover', BACKEND_URL).toString());
    expect(init.body).toBe(requestBody);
    expect(response.status).toBe(200);

    fetchMock.mockResolvedValueOnce(
      backendJson({ success: true, data: { message: '2FA is off' } }),
    );
    const confirmBody = JSON.stringify({
      email: 'user@quantmail.in',
      password: 'pw',
      code: '123456',
    });
    const confirmRequest = new NextRequest(
      'http://localhost:3000/api/auth/2fa/recover/confirm',
      {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: confirmBody,
      },
    );

    const confirmResponse = await confirmTwoFactorRecovery(confirmRequest);

    const [confirmUrl, confirmInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(confirmUrl.toString()).toBe(
      new URL('/auth/2fa/recover/confirm', BACKEND_URL).toString(),
    );
    expect(confirmInit.body).toBe(confirmBody);
    expect(confirmResponse.status).toBe(200);
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

  it('forwards the refresh cookie on GET /api/auth/sessions through the catch-all proxy', async () => {
    // Regression lock for the Active Sessions finding: the sessions endpoints
    // ride the generic /api/[...path] proxy (not a dedicated /api/auth/*
    // route), so the only thing that lets the backend identify the current
    // session is the Cookie header reaching it. If the proxy ever drops
    // cookies here, currentFamily resolves to null and the whole surface —
    // Current badge, "Only this device is active", Revoke All — silently dies.
    const sessions = {
      success: true,
      data: {
        sessions: [
          {
            id: 'fam-current',
            isCurrent: true,
            firstSeenAt: '2026-10-12T00:00:00.000Z',
            lastActiveAt: '2026-10-13T00:00:00.000Z',
            userAgent: null,
            ipAddress: null,
          },
        ],
      },
    };
    fetchMock.mockResolvedValueOnce(backendJson(sessions));
    const request = new NextRequest('http://localhost:3000/api/auth/sessions', {
      headers: { cookie: 'theme=dark; quantmail_refresh=refresh-secret' },
    });

    const response = await catchAllGet(request, {
      params: Promise.resolve({ path: ['auth', 'sessions'] }),
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(new URL('/auth/sessions', BACKEND_URL).toString());
    expect(new Headers(init.headers).get('cookie')).toBe('theme=dark; quantmail_refresh=refresh-secret');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(sessions);
  });

  it('fails closed without exposing backend connection details', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:3010'));
    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'quantmail_refresh=refresh-secret',
      },
    });

    const response = await logout(request);
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe('BACKEND_UNAVAILABLE');
    expect(payload.error.message).toBe('The requested service is temporarily unavailable.');
    expect(JSON.stringify(payload)).not.toContain('ECONNREFUSED');
  });
});
