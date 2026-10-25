// @vitest-environment node
// ============================================================================
// Route tests for the fixed OAuth browser-consent flow (routes/oauth.ts):
//   GET /oauth/authorize renders a consent screen whose form posts to the
//   REAL Next route /api/oauth/consent (not the 404 /oauth/consent), carrying
//   a single-use consent_token because a browser form cannot send an
//   Authorization header;
//   POST /oauth/consent accepts that consent_token (or, unchanged, a Bearer
//   token for programmatic API clients).
// ============================================================================
//
// HARNESS: registers the REAL `oauthRoutes` on a bare Fastify app and mocks
// only the deep @quant/auth specifiers it consumes (prisma, secure-random,
// secrets, token-service) — exactly as oauth-redirect-binding-replay.test.ts
// does.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

vi.mock('@quant/auth/lib/prisma', () => {
  const p = {
    oAuthClient: { findUnique: vi.fn(), create: vi.fn() },
    oAuthConsent: { findUnique: vi.fn(), upsert: vi.fn() },
    authorizationCode: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  };
  return { default: p, prisma: p };
});

vi.mock('@quant/auth/crypto/secure-random', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}mock_${Math.random().toString(36).slice(2, 8)}`),
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {
    async validateAccessToken(token: string) {
      return token ? { id: 'user-1', sub: 'user-1', email: 'user@test.com' } : null;
    }
  }
  return { TokenService: MockTokenService };
});

import { oauthRoutes } from '../routes/oauth';
import prismaDefaultImport from '@quant/auth/lib/prisma';

const db = vi.mocked(
  prismaDefaultImport as unknown as {
    oAuthClient: { findUnique: ReturnType<typeof vi.fn> };
    oAuthConsent: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    authorizationCode: {
      create: ReturnType<typeof vi.fn>;
    };
  },
);

const CLIENT = {
  clientId: 'client-1',
  redirectUris: ['https://app.test.com/callback'],
  allowedScopes: ['openid', 'profile', 'email'],
};

const AUTHORIZE_QUERY =
  '/oauth/authorize?response_type=code' +
  '&client_id=client-1' +
  '&redirect_uri=' +
  encodeURIComponent('https://app.test.com/callback') +
  '&scope=' +
  encodeURIComponent('openid profile email') +
  '&state=xyz' +
  '&code_challenge=challenge-abc&code_challenge_method=S256&nonce=nonce-123';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(oauthRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  db.oAuthClient.findUnique.mockResolvedValue(CLIENT as never);
  db.oAuthConsent.findUnique.mockResolvedValue(null); // no prior consent -> HTML screen
  db.oAuthConsent.upsert.mockResolvedValue({} as never);
  db.authorizationCode.create.mockImplementation(async (args: any) => args.data as never);
});

const BEARER = { authorization: 'Bearer valid-token' };

const SPECIAL_STATE = 'a&b=c#frag ü';
const SPECIAL_STATE_ENCODED = encodeURIComponent(SPECIAL_STATE);

const authorizeQueryWithState = (state: string) =>
  '/oauth/authorize?response_type=code' +
  '&client_id=client-1' +
  '&redirect_uri=' +
  encodeURIComponent('https://app.test.com/callback') +
  '&scope=' +
  encodeURIComponent('openid profile email') +
  '&state=' +
  encodeURIComponent(state) +
  '&code_challenge=challenge-abc&code_challenge_method=S256&nonce=nonce-123';

/** A state value containing &, =, # and non-ASCII must round-trip opaquely
 *  (RFC 6749 §4.1.2): the RP callback must parse exactly one `state` param
 *  equal to the original, with no injected extra params. */
function expectStateRoundTrips(location: string, extraParams: string[] = []) {
  const url = new URL(location);
  expect(url.searchParams.get('state')).toBe(SPECIAL_STATE);
  expect(url.searchParams.has('b')).toBe(false);
  expect(url.searchParams.get('c')).toBeNull();
  for (const p of extraParams) expect(url.searchParams.has(p)).toBe(false);
  expect(location).toContain(`state=${SPECIAL_STATE_ENCODED}`);
}

/** Render the consent screen and pull the hidden consent_token out of the HTML. */
async function renderConsentScreen(url: string = AUTHORIZE_QUERY) {
  const res = await app.inject({
    method: 'GET',
    url,
    headers: BEARER,
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('text/html');
  const html = res.body;
  const tokenMatch = html.match(/name="consent_token" value="([^"]+)"/);
  expect(tokenMatch).not.toBeNull();
  return { html, consentToken: tokenMatch![1] };
}

describe('GET /oauth/authorize consent screen', () => {
  it('posts the form to the real Next route /api/oauth/consent', async () => {
    const { html } = await renderConsentScreen();
    expect(html).toContain('action="/api/oauth/consent"');
    expect(html).not.toContain('action="/oauth/consent"');
  });

  it('embeds a consent_token and no spoofable user_id field', async () => {
    const { html } = await renderConsentScreen();
    expect(html).toContain('name="consent_token"');
    expect(html).not.toContain('name="user_id"');
  });

  it('still 401s without any session', async () => {
    const res = await app.inject({ method: 'GET', url: AUTHORIZE_QUERY });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /oauth/authorize auto-approve encodes state (RFC 6749 §4.1.2)', () => {
  it('percent-encodes a hostile state so the RP callback parses exactly one state param', async () => {
    db.oAuthConsent.findUnique.mockResolvedValue({
      scopes: ['openid', 'profile', 'email'],
    } as never);
    const res = await app.inject({
      method: 'GET',
      url: authorizeQueryWithState(SPECIAL_STATE),
      headers: BEARER,
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers['location'] as string;
    expect(location.startsWith('https://app.test.com/callback?code=ac_mock_')).toBe(true);
    expectStateRoundTrips(location);
  });
});

describe('POST /oauth/consent with consent_token (browser form)', () => {
  const formBody = (consentToken: string, overrides: Record<string, string> = {}) => ({
    action: 'approve',
    consent_token: consentToken,
    client_id: 'client-1',
    redirect_uri: 'https://app.test.com/callback',
    scope: 'openid profile email',
    state: 'xyz',
    code_challenge: 'challenge-abc',
    code_challenge_method: 'S256',
    nonce: 'nonce-123',
    ...overrides,
  });

  it('approving mints an auth code and 302s to the registered redirect_uri', async () => {
    const { consentToken } = await renderConsentScreen();
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: formBody(consentToken),
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers['location'] as string;
    expect(location.startsWith('https://app.test.com/callback?code=ac_mock_')).toBe(true);
    expect(location).toContain('state=xyz');
    // The auth code is bound to the TOKEN's user and PKCE, not the form fields
    expect(db.authorizationCode.create).toHaveBeenCalledTimes(1);
    const created = db.authorizationCode.create.mock.calls[0][0].data;
    expect(created.userId).toBe('user-1');
    expect(created.codeChallenge).toBe('challenge-abc');
    expect(created.nonce).toBe('nonce-123');
    // Consent is recorded for the token's user
    expect(db.oAuthConsent.upsert).toHaveBeenCalledTimes(1);
  });

  it('approving percent-encodes a hostile state from the consent session', async () => {
    const { consentToken } = await renderConsentScreen(
      authorizeQueryWithState(SPECIAL_STATE),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: formBody(consentToken, { state: SPECIAL_STATE }),
    });
    expect(res.statusCode).toBe(302);
    expectStateRoundTrips(res.headers['location'] as string);
  });

  it('denying percent-encodes a hostile state on the access_denied redirect', async () => {
    const { consentToken } = await renderConsentScreen(
      authorizeQueryWithState(SPECIAL_STATE),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: formBody(consentToken, { action: 'deny', state: SPECIAL_STATE }),
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers['location'] as string;
    expect(location).toContain('error=access_denied');
    expectStateRoundTrips(location);
    expect(db.authorizationCode.create).not.toHaveBeenCalled();
  });

  it('denying 302s with ?error=access_denied and mints no code', async () => {
    const { consentToken } = await renderConsentScreen();
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: formBody(consentToken, { action: 'deny' }),
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toContain('error=access_denied');
    expect(res.headers['location']).toContain('state=xyz');
    expect(db.authorizationCode.create).not.toHaveBeenCalled();
  });

  it('rejects replay of the same consent_token (single-use)', async () => {
    const { consentToken } = await renderConsentScreen();
    const first = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: formBody(consentToken),
    });
    expect(first.statusCode).toBe(302);
    const replay = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: formBody(consentToken),
    });
    expect(replay.statusCode).toBe(401);
    expect(db.authorizationCode.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a tampered consent_token', async () => {
    const { consentToken } = await renderConsentScreen();
    const tampered = consentToken.slice(0, -2) + (consentToken.endsWith('aa') ? 'bb' : 'aa');
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: formBody(tampered),
    });
    expect(res.statusCode).toBe(401);
    expect(db.authorizationCode.create).not.toHaveBeenCalled();
  });

  it('rejects a consent_token bound to a different client_id (403)', async () => {
    const { consentToken } = await renderConsentScreen();
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: formBody(consentToken, { client_id: 'client-evil' }),
    });
    expect(res.statusCode).toBe(403);
    expect(db.authorizationCode.create).not.toHaveBeenCalled();
  });

  it('rejects a consent_token bound to a different redirect_uri (403)', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'client-1',
      redirectUris: ['https://app.test.com/callback', 'https://app.test.com/other'],
      allowedScopes: ['openid', 'profile', 'email'],
    } as never);
    const { consentToken } = await renderConsentScreen();
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: formBody(consentToken, { redirect_uri: 'https://app.test.com/other' }),
    });
    expect(res.statusCode).toBe(403);
    expect(db.authorizationCode.create).not.toHaveBeenCalled();
  });

  it('401s with no session at all', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: { action: 'approve', client_id: 'client-1' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /oauth/consent with Bearer token (programmatic clients, unchanged)', () => {
  it('approving with a Bearer <redacted> still works and keeps the AUTH-01 user_id check', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      headers: BEARER,
      payload: {
        action: 'approve',
        client_id: 'client-1',
        redirect_uri: 'https://app.test.com/callback',
        user_id: 'user-1',
        scope: 'openid profile email',
        state: 'xyz',
      },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toContain('code=ac_mock_');
  });

  it('still rejects a user_id that does not match the Bearer <redacted> (AUTH-01)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      headers: BEARER,
      payload: {
        action: 'approve',
        client_id: 'client-1',
        redirect_uri: 'https://app.test.com/callback',
        user_id: 'attacker-user',
        scope: 'openid profile email',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(db.authorizationCode.create).not.toHaveBeenCalled();
  });

  it('still 401s on an invalid Bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      headers: { authorization: 'Bearer ' }, // empty token -> MockTokenService returns null
      payload: { action: 'approve', consent_token: '' },
    });
    expect(res.statusCode).toBe(401);
  });
});
