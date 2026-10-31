// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../proxy';

/**
 * fix/qm-quantgit-repos-401-cookie-3: login/refresh now set TWO cookies
 * (quantmail_refresh + quant_access_token). The proxy must forward every
 * Set-Cookie header intact — the old `headers.get('set-cookie')` collapsed
 * multiples into one comma-joined value, which browsers misparse, so only
 * the first cookie survived and the access cookie was silently dropped.
 */

const loginRequest = (): NextRequest =>
  new NextRequest('http://localhost:3000/api/auth/login', { method: 'POST' });

const backendJsonResponse = (cookies: string[]): Response => {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify({ success: true, data: {} }), {
    status: 200,
    headers,
  });
};

const forwardedCookies = (res: Response): string[] => {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
};

describe('proxyToBackend Set-Cookie forwarding', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards every backend Set-Cookie header (login sets refresh + access cookies)', async () => {
    fetchMock.mockResolvedValueOnce(
      backendJsonResponse([
        'quantmail_refresh=REF; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000',
        'quant_access_token=ACC; Path=/; HttpOnly; SameSite=Strict; Max-Age=900',
      ]),
    );

    const res = await proxyToBackend(loginRequest(), '/auth/login');

    expect(res.status).toBe(200);
    const cookies = forwardedCookies(res);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain('quantmail_refresh=REF');
    expect(cookies[1]).toContain('quant_access_token=ACC');
  });

  it('still forwards a single Set-Cookie header (regression)', async () => {
    fetchMock.mockResolvedValueOnce(
      backendJsonResponse(['quantmail_refresh=REF; Path=/; HttpOnly; SameSite=Strict']),
    );

    const res = await proxyToBackend(loginRequest(), '/auth/login');

    const cookies = forwardedCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain('quantmail_refresh=REF');
  });

  it('forwards no Set-Cookie header when the backend sets none', async () => {
    fetchMock.mockResolvedValueOnce(backendJsonResponse([]));

    const res = await proxyToBackend(loginRequest(), '/auth/login');

    expect(forwardedCookies(res)).toHaveLength(0);
  });
});
