// @vitest-environment node

import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import settingsTokenRoutes from '../routes/settings-tokens';

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

  async function build(authenticated = true) {
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
    app.decorate('prisma', prisma as never);
    if (authenticated) {
      app.addHook('onRequest', async (request) => {
        (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
      });
    }
    await app.register(settingsTokenRoutes);
    await app.ready();
    return { app, prisma };
  }

  beforeEach(() => vi.restoreAllMocks());

  it('creates a token and returns the plaintext exactly once', async () => {
    const { app, prisma } = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/settings/tokens',
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
    const { app } = await build();
    const response = await app.inject({ method: 'GET', url: '/settings/tokens' });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('tokenHash');
    expect(response.body).not.toContain(record.tokenHash);
    await app.close();
  });

  it('revokes only a token belonging to the current user', async () => {
    const { app, prisma } = await build();
    const response = await app.inject({ method: 'DELETE', url: '/settings/tokens/pat-1' });
    expect(response.statusCode).toBe(200);
    expect(prisma.personalAccessToken.findFirst).toHaveBeenCalledWith({
      where: { id: 'pat-1', userId: 'user-1' },
    });
    expect(prisma.personalAccessToken.update).toHaveBeenCalledOnce();
    await app.close();
  });

  it('rejects requests without an authenticated session', async () => {
    const { app } = await build(false);
    const response = await app.inject({ method: 'GET', url: '/settings/tokens' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
