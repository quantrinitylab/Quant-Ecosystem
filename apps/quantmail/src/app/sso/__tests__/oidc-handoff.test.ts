// ============================================================================
// Tests for sso/oidc-handoff.ts (fix/qm-oauth-authorize-302).
//
// Proves: /sso detects a real OIDC authorize request (and only then),
// builds the proxy URL with every OIDC parameter intact, sends the access
// token in the Authorization header (never in the URL), and classifies the
// proxy's answers into redirect / consent-screen / honest-error outcomes.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';

import {
  OIDC_BROWSER_HEADER,
  buildOidcAuthorizeProxyUrl,
  isPartialOidcAuthorizeRequest,
  parseOidcAuthorizeRequest,
  runOidcAuthorize,
  type OidcAuthorizeRequest,
} from '../oidc-handoff';

const FULL_QUERY =
  'response_type=code' +
  '&client_id=client_abc123' +
  '&redirect_uri=' + encodeURIComponent('https://app.example.com/oauth/callback') +
  '&scope=' + encodeURIComponent('openid profile email') +
  '&state=xyz-state-1' +
  '&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM' +
  '&code_challenge_method=S256' +
  '&nonce=n-0S6_WzA2Mj';

const REQ: OidcAuthorizeRequest = {
  clientId: 'client_abc123',
  redirectUri: 'https://app.example.com/oauth/callback',
  scope: 'openid profile email',
  state: 'xyz-state-1',
  codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  codeChallengeMethod: 'S256',
  nonce: 'n-0S6_WzA2Mj',
  extras: {},
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

describe('parseOidcAuthorizeRequest', () => {
  it('parses a full OIDC authorize request', () => {
    const req = parseOidcAuthorizeRequest(new URLSearchParams(FULL_QUERY));
    expect(req).toEqual(REQ);
  });

  it('prefers verbatim redirect_uri over the /oauth/authorize returnTo mapping', () => {
    const sp = new URLSearchParams(FULL_QUERY);
    sp.set('returnTo', 'https://other.example/ignored');
    const req = parseOidcAuthorizeRequest(sp);
    expect(req?.redirectUri).toBe('https://app.example.com/oauth/callback');
  });

  it('falls back to returnTo (the /oauth/authorize -> /sso mapping)', () => {
    const sp = new URLSearchParams(
      'response_type=code&client_id=client_abc123&returnTo=' +
        encodeURIComponent('https://app.example.com/oauth/callback') +
        '&state=s1',
    );
    const req = parseOidcAuthorizeRequest(sp);
    expect(req).not.toBeNull();
    expect(req?.redirectUri).toBe('https://app.example.com/oauth/callback');
    expect(req?.state).toBe('s1');
    // Optional params default to empty, never undefined
    expect(req?.scope).toBe('');
    expect(req?.codeChallenge).toBe('');
  });

  it('returns null when response_type is not code', () => {
    expect(
      parseOidcAuthorizeRequest(new URLSearchParams('response_type=token&client_id=c&redirect_uri=https%3A%2F%2Fx.test')),
    ).toBeNull();
  });

  it('returns null for plain ecosystem SSO visits (no response_type)', () => {
    expect(
      parseOidcAuthorizeRequest(new URLSearchParams('returnTo=/dashboard&client_id=quantchat')),
    ).toBeNull();
  });

  it('returns null when client_id or redirect_uri is missing', () => {
    expect(
      parseOidcAuthorizeRequest(new URLSearchParams('response_type=code&redirect_uri=https%3A%2F%2Fx.test')),
    ).toBeNull();
    expect(
      parseOidcAuthorizeRequest(new URLSearchParams('response_type=code&client_id=c')),
    ).toBeNull();
    expect(
      parseOidcAuthorizeRequest(new URLSearchParams('response_type=code&client_id=c&returnTo=')),
    ).toBeNull();
  });

  it('preserves every additional OIDC parameter the RP arrived with', () => {
    // The /oauth/authorize route forwards ALL RP params to /sso, so an RP
    // sending prompt/response_mode/login_hint arrives with them here. The
    // old builder carried only the seven named fields and dropped these.
    const sp = new URLSearchParams(FULL_QUERY);
    sp.set('response_mode', 'query');
    sp.set('prompt', 'login');
    sp.set('login_hint', 'user@example.com');
    sp.set('ui_locales', 'fr-FR');
    sp.set('max_age', '3600');
    sp.set('acr_values', 'urn:mace:incommon:iap:silver');
    sp.set('display', 'popup');
    sp.set('id_token_hint', 'hint-token');
    sp.set('custom_future_param', 'keep-me');
    // Handoff-internal params must NOT leak into the backend request.
    sp.set('returnTo', 'https://other.example/ignored');
    sp.set('__quant_sso_ticket', 'stale-ticket');
    const req = parseOidcAuthorizeRequest(sp);
    expect(req).not.toBeNull();
    expect(req?.extras).toEqual({
      response_mode: 'query',
      prompt: 'login',
      login_hint: 'user@example.com',
      ui_locales: 'fr-FR',
      max_age: '3600',
      acr_values: 'urn:mace:incommon:iap:silver',
      display: 'popup',
      id_token_hint: 'hint-token',
      custom_future_param: 'keep-me',
    });
    const params = new URLSearchParams(
      buildOidcAuthorizeProxyUrl(req!).slice('/api/oauth/authorize?'.length),
    );
    for (const [key, value] of Object.entries(req!.extras)) {
      expect(params.get(key)).toBe(value);
    }
    // Named params still intact alongside the extras.
    expect(params.get('state')).toBe('xyz-state-1');
    expect(params.get('code_challenge')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    // The redirect_uri mapping source itself is not forwarded as returnTo.
    expect(params.has('returnTo')).toBe(false);
    expect(params.has('__quant_sso_ticket')).toBe(false);
  });
});

describe('isPartialOidcAuthorizeRequest', () => {
  it('flags broken OIDC links (response_type present, strict detection fails)', () => {
    expect(
      isPartialOidcAuthorizeRequest(new URLSearchParams('response_type=code&client_id=c')),
    ).toBe(true);
    expect(
      isPartialOidcAuthorizeRequest(new URLSearchParams('response_type=code&redirect_uri=https%3A%2F%2Fx.test')),
    ).toBe(true);
    expect(
      isPartialOidcAuthorizeRequest(new URLSearchParams('response_type=token&client_id=c&redirect_uri=https%3A%2F%2Fx.test')),
    ).toBe(true);
  });

  it('does not flag genuine OIDC requests or plain ecosystem visits', () => {
    expect(isPartialOidcAuthorizeRequest(new URLSearchParams(FULL_QUERY))).toBe(false);
    expect(
      isPartialOidcAuthorizeRequest(new URLSearchParams('returnTo=/dashboard&client_id=quantchat')),
    ).toBe(false);
    expect(
      isPartialOidcAuthorizeRequest(
        new URLSearchParams('returnTo=https%3A%2F%2Fquantchat.in%2Fapp&client_id=quantchat'),
      ),
    ).toBe(false);
  });
});

describe('buildOidcAuthorizeProxyUrl', () => {
  it('builds the proxy URL with every OIDC parameter intact', () => {
    const url = buildOidcAuthorizeProxyUrl(REQ);
    expect(url.startsWith('/api/oauth/authorize?')).toBe(true);
    const params = new URLSearchParams(url.slice('/api/oauth/authorize?'.length));
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe('client_abc123');
    expect(params.get('redirect_uri')).toBe('https://app.example.com/oauth/callback');
    expect(params.get('scope')).toBe('openid profile email');
    expect(params.get('state')).toBe('xyz-state-1');
    expect(params.get('code_challenge')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('nonce')).toBe('n-0S6_WzA2Mj');
  });

  it('omits empty optional parameters', () => {
    const url = buildOidcAuthorizeProxyUrl({ ...REQ, scope: '', state: '', nonce: '' });
    const params = new URLSearchParams(url.slice('/api/oauth/authorize?'.length));
    expect(params.has('scope')).toBe(false);
    expect(params.has('state')).toBe(false);
    expect(params.has('nonce')).toBe(false);
    expect(params.get('response_type')).toBe('code');
  });
});

describe('runOidcAuthorize', () => {
  it('sends the token as an Authorization header (never in the URL) plus the OIDC opt-in header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ redirect: 'https://app.example.com/oauth/callback?code=ac_1&state=xyz-state-1' }));
    const outcome = await runOidcAuthorize('tok-123', REQ, fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith('/api/oauth/authorize?')).toBe(true);
    expect(url).not.toContain('tok-123');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-123');
    expect(headers[OIDC_BROWSER_HEADER]).toBe('1');

    expect(outcome).toEqual({
      kind: 'redirect',
      location: 'https://app.example.com/oauth/callback?code=ac_1&state=xyz-state-1',
    });
  });

  it('classifies a 200 HTML body as the consent screen', async () => {
    const html = '<html><body><form action="/api/oauth/consent">consent</form></body></html>';
    const fetchImpl = vi.fn(async () => htmlResponse(html));
    const outcome = await runOidcAuthorize('tok-123', REQ, fetchImpl as unknown as typeof fetch);
    expect(outcome).toEqual({ kind: 'consent', html });
  });

  it('turns a 401 into an honest session-expired error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401));
    const outcome = await runOidcAuthorize('tok-stale', REQ, fetchImpl as unknown as typeof fetch);
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.status).toBe(401);
      expect(outcome.message).toMatch(/session expired/i);
    }
  });

  it('surfaces the backend error_description for invalid requests', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'invalid_request', error_description: 'Invalid redirect_uri' }, 400),
    );
    const outcome = await runOidcAuthorize('tok-123', REQ, fetchImpl as unknown as typeof fetch);
    expect(outcome).toEqual({ kind: 'error', status: 400, message: 'Invalid redirect_uri' });
  });

  it('turns an unknown client / invalid redirect_uri into an honest error, never a redirect', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'invalid_request', error_description: 'Invalid redirect_uri' }, 400),
    );
    const outcome = await runOidcAuthorize('tok-123', REQ, fetchImpl as unknown as typeof fetch);
    expect(outcome.kind).toBe('error');
    expect(outcome).not.toHaveProperty('location');
  });

  it('refuses to navigate to a redirect target outside the requested redirect_uri', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ redirect: 'https://evil.example/callback?code=stolen&state=xyz-state-1' }),
    );
    const outcome = await runOidcAuthorize('tok-123', REQ, fetchImpl as unknown as typeof fetch);
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.message).toMatch(/did not point back/);
    }
    expect(outcome).not.toHaveProperty('location');
  });

  it('still follows a deny-style redirect to the requested redirect_uri itself', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ redirect: 'https://app.example.com/oauth/callback?error=access_denied&state=xyz-state-1' }),
    );
    const outcome = await runOidcAuthorize('tok-123', REQ, fetchImpl as unknown as typeof fetch);
    expect(outcome).toEqual({
      kind: 'redirect',
      location: 'https://app.example.com/oauth/callback?error=access_denied&state=xyz-state-1',
    });
  });

  it('rejects on network failure so the caller shows an honest error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    await expect(
      runOidcAuthorize('tok-123', REQ, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow('fetch failed');
  });
});
