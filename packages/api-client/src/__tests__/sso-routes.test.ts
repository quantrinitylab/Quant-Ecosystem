// ============================================================================
// @quant/api-client — sso-routes handler factories unit tests.
// Global fetch is mocked to simulate the QuantMail provider.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createSsoCallbackHandler,
  createSsoTicketHandler,
  createSessionHandler,
  createPasswordResetHandler,
} from '../sso-routes';
import { SSO_COOKIES } from '../sso-server';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function tokenOk() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({ access_token: 'oauth-at', refresh_token: 'oauth-rt', expires_in: 900 }),
  };
}

function userinfoOk() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({ id: 'u1', email: 'user@quantmail.in', username: 'user', name: 'User' }),
  };
}

function ticketOk() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data: { id: 'u9', email: 't@quantmail.in', username: 'tess', displayName: 'Tess' },
      }),
  };
}

function getRequest(
  url: string,
  init?: { headers?: Record<string, string>; method?: string; body?: string },
): NextRequest {
  const headers = new Headers(init?.headers ?? {});
  return new NextRequest(url, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body,
  });
}

function setCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Contract A callback
// ---------------------------------------------------------------------------

describe('createSsoCallbackHandler (Contract A)', () => {
  const GET = createSsoCallbackHandler({ clientId: 'quantgram', loginPath: '/login' });
  const roundTripCookies =
    `${SSO_COOKIES.state}=state-abc; ${SSO_COOKIES.verifier}=verifier-xyz; ` +
    `quant_sso_redirect=${encodeURIComponent('https://quantgram.quantrinity.in/api/auth/sso/callback')}; ` +
    `${SSO_COOKIES.returnTo}=${encodeURIComponent('/reels')}`;

  it('exchanges the code server-side, mints httpOnly cookies, and redirects home', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenOk()) // token exchange
      .mockResolvedValueOnce(userinfoOk()); // userinfo verify
    const res = await GET(
      getRequest('https://quantgram.quantrinity.in/api/auth/sso/callback?code=code1&state=state-abc', {
        headers: { cookie: roundTripCookies },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://quantgram.quantrinity.in/reels');

    // Token exchange happened server-side with the exact redirect_uri + verifier.
    const [tokenUrl, tokenInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://quantmail.in/api/oauth/token');
    const body = new URLSearchParams(tokenInit.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code1');
    expect(body.get('code_verifier')).toBe('verifier-xyz');
    expect(body.get('redirect_uri')).toBe(
      'https://quantgram.quantrinity.in/api/auth/sso/callback',
    );
    expect(body.get('client_id')).toBe('quantgram');

    // httpOnly session cookies set; request cookies cleared; no token in URL.
    const cookies = setCookies(res);
    const access = cookies.find((c) => c.startsWith(`${SSO_COOKIES.access}=`));
    expect(access).toContain('HttpOnly');
    expect(access).toContain('SameSite=Lax');
    expect(cookies.find((c) => c.startsWith(`${SSO_COOKIES.refresh}=`))).toContain('HttpOnly');
    expect(cookies.find((c) => c.startsWith(`${SSO_COOKIES.state}=`))).toContain('Max-Age=0');
    expect(res.headers.get('location')).not.toContain('oauth-at');
  });

  it('fails closed to /login?error=sso_failed on state mismatch', async () => {
    const res = await GET(
      getRequest('https://quantgram.quantrinity.in/api/auth/sso/callback?code=code1&state=wrong', {
        headers: { cookie: roundTripCookies },
      }),
    );
    expect(res.headers.get('location')).toBe('https://quantgram.quantrinity.in/login?error=sso_failed');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fails closed when the round-trip cookies are missing', async () => {
    const res = await GET(
      getRequest('https://quantgram.quantrinity.in/api/auth/sso/callback?code=code1&state=state-abc'),
    );
    expect(res.headers.get('location')).toContain('error=sso_failed');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('redirects with sso_cancelled when QuantMail reports an error', async () => {
    const res = await GET(
      getRequest('https://quantgram.quantrinity.in/api/auth/sso/callback?error=access_denied', {
        headers: { cookie: roundTripCookies },
      }),
    );
    expect(res.headers.get('location')).toContain('error=sso_cancelled');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('redirects with sso_rejected when the code exchange is rejected', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({}) });
    const res = await GET(
      getRequest('https://quantgram.quantrinity.in/api/auth/sso/callback?code=stale&state=state-abc', {
        headers: { cookie: roundTripCookies },
      }),
    );
    expect(res.headers.get('location')).toContain('error=sso_rejected');
  });

  it('fails closed when userinfo verification fails after exchange', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const res = await GET(
      getRequest('https://quantgram.quantrinity.in/api/auth/sso/callback?code=code1&state=state-abc', {
        headers: { cookie: roundTripCookies },
      }),
    );
    expect(res.headers.get('location')).toContain('error=sso_failed');
    // No session cookies on failure.
    expect(setCookies(res).find((c) => c.startsWith(`${SSO_COOKIES.access}=`))).toBeUndefined();
  });

  it('sanitizes an evil returnTo cookie to /', async () => {
    mockFetch.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(userinfoOk());
    const evil = roundTripCookies.replace(
      `${SSO_COOKIES.returnTo}=${encodeURIComponent('/reels')}`,
      `${SSO_COOKIES.returnTo}=${encodeURIComponent('https://evil.example/phish')}`,
    );
    const res = await GET(
      getRequest('https://quantgram.quantrinity.in/api/auth/sso/callback?code=code1&state=state-abc', {
        headers: { cookie: evil },
      }),
    );
    expect(res.headers.get('location')).toBe('https://quantgram.quantrinity.in/');
  });
});

// ---------------------------------------------------------------------------
// Contract B ticket
// ---------------------------------------------------------------------------

describe('createSsoTicketHandler (Contract B)', () => {
  const POST = createSsoTicketHandler();

  it('verifies the ticket and mints a signed identity session (no tokens)', async () => {
    mockFetch.mockResolvedValueOnce(ticketOk());
    const res = await POST(
      getRequest('https://x/api/auth/sso/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: 'single-use-ticket' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      data: { user: { id: 'u9', email: 't@quantmail.in' } },
    });
    // No tokens anywhere in the response.
    expect(JSON.stringify(body)).not.toContain('token');
    const cookies = setCookies(res);
    const session = cookies.find((c) => c.startsWith(`${SSO_COOKIES.session}=`));
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Lax');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://quantmail.in/api/oauth/sso-ticket/verify');
    expect(JSON.parse(init.body as string)).toEqual({ ticket: 'single-use-ticket' });
  });

  it('rejects a missing ticket with 400', async () => {
    const res = await POST(
      getRequest('https://x/api/auth/sso/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fails closed with 401 when the ticket is rejected', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const res = await POST(
      getRequest('https://x/api/auth/sso/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: 'stale-ticket' }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_SSO_TICKET' },
    });
    expect(setCookies(res)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

describe('createSessionHandler', () => {
  const GET = createSessionHandler({ clientId: 'quantgram' });

  it('returns the verified user for a live access cookie', async () => {
    mockFetch.mockResolvedValueOnce(userinfoOk());
    const res = await GET(
      getRequest('https://x/api/auth/session', {
        headers: { cookie: `${SSO_COOKIES.access}=live-token` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      data: { user: { id: 'u1', email: 'user@quantmail.in' }, sessionType: 'oauth' },
    });
    expect(JSON.stringify(body)).not.toContain('live-token');
  });

  it('self-heals via the refresh token when the access token is dead', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) }) // userinfo 401
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'fresh-at', expires_in: 900 }),
      }) // refresh
      .mockResolvedValueOnce(userinfoOk()); // userinfo again
    const res = await GET(
      getRequest('https://x/api/auth/session', {
        headers: { cookie: `${SSO_COOKIES.access}=dead; ${SSO_COOKIES.refresh}=rt` },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.sessionType).toBe('oauth');
    const refreshCall = mockFetch.mock.calls[1] as [string, RequestInit];
    const refreshInit = refreshCall[1]!;
    expect(new URLSearchParams(refreshInit!.body as string).get('grant_type')).toBe('refresh_token');
    // Rotated cookies are set.
    const cookies = setCookies(res);
    expect(cookies.find((c) => c.startsWith(`${SSO_COOKIES.access}=fresh-at`))).toBeDefined();
  });

  it('clears dead token cookies and 401s when refresh is rejected', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const res = await GET(
      getRequest('https://x/api/auth/session', {
        headers: { cookie: `${SSO_COOKIES.access}=dead; ${SSO_COOKIES.refresh}=dead-rt` },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'NO_SESSION' } });
    const cookies = setCookies(res);
    expect(cookies.find((c) => c.startsWith(`${SSO_COOKIES.access}=`) && c.includes('Max-Age=0'))).toBeDefined();
  });

  it('accepts a valid signed identity session (ticket flow)', async () => {
    const { mintIdentitySessionCookie } = await import('../sso-server');
    const header = mintIdentitySessionCookie(
      { id: 'u9', email: 't@quantmail.in' },
      { secret: 'test-secret-that-is-long-enough-0123456789', secure: false },
    );
    // The route verifies with identitySessionSecret(); set the env secret for this test.
    process.env['QUANT_SSO_SESSION_SECRET'] = 'test-secret-that-is-long-enough-0123456789';
    const value = header.split(';')[0]!.split('=').slice(1).join('=');
    const res = await GET(
      getRequest('https://x/api/auth/session', {
        headers: { cookie: `${SSO_COOKIES.session}=${value}` },
      }),
    );
    delete process.env['QUANT_SSO_SESSION_SECRET'];
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      user: { id: 'u9', email: 't@quantmail.in' },
      sessionType: 'sso-ticket',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('401s with NO_SESSION when no session exists', async () => {
    const res = await GET(getRequest('https://x/api/auth/session'));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ success: false, error: { code: 'NO_SESSION' } });
  });
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

describe('createPasswordResetHandler (Contract C)', () => {
  const POST = createPasswordResetHandler();

  it('proxies the email to QuantMail and accepts', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const res = await POST(
      getRequest('https://x/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@quantmail.in' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { accepted: true } });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://quantmail.in/api/auth/password-reset/request');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'user@quantmail.in' });
  });

  it('rejects an invalid email with 400', async () => {
    const res = await POST(
      getRequest('https://x/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns an honest 502 when the provider is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('down'));
    const res = await POST(
      getRequest('https://x/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@quantmail.in' }),
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: 'RESET_UNAVAILABLE' },
    });
  });
});
