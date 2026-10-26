// @vitest-environment node
// ============================================================================
// Trust presentation for GET /oauth/authorize (routes/oauth.ts) + per-scope
// consent selection in POST /oauth/consent:
//
//   - the screen's identity is the REGISTERED display name, never the raw
//     client_id as the heading (raw client_id survives only as a small
//     technical "App ID" line);
//   - verification status is honest: first-party rows say "Built by
//     QuantMail", every other client says "Not verified by QuantMail" (the
//     schema has no verified flag to claim anything stronger);
//   - every requested scope renders a plain-language title + description,
//     never a raw scope token bullet; unknown scopes get an honest
//     "no plain-language description" fallback, never a fabricated one;
//   - the approve button reads "Continue as <signed-in user>";
//   - each scope is individually uncheckable (grant_0, grant_1, ...); the
//     POST handler grants only the checked session scopes, and checking
//     nothing is a denial (no consent row, no code).
//
// HARNESS: same as oauth-consent-flow.test.ts — the REAL `oauthRoutes` on a
// bare Fastify app, mocking only the deep @quant/auth specifiers.
// ============================================================================

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

import { oauthRoutes, describeConsentScope } from '../routes/oauth';
import prismaDefaultImport from '@quant/auth/lib/prisma';

const db = vi.mocked(
  prismaDefaultImport as unknown as {
    oAuthClient: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    oAuthConsent: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    authorizationCode: { create: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
  },
);

const THIRD_PARTY_CLIENT = {
  clientId: 'client-1',
  name: 'Example App',
  description: 'An example third-party app.',
  isFirstParty: false,
  redirectUris: ['https://app.test.com/callback'],
  allowedScopes: ['openid', 'profile', 'email', 'calendar.read'],
};

const FIRST_PARTY_CLIENT = {
  ...THIRD_PARTY_CLIENT,
  name: 'QuantMail Companion',
  description: 'Built by the QuantMail team.',
  isFirstParty: true,
};

const SIGNED_IN_USER = {
  id: 'user-1',
  displayName: 'Test User',
  username: 'testuser',
  email: 'user@test.com',
};

function authorizeUrl(scope: string) {
  return (
    '/oauth/authorize?response_type=code' +
    '&client_id=client-1' +
    '&redirect_uri=' +
    encodeURIComponent('https://app.test.com/callback') +
    '&scope=' +
    encodeURIComponent(scope) +
    '&state=xyz' +
    '&code_challenge=challenge-abc&code_challenge_method=S256&nonce=nonce-123'
  );
}

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
  db.oAuthClient.findUnique.mockResolvedValue(THIRD_PARTY_CLIENT as never);
  db.oAuthClient.create.mockImplementation(async (args: any) => args.data as never);
  db.oAuthConsent.findUnique.mockResolvedValue(null);
  db.oAuthConsent.upsert.mockResolvedValue({} as never);
  db.authorizationCode.create.mockImplementation(async (args: any) => args.data as never);
  db.user.findUnique.mockResolvedValue(SIGNED_IN_USER as never);
});

const BEARER = { authorization: 'Bearer test-token' };

async function renderConsentScreen(scope = 'openid profile email') {
  const res = await app.inject({
    method: 'GET',
    url: authorizeUrl(scope),
    headers: BEARER,
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('text/html');
  const html = res.body;
  const tokenMatch = html.match(/name="consent_token" value="([^"]+)"/);
  expect(tokenMatch).not.toBeNull();
  return { html, consentToken: tokenMatch![1] };
}

const consentForm = (consentToken: string, overrides: Record<string, string> = {}) => ({
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

describe('consent screen identity (no raw client_id as the app)', () => {
  it('heads the screen with the registered display name, not the client_id', async () => {
    const { html } = await renderConsentScreen();
    expect(html).toContain('Example App wants to access your QuantMail account');
    expect(html).not.toContain('<strong>client-1</strong> wants to access');
    // The raw id survives only as a small technical identifier.
    expect(html).toContain('App ID: client-1');
  });

  it('shows the registered description and redirect target', async () => {
    const { html } = await renderConsentScreen();
    expect(html).toContain('An example third-party app.');
    expect(html).toContain('https://app.test.com/callback');
  });

  it('labels a third-party client as not verified, never verified', async () => {
    const { html } = await renderConsentScreen();
    expect(html).toContain('Not verified by QuantMail');
    expect(html).not.toContain('Built by QuantMail');
  });

  it('labels a first-party client as built by QuantMail', async () => {
    db.oAuthClient.findUnique.mockResolvedValue(FIRST_PARTY_CLIENT as never);
    const { html } = await renderConsentScreen();
    expect(html).toContain('QuantMail Companion wants to access your QuantMail account');
    expect(html).toContain('Built by QuantMail');
    expect(html).not.toContain('Not verified by QuantMail');
  });

  it('falls back to the client_id when the client has no registered name', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'client-1',
      redirectUris: ['https://app.test.com/callback'],
      allowedScopes: ['openid', 'profile', 'email'],
    } as never);
    const { html } = await renderConsentScreen();
    expect(html).toContain('client-1 wants to access your QuantMail account');
    expect(html).toContain('Not verified by QuantMail');
  });
});

describe('consent screen permissions (plain language, not raw tokens)', () => {
  it('renders a plain-language title + description per scope', async () => {
    const { html } = await renderConsentScreen();
    expect(html).toContain('Sign you in');
    expect(html).toContain('See your personal info');
    expect(html).toContain('See your email address');
    expect(html).not.toContain('• openid');
    expect(html).not.toContain('• profile');
    expect(html).not.toContain('• email');
  });

  it('renders one checked checkbox per scope', async () => {
    const { html } = await renderConsentScreen();
    expect(html).toContain('name="grant_0" value="openid" checked');
    expect(html).toContain('name="grant_1" value="profile" checked');
    expect(html).toContain('name="grant_2" value="email" checked');
  });

  it('labels the approve button "Continue as <signed-in user>"', async () => {
    const { html } = await renderConsentScreen();
    expect(html).toContain('Continue as Test User');
  });

  it('is honest about a scope with no plain-language description', async () => {
    const { html } = await renderConsentScreen('openid profile email calendar.read');
    expect(html).toContain('does not have a plain-language description');
    expect(html).toContain('calendar.read');
  });
});

describe('describeConsentScope unit', () => {
  it('describes the known OIDC scopes', () => {
    expect(describeConsentScope('openid').title).toBe('Sign you in');
    expect(describeConsentScope('profile').title).toBe('See your personal info');
    expect(describeConsentScope('email').title).toBe('See your email address');
  });

  it('never fabricates a description for an unknown scope', () => {
    const d = describeConsentScope('calendar.read');
    expect(d.description).toContain('does not have a plain-language description');
  });
});

describe('per-scope selection in POST /oauth/consent', () => {
  it('grants only the checked scopes (skipped profile)', async () => {
    const { consentToken } = await renderConsentScreen();
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: consentForm(consentToken, { grant_0: 'openid', grant_2: 'email' }),
    });
    expect(res.statusCode).toBe(302);
    expect(db.oAuthConsent.upsert).toHaveBeenCalledTimes(1);
    expect(db.oAuthConsent.upsert.mock.calls[0][0].update.scopes).toEqual([
      'openid',
      'email',
    ]);
    expect(db.authorizationCode.create.mock.calls[0][0].data.scopes).toEqual([
      'openid',
      'email',
    ]);
  });

  it('grants the full session scope when no grant_* key is present (old form)', async () => {
    const { consentToken } = await renderConsentScreen();
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: consentForm(consentToken),
    });
    expect(res.statusCode).toBe(302);
    expect(db.oAuthConsent.upsert.mock.calls[0][0].update.scopes).toEqual([
      'openid',
      'profile',
      'email',
    ]);
  });

  it('ignores a tampered grant value (index/value mismatch grants nothing)', async () => {
    const { consentToken } = await renderConsentScreen();
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: consentForm(consentToken, { grant_0: 'profile', grant_1: 'profile' }),
    });
    expect(res.statusCode).toBe(302);
    // grant_0='profile' does not match session scope[0]='openid', so only
    // the correctly-valued grant_1 survives.
    expect(db.oAuthConsent.upsert.mock.calls[0][0].update.scopes).toEqual(['profile']);
  });

  it('checking nothing is a denial: no consent row, no code', async () => {
    const { consentToken } = await renderConsentScreen();
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      payload: consentForm(consentToken, { grant_0: 'bogus-scope' }),
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toContain('error=access_denied');
    expect(db.oAuthConsent.upsert).not.toHaveBeenCalled();
    expect(db.authorizationCode.create).not.toHaveBeenCalled();
  });
});

describe('POST /oauth/register accepts a description', () => {
  it('persists and returns the registered description', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      payload: {
        name: 'Example App',
        description: 'An example third-party app.',
        redirect_uris: ['https://app.test.com/callback'],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.description).toBe('An example third-party app.');
    expect(db.oAuthClient.create.mock.calls[0][0].data.description).toBe(
      'An example third-party app.',
    );
  });
});
