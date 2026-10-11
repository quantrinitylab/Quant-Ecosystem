// ============================================================================
// @quant/api-client — sso-server helpers unit tests.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTokenSessionCookies,
  buildClearSessionCookies,
  buildClearSsoRequestCookies,
  safeReturnPath,
  parseCookies,
  exchangeAuthorizationCode,
  refreshOAuthTokens,
  verifyAccessToken,
  verifySsoTicket,
  mintIdentitySessionCookie,
  readIdentitySessionCookie,
  requestPasswordResetUpstream,
  SSO_COOKIES,
  SsoError,
} from '../sso-server';

const SECRET = 'test-secret-that-is-long-enough-0123456789';

function mockFetchOnce(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildTokenSessionCookies', () => {
  it('sets httpOnly access + refresh cookies, never readable by JS', () => {
    const headers = buildTokenSessionCookies(
      { accessToken: 'at-123', refreshToken: 'rt-456', expiresIn: 900 },
      { secure: true },
    );
    expect(headers).toHaveLength(2);
    const [access, refresh] = headers;
    expect(access!).toContain(`${SSO_COOKIES.access}=at-123`);
    expect(access!).toContain('HttpOnly');
    expect(access!).toContain('Secure');
    expect(access!).toContain('SameSite=Lax');
    expect(refresh!).toContain(`${SSO_COOKIES.refresh}=rt-456`);
    expect(refresh!).toContain('HttpOnly');
  });

  it('omits the refresh cookie when there is no refresh token', () => {
    const headers = buildTokenSessionCookies({ accessToken: 'at-123' }, { secure: false });
    expect(headers).toHaveLength(1);
    expect(headers[0]!).not.toContain('Secure');
  });
});

describe('buildClearSessionCookies / buildClearSsoRequestCookies', () => {
  it('expires every session cookie', () => {
    const headers = buildClearSessionCookies({ secure: true });
    expect(headers).toHaveLength(3);
    for (const h of headers) {
      expect(h).toContain('Max-Age=0');
      expect(h).toContain('HttpOnly');
    }
  });

  it('expires the pre-auth request cookies', () => {
    const headers = buildClearSsoRequestCookies();
    expect(headers).toHaveLength(4);
    expect(headers.join(';')).toContain('quant_sso_state');
    expect(headers.join(';')).toContain('quant_sso_verifier');
    expect(headers.join(';')).toContain('quant_sso_return');
    expect(headers.join(';')).toContain('quant_sso_redirect');
  });
});

describe('safeReturnPath', () => {
  it('allows absolute same-origin paths', () => {
    expect(safeReturnPath('/reels')).toBe('/reels');
  });
  it('rejects open redirects', () => {
    expect(safeReturnPath('https://evil.example')).toBeNull();
    expect(safeReturnPath('//evil.example')).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath('')).toBeNull();
  });
});

describe('parseCookies', () => {
  it('parses a Cookie header', () => {
    expect(parseCookies('a=1; b=hello%20world')).toEqual({ a: '1', b: 'hello world' });
    expect(parseCookies(null)).toEqual({});
  });
});

describe('exchangeAuthorizationCode', () => {
  const args = {
    code: 'auth-code',
    redirectUri: 'https://quantgram.quantrinity.in/api/auth/sso/callback',
    clientId: 'quantgram',
    codeVerifier: 'verifier',
    baseUrl: 'https://sso.example',
  };

  it('POSTs the code + verifier to the token endpoint (form-encoded)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
    });
    const tokens = await exchangeAuthorizationCode(args);
    expect(tokens.accessToken).toBe('at');
    expect(tokens.refreshToken).toBe('rt');
    expect(tokens.expiresIn).toBe(3600);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sso.example/api/oauth/token');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('code_verifier')).toBe('verifier');
    expect(body.get('redirect_uri')).toBe(args.redirectUri);
    expect(body.get('client_id')).toBe('quantgram');
  });

  it('throws CODE_REJECTED when QuantMail rejects the code', async () => {
    mockFetchOnce({ ok: false, status: 400, json: () => Promise.resolve({}) });
    await expect(exchangeAuthorizationCode(args)).rejects.toMatchObject({
      code: 'CODE_REJECTED',
    } as Partial<SsoError>);
  });

  it('throws PROVIDER_UNAVAILABLE on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(exchangeAuthorizationCode(args)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    } as Partial<SsoError>);
  });

  it('fails closed when the token response has no access token', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await expect(exchangeAuthorizationCode(args)).rejects.toBeInstanceOf(SsoError);
  });
});

describe('refreshOAuthTokens', () => {
  it('POSTs grant_type=refresh_token', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: 'at2', expires_in: 900 }),
    });
    const tokens = await refreshOAuthTokens({
      refreshToken: 'rt',
      clientId: 'quantgram',
      baseUrl: 'https://sso.example',
    });
    expect(tokens.accessToken).toBe('at2');
    // Falls back to the presented refresh token when the provider omits rotation.
    expect(tokens.refreshToken).toBe('rt');
    const body = new URLSearchParams((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
  });

  it('throws REFRESH_REJECTED (401) when the refresh token is dead', async () => {
    mockFetchOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    await expect(
      refreshOAuthTokens({ refreshToken: 'dead', clientId: 'quantgram', baseUrl: 'https://sso.example' }),
    ).rejects.toMatchObject({ code: 'REFRESH_REJECTED' } as Partial<SsoError>);
  });
});

describe('verifyAccessToken', () => {
  it('returns the verified user on 200', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ sub: 'u1', email: 'a@quantmail.in', username: 'a', name: 'A U' }),
    });
    const user = await verifyAccessToken({ accessToken: 'at', baseUrl: 'https://sso.example' });
    expect(user).toMatchObject({ id: 'u1', email: 'a@quantmail.in' });
  });

  it('returns null on 401 (fail closed)', async () => {
    mockFetchOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    expect(await verifyAccessToken({ accessToken: 'bad', baseUrl: 'https://sso.example' })).toBeNull();
  });

  it('returns null when the provider is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await verifyAccessToken({ accessToken: 'at', baseUrl: 'https://sso.example' })).toBeNull();
  });

  it('sends the token as a Bearer header, never in the URL', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'u1', email: 'a@b.c' }),
    });
    await verifyAccessToken({ accessToken: 'secret-token', baseUrl: 'https://sso.example' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('secret-token');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer secret-token');
  });
});

describe('verifySsoTicket', () => {
  it('POSTs the ticket to the ticket-verify endpoint and returns the identity', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: { id: 'u9', email: 't@quantmail.in', username: 'tess', displayName: 'Tess' },
        }),
    });
    const user = await verifySsoTicket({ ticket: 'single-use-ticket', baseUrl: 'https://sso.example' });
    expect(user).toMatchObject({ id: 'u9', email: 't@quantmail.in' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sso.example/api/oauth/sso-ticket/verify');
    expect(JSON.parse(init.body as string)).toEqual({ ticket: 'single-use-ticket' });
  });

  it('returns null when success is not true (fail closed)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ success: false }) });
    expect(
      await verifySsoTicket({ ticket: 'bad', baseUrl: 'https://sso.example' }),
    ).toBeNull();
  });

  it('returns null on 401 (expired/forged ticket)', async () => {
    mockFetchOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    expect(
      await verifySsoTicket({ ticket: 'stale', baseUrl: 'https://sso.example' }),
    ).toBeNull();
  });
});

describe('identity session cookie (HMAC)', () => {
  const user = { id: 'u1', email: 'a@quantmail.in', username: 'a', displayName: 'A' };

  it('mints a verifiable cookie and reads it back', () => {
    const header = mintIdentitySessionCookie(user, { secret: SECRET, secure: false });
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    const value = header.split(';')[0]!.split('=').slice(1).join('=');
    const read = readIdentitySessionCookie(value, { secret: SECRET });
    expect(read).toMatchObject({ id: 'u1', email: 'a@quantmail.in' });
  });

  it('rejects a tampered cookie', () => {
    const header = mintIdentitySessionCookie(user, { secret: SECRET, secure: false });
    const value = header.split(';')[0]!.split('=').slice(1).join('=');
    const [payload] = value.split('.');
    const forgedPayload = payload!.slice(0, -4) + 'AAAA';
    expect(
      readIdentitySessionCookie(`${forgedPayload}.${value.split('.')[1]}`, { secret: SECRET }),
    ).toBeNull();
  });

  it('rejects a cookie signed with a different secret', () => {
    const header = mintIdentitySessionCookie(user, { secret: SECRET, secure: false });
    const value = header.split(';')[0]!.split('=').slice(1).join('=');
    expect(
      readIdentitySessionCookie(value, { secret: 'another-long-enough-secret-0000000000' }),
    ).toBeNull();
  });

  it('rejects an expired cookie', () => {
    const header = mintIdentitySessionCookie(user, {
      secret: SECRET,
      secure: false,
      maxAgeSec: 60,
      issuedAt: Math.floor(Date.now() / 1000) - 3600,
    });
    const value = header.split(';')[0]!.split('=').slice(1).join('=');
    expect(readIdentitySessionCookie(value, { secret: SECRET })).toBeNull();
  });

  it('never embeds tokens — only identity claims', () => {
    const header = mintIdentitySessionCookie(user, { secret: SECRET, secure: false });
    expect(header).not.toContain('access_token');
    expect(header).not.toContain('refresh_token');
  });
});

describe('requestPasswordResetUpstream', () => {
  it('POSTs the email to the provider reset endpoint', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await requestPasswordResetUpstream({ email: 'a@quantmail.in', baseUrl: 'https://sso.example' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sso.example/api/auth/password-reset/request');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@quantmail.in' });
  });

  it('throws an honest error when the provider is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(
      requestPasswordResetUpstream({ email: 'a@quantmail.in', baseUrl: 'https://sso.example' }),
    ).rejects.toBeInstanceOf(SsoError);
  });
});
