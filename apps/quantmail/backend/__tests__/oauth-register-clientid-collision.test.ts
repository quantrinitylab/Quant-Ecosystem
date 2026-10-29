// @vitest-environment node
// ============================================================================
// POST /oauth/register clientId-collision handling (oauth.ts)
//
// The register handler used to do a single prisma.oAuthClient.create with a
// generated clientId and no collision handling: on the (rare) duplicate key
// Prisma's P2002 escaped as a raw 500. The fix retries with a fresh
// clientId on a clientId-targeted P2002 (bounded attempts) and answers an
// honest OAuth2 `temporarily_unavailable` (503) when the attempts run out;
// non-P2002 failures still propagate, and a P2002 on any other target is
// not retried.
//
// HARNESS: registers the REAL oauthRoutes on a bare Fastify app and mocks
// only the deep @quant/auth specifiers it consumes (prisma, secrets,
// token-service, secure-random) — exactly as the other oauth suites do.
// generateId is mocked with a per-prefix counter so each retry provably
// uses a FRESH clientId.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

vi.mock('@quant/auth/lib/prisma', () => {
  const p = {
    oAuthClient: { create: vi.fn(), findUnique: vi.fn() },
  };
  return { default: p, prisma: p };
});

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {}
  return { TokenService: MockTokenService };
});

vi.mock('@quant/auth/crypto/secure-random', () => {
  const counters = new Map<string, number>();
  return {
    generateId: vi.fn((prefix: string) => {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}${next}`;
    }),
  };
});

import { oauthRoutes } from '../routes/oauth';
import prismaDefaultImport from '@quant/auth/lib/prisma';

const db = vi.mocked(
  prismaDefaultImport as unknown as {
    oAuthClient: { create: ReturnType<typeof vi.fn> };
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

const p2002 = (target?: string[]) =>
  Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    ...(target ? { meta: { target } } : {}),
  });

const registerBody = {
  name: 'Collision Test App',
  redirect_uris: ['https://app.test.com/callback'],
  scopes: ['openid', 'profile', 'email'],
  is_confidential: true,
};

const register = () =>
  app.inject({ method: 'POST', url: '/oauth/register', payload: registerBody });

describe('POST /oauth/register clientId collision', () => {
  it('retries with a fresh clientId after a P2002 and succeeds', async () => {
    db.oAuthClient.create
      .mockRejectedValueOnce(p2002(['clientId']))
      .mockImplementationOnce(async (args: { data: { clientId: string } }) =>
        Promise.resolve({
          clientId: args.data.clientId,
          name: 'Collision Test App',
        } as never),
      );

    const res = await register();

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The two attempts used distinct, freshly generated clientIds, and the
    // response carries the id that actually won.
    const attemptedIds = db.oAuthClient.create.mock.calls.map(
      (call) => (call[0] as { data: { clientId: string } }).data.clientId,
    );
    expect(attemptedIds).toHaveLength(2);
    expect(new Set(attemptedIds).size).toBe(2);
    expect(body.client_id).toBe(attemptedIds[1]);
    expect(body.name).toBe('Collision Test App');
    // The plain-text secret is returned only on this success path.
    expect(typeof body.client_secret).toBe('string');
    expect(body.client_secret.startsWith('secret_')).toBe(true);
  });

  it('answers an honest 503 temporarily_unavailable when every attempt collides, never a 500', async () => {
    db.oAuthClient.create.mockRejectedValue(p2002(['clientId']));

    const res = await register();

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'temporarily_unavailable' });
    // Bounded: exactly 5 attempts, then it stops.
    expect(db.oAuthClient.create).toHaveBeenCalledTimes(5);
  });

  it('propagates a non-P2002 failure unchanged instead of retrying it', async () => {
    db.oAuthClient.create.mockRejectedValueOnce(new Error('database down'));

    const res = await register();

    expect(res.statusCode).toBe(500);
    expect(db.oAuthClient.create).toHaveBeenCalledTimes(1);
  });

  it('does not retry a P2002 on a different unique target', async () => {
    db.oAuthClient.create.mockRejectedValueOnce(p2002(['someOtherField']));

    const res = await register();

    expect(res.statusCode).toBe(500);
    expect(db.oAuthClient.create).toHaveBeenCalledTimes(1);
  });

  it('keeps the happy path to a single create returning id, secret and name', async () => {
    db.oAuthClient.create.mockImplementationOnce(async (args: { data: { clientId: string } }) =>
      Promise.resolve({
        clientId: args.data.clientId,
        name: 'Collision Test App',
      } as never),
    );

    const res = await register();

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const attemptedId = (db.oAuthClient.create.mock.calls[0][0] as { data: { clientId: string } })
      .data.clientId;
    expect(body.client_id).toBe(attemptedId);
    expect(body.name).toBe('Collision Test App');
    expect(typeof body.client_secret).toBe('string');
    expect(body.client_secret.startsWith('secret_')).toBe(true);
    expect(db.oAuthClient.create).toHaveBeenCalledTimes(1);
  });
});
