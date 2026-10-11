// @vitest-environment node
// ============================================================================
// GET /oauth/grants + DELETE /oauth/grants/:clientId (oauth.ts)
//
// The security page's "Connected Applications" tab used to hardcode "No
// third-party apps connected" and assert that no app had email/profile
// permission — without ever asking the server. These endpoints are the real
// backing: list the signed-in user's OAuth consents joined to client metadata,
// and revoke one grant with an ownership check.
//
// HARNESS: registers the REAL oauthRoutes on a bare Fastify app and mocks only
// the deep @quant/auth specifiers it consumes (prisma, secrets,
// token-service) — exactly as the other oauth suites do.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

vi.mock('@quant/auth/lib/prisma', () => {
  const p = {
    oAuthClient: { findMany: vi.fn() },
    oAuthConsent: { findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  };
  return { default: p, prisma: p };
});

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {
    async validateAccessToken(token: string) {
      return token === 'valid-token'
        ? { id: 'user-1', sub: 'user-1', email: 'user@test.com' }
        : null;
    }
  }
  return { TokenService: MockTokenService };
});

import { oauthRoutes } from '../routes/oauth';
import prismaDefaultImport from '@quant/auth/lib/prisma';

const db = vi.mocked(
  prismaDefaultImport as unknown as {
    oAuthClient: { findMany: ReturnType<typeof vi.fn> };
    oAuthConsent: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  },
);

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
});

const authHeaders = { authorization: 'Bearer valid-token' };

const consentRow = {
  id: 'consent-1',
  userId: 'user-1',
  clientId: 'client_abc',
  scopes: ['openid', 'profile', 'email'],
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};

const clientRow = {
  id: 'oauth-client-1',
  clientId: 'client_abc',
  name: 'Demo Calendar Sync',
  description: 'Syncs your calendar events',
  isFirstParty: false,
};

describe('GET /oauth/grants', () => {
  it('401s without a bearer token', async () => {
    db.oAuthConsent.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: 'GET', url: '/oauth/grants' });
    expect(res.statusCode).toBe(401);
    // The database must not be consulted for an unauthenticated caller.
    expect(db.oAuthConsent.findMany).not.toHaveBeenCalled();
  });

  it('lists the signed-in user\'s grants with client metadata, scopes and granted-at', async () => {
    db.oAuthConsent.findMany.mockResolvedValue([consentRow]);
    db.oAuthClient.findMany.mockResolvedValue([clientRow]);

    const res = await app.inject({ method: 'GET', url: '/oauth/grants', headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(db.oAuthConsent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      clientId: 'client_abc',
      clientName: 'Demo Calendar Sync',
      clientDescription: 'Syncs your calendar events',
      isFirstParty: false,
      scopes: ['openid', 'profile', 'email'],
    });
    expect(new Date(body.data[0].grantedAt).toISOString()).toBe(
      '2026-09-01T10:00:00.000Z',
    );
  });

  it('returns an empty list when the user has no grants (the only honest empty state)', async () => {
    db.oAuthConsent.findMany.mockResolvedValue([]);
    db.oAuthClient.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/oauth/grants', headers: authHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: [] });
  });

  it('falls back to the raw client_id when the client registration is gone', async () => {
    db.oAuthConsent.findMany.mockResolvedValue([consentRow]);
    db.oAuthClient.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/oauth/grants', headers: authHeaders });
    const grant = res.json().data[0];
    expect(grant.clientName).toBe('client_abc');
    expect(grant.clientDescription).toBeNull();
  });
});

describe('DELETE /oauth/grants/:clientId', () => {
  it('401s without a bearer token', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/oauth/grants/client_abc' });
    expect(res.statusCode).toBe(401);
    expect(db.oAuthConsent.findFirst).not.toHaveBeenCalled();
  });

  it('deletes the consent row scoped to the authenticated user (ownership check)', async () => {
    db.oAuthConsent.findFirst.mockResolvedValue(consentRow);
    db.oAuthConsent.delete.mockResolvedValue(consentRow);

    const res = await app.inject({
      method: 'DELETE',
      url: '/oauth/grants/client_abc',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(db.oAuthConsent.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', clientId: 'client_abc' },
    });
    expect(db.oAuthConsent.delete).toHaveBeenCalledWith({ where: { id: 'consent-1' } });
    expect(res.json()).toEqual({
      success: true,
      data: { revoked: true, clientId: 'client_abc' },
    });
  });

  it('404s when the grant does not belong to the caller — nothing is deleted', async () => {
    db.oAuthConsent.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'DELETE',
      url: '/oauth/grants/client_other',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('GRANT_NOT_FOUND');
    expect(db.oAuthConsent.delete).not.toHaveBeenCalled();
  });
});
