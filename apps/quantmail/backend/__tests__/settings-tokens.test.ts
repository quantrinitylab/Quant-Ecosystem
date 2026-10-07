// @vitest-environment node

import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as jose from 'jose';
import { authPlugin, errorHandlerPlugin } from '@quant/server-core';
import settingsTokenRoutes from '../routes/settings-tokens';

const JWT_SECRET = 'test-secret-key-that-is-long-enough-for-hs256';

describe('PAT settings routes', () => {
  const record = {
    id: 'pat-1',
    tokenId: 'a'.repeat(24),
    tokenHash: 'b'.repeat(64),
    userId: 'user-1',
    name: 'Laptop',
    scopes: ['repo:read'],
    expiresAt: new Date(Date.now() + 86_400_000),
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const signToken = async (lastStrongAuthAt?: number) => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const claims: Record<string, unknown> = {
      email: 'user1@example.com',
      username: 'user1',
      role: 'user',
      scopes: [],
      app: 'quantmail',
    };
    if (lastStrongAuthAt !== undefined) claims['lastStrongAuthAt'] = lastStrongAuthAt;
    return new jose.SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setIssuer('quantmail')
      .setAudience('quant-ecosystem')
      .setJti(`pat-test-${Math.random().toString(36).slice(2)}`)
      .setSubject('user-1')
      .sign(secret);
  };

  async function build(options?: { authenticated?: boolean; lastStrongAuthAt?: number }) {
    const authenticated = options?.authenticated ?? true;
    const prisma = {
      personalAccessToken: {
        create: vi.fn(async ({ data }) => ({ ...record, ...data })),
        findMany: vi.fn(async () => [record]),
        findFirst: vi.fn(async () => record),
        update: vi.fn(async ({ data }) => ({ ...record, ...data })),
      },
    };
    const app = Fastify();
    await app.register(errorHandlerPlugin);
    // Production wiring: the server-core auth plugin (with its requireStepUp
    // decoration) is registered by createApp before any route module.
    await app.register(authPlugin, {
      jwtSecret: JWT_SECRET,
      jwtIssuer: 'quantmail',
      jwtAudience: 'quant-ecosystem',
    });
    app.decorate('prisma', prisma as never);
    // Mirror production (server-core createApp): a global onRequest hook
    // authenticates every non-public route and populates request.auth. The
    // step-up-guarded POST additionally runs requireStepUp as its preHandler.
    app.addHook('onRequest', async (request, reply) => {
      await app.requireAuth()(request, reply);
    });
    await app.register(settingsTokenRoutes);
    await app.ready();
    const headers: Record<string, string> = {};
    if (authenticated) {
      const token = await signToken(options?.lastStrongAuthAt ?? Math.floor(Date.now() / 1000));
      headers['authorization'] = `Bearer ${token}`;
    }
    return { app, prisma, headers };
  }

  beforeEach(() => vi.restoreAllMocks());

  it('creates a token and returns the plaintext exactly once', async () => {
    const { app, prisma, headers } = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/settings/tokens',
      headers,
      payload: {
        name: 'Laptop',
        scopes: ['repo:read', 'repo:write'],
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.token).toMatch(/^qcp_[0-9a-f]{24}_[A-Za-z0-9_-]{43}$/);
    expect(prisma.personalAccessToken.create).toHaveBeenCalledOnce();
    await app.close();
  });

  it('lists metadata without returning tokenHash', async () => {
    const { app, headers } = await build();
    const response = await app.inject({ method: 'GET', url: '/settings/tokens', headers });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('tokenHash');
    expect(response.body).not.toContain(record.tokenHash);
    await app.close();
  });

  it('revokes only a token belonging to the current user', async () => {
    const { app, prisma, headers } = await build();
    const response = await app.inject({ method: 'DELETE', url: '/settings/tokens/pat-1', headers });
    expect(response.statusCode).toBe(200);
    expect(prisma.personalAccessToken.findFirst).toHaveBeenCalledWith({
      where: { id: 'pat-1', userId: 'user-1' },
    });
    expect(prisma.personalAccessToken.update).toHaveBeenCalledOnce();
    await app.close();
  });

  it('rejects requests without an authenticated session', async () => {
    const { app } = await build({ authenticated: false });
    const response = await app.inject({ method: 'GET', url: '/settings/tokens' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('requires step-up for token creation when the last strong auth is stale', async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const { app, prisma, headers } = await build({ lastStrongAuthAt: stale });
    const response = await app.inject({
      method: 'POST',
      url: '/settings/tokens',
      headers,
      payload: {
        name: 'Laptop',
        scopes: ['repo:read'],
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('STEP_UP_REQUIRED');
    expect(body.stepUp.required).toBe(true);
    expect(body.stepUp.howTo).toEqual(
      expect.arrayContaining([expect.stringContaining('/auth/login')]),
    );
    expect(prisma.personalAccessToken.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not step-up-guard the read-only token list', async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const { app, headers } = await build({ lastStrongAuthAt: stale });
    const response = await app.inject({ method: 'GET', url: '/settings/tokens', headers });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
