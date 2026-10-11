// ============================================================================
// QuantChat — unit tests for the OAuth2 (code + PKCE) SSO helpers.
// No network: all back-channel calls use a mocked fetch.
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import {
  generateCodeVerifier,
  generateState,
  codeChallengeS256,
  buildAuthorizeUrl,
  safeReturnPath,
  timingSafeEqualStrings,
  exchangeCodeForTokens,
  fetchUserinfo,
  verifySsoTicket,
  SsoError,
  SSO_STATE_COOKIE,
  SSO_VERIFIER_COOKIE,
  SSO_RETURN_COOKIE,
} from '../lib/sso-oauth';

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('PKCE generation', () => {
  it('generates a 43-char verifier from the unreserved set', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(generateCodeVerifier()).not.toBe(v); // random each call
  });

  it('generates a unique opaque state per call', () => {
    const a = generateState();
    const b = generateState();
    expect(a).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(a).not.toBe(b);
  });

  it('derives the S256 code challenge per RFC 7636 (known vector)', async () => {
    // RFC 7636 Appendix B example.
    const challenge = await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('the challenge is a deterministic function of the verifier', async () => {
    const v = generateCodeVerifier();
    expect(await codeChallengeS256(v)).toBe(await codeChallengeS256(v));
  });
});

describe('timingSafeEqualStrings', () => {
  it('compares equal strings true, different strings false', () => {
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStrings('abc', 'abd')).toBe(false);
    expect(timingSafeEqualStrings('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualStrings('', '')).toBe(true);
  });
});

describe('buildAuthorizeUrl', () => {
  it('builds the Contract-A authorize URL with every required param', () => {
    const url = new URL(
      buildAuthorizeUrl({
        providerBaseUrl: 'https://quantmail.in',
        clientId: 'quantchat',
        redirectUri: 'https://quantchat.quantrinity.in/api/auth/sso/callback',
        state: 's3cr3t-state',
        codeChallenge: 'challenge-xyz',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://quantmail.in/api/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('quantchat');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://quantchat.quantrinity.in/api/auth/sso/callback',
    );
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('state')).toBe('s3cr3t-state');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('never puts tokens in the URL', () => {
    const url = buildAuthorizeUrl({
      providerBaseUrl: 'https://quantmail.in',
      clientId: 'quantchat',
      redirectUri: 'https://quantchat.quantrinity.in/api/auth/sso/callback',
      state: 'x',
      codeChallenge: 'y',
    });
    expect(url).not.toMatch(/[?&](token|accessToken|access_token)=/);
  });
});

describe('safeReturnPath', () => {
  it('accepts same-origin absolute paths', () => {
    expect(safeReturnPath('/chat')).toBe('/chat');
    expect(safeReturnPath('/')).toBe('/');
  });

  it('rejects open redirects and junk', () => {
    expect(safeReturnPath('https://evil.example/x')).toBeNull();
    expect(safeReturnPath('//evil.example/x')).toBeNull();
    expect(safeReturnPath('/\\evil')).toBeNull();
    expect(safeReturnPath('')).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
  });
});

describe('exchangeCodeForTokens', () => {
  const args = {
    code: 'auth-code-123',
    redirectUri: 'https://quantchat.quantrinity.in/api/auth/sso/callback',
    clientId: 'quantchat',
    codeVerifier: 'verifier-abc',
  };

  it('exchanges the code and returns the token set', async () => {
    const fetchMock = mockFetchOnce(200, {
      access_token: 'acc-1',
      refresh_token: 'ref-1',
      id_token: 'id-1',
      expires_in: 900,
    });
    const tokens = await exchangeCodeForTokens(args, fetchMock as unknown as typeof fetch);
    expect(tokens.accessToken).toBe('acc-1');
    expect(tokens.refreshToken).toBe('ref-1');
    expect(tokens.idToken).toBe('id-1');
    expect(tokens.expiresIn).toBe(900);

    // The back-channel request carries the PKCE verifier and exact redirect_uri.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/oauth/token');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      grant_type: 'authorization_code',
      code: 'auth-code-123',
      redirect_uri: 'https://quantchat.quantrinity.in/api/auth/sso/callback',
      client_id: 'quantchat',
      code_verifier: 'verifier-abc',
    });
  });

  it('falls back to the /api/oauth/token path on 404 (public proxy layout)', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/api/oauth/token')
        ? new Response(JSON.stringify({ access_token: 'acc-2', expires_in: 3600 }), { status: 200 })
        : new Response('nope', { status: 404 }),
    );
    const tokens = await exchangeCodeForTokens(args, fetchMock as unknown as typeof fetch);
    expect(tokens.accessToken).toBe('acc-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a typed SsoError when QuantMail rejects the code', async () => {
    const fetchMock = mockFetchOnce(400, { error: { code: 'INVALID_GRANT' } });
    await expect(exchangeCodeForTokens(args, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: 'SsoError',
      code: 'INVALID_GRANT',
    });
  });

  it('throws when no access token comes back', async () => {
    const fetchMock = mockFetchOnce(200, { expires_in: 60 });
    await expect(exchangeCodeForTokens(args, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      code: 'TOKEN_EXCHANGE_FAILED',
    });
  });
});

describe('fetchUserinfo', () => {
  it('returns the verified identity from the userinfo endpoint', async () => {
    const fetchMock = mockFetchOnce(200, {
      success: true,
      data: { id: 'u-1', email: 'a@quantmail.in', username: 'alex', displayName: 'Alex' },
    });
    const user = await fetchUserinfo({ accessToken: 'acc-1' }, fetchMock as unknown as typeof fetch);
    expect(user).toMatchObject({ id: 'u-1', email: 'a@quantmail.in', username: 'alex', displayName: 'Alex' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer acc-1');
  });

  it('throws a typed SsoError on 401 (token not accepted)', async () => {
    const fetchMock = mockFetchOnce(401, { error: 'unauthorized' });
    await expect(fetchUserinfo({ accessToken: 'bad' }, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: 'SsoError',
      code: 'USERINFO_FAILED',
    });
  });
});

describe('verifySsoTicket', () => {
  it('verifies a Contract-B ticket and returns the identity', async () => {
    const fetchMock = mockFetchOnce(200, {
      success: true,
      data: { id: 'u-9', email: 'b@quantmail.in', username: 'bee', displayName: 'Bee' },
    });
    const user = await verifySsoTicket({ ticket: 'tick-1' }, fetchMock as unknown as typeof fetch);
    expect(user).toMatchObject({ id: 'u-9', email: 'b@quantmail.in' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/oauth/sso-ticket/verify');
    expect(JSON.parse(init.body as string)).toEqual({ ticket: 'tick-1' });
  });

  it('rejects when success is false or the identity is incomplete', async () => {
    const fetchMock = mockFetchOnce(200, { success: false, data: null });
    await expect(verifySsoTicket({ ticket: 'bad' }, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: 'SsoError',
      code: 'INVALID_SSO_TICKET',
    });
  });
});

describe('SSO cookie names', () => {
  it('uses distinct cookie names for state, verifier, and return path', () => {
    expect(new Set([SSO_STATE_COOKIE, SSO_VERIFIER_COOKIE, SSO_RETURN_COOKIE]).size).toBe(3);
  });
});

describe('SsoError', () => {
  it('carries a machine-readable code', () => {
    const err = new SsoError('SOME_CODE', 'msg');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('SOME_CODE');
  });
});
