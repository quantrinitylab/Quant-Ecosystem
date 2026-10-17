// @vitest-environment node
/**
 * Step-up coverage for mail-filter writes with a forwarding action.
 *
 * Gmail forces a 2-Step Verification challenge when you create/edit a filter
 * with a forwarding action — a hijacked session must not silently set up
 * mail exfiltration. POST / and PUT /:id in mail-filters.ts therefore delegate
 * to `fastify.requireStepUp()` when the request body carries a `forwardTo`
 * action, and to plain `requireAuth()` otherwise.
 *
 * Stale sessions get 401 STEP_UP_REQUIRED on forwarding writes; fresh ones
 * pass; non-forwarding writes are unaffected.
 */

import Fastify from 'fastify';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as jose from 'jose';

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret-that-is-long-enough',
  getJwtRefreshSecret: () => 'test-refresh-secret-that-is-long-enough',
}));

import { authPlugin } from '@quant/server-core';
import mailFiltersRoutes from '../routes/mail-filters';

const JWT_SECRET = 'test-access-secret-that-is-long-enough';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    mailFilter: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('mail-filter forwarding writes step-up', () => {
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
      .setJti(`filter-test-${Math.random().toString(36).slice(2)}`)
      .setSubject('user-1')
      .sign(secret);
  };

  const build = async () => {
    const app = Fastify();
    await app.register(authPlugin, {
      jwtSecret: JWT_SECRET,
      jwtIssuer: 'quantmail',
      jwtAudience: 'quant-ecosystem',
    });
    // Mirror production: global hook authenticates and populates request.auth.
    app.addHook('onRequest', async (request, reply) => {
      await app.requireAuth()(request, reply);
    });
    app.decorate('prisma', mocks.prisma as unknown as never);
    await app.register(mailFiltersRoutes);
    await app.ready();
    return app;
  };

  const forwardPayload = () => ({
    name: 'Forward invoices',
    conditions: [{ from: 'billing@vendor.com' }],
    actions: [{ forwardTo: 'backup@quantmail.in' }],
  });

  const plainPayload = () => ({
    name: 'Archive newsletters',
    conditions: [{ from: 'news@example.com' }],
    actions: [{ archive: true }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ email: 'user1@example.com' });
    mocks.prisma.mailFilter.create.mockImplementation(async ({ data }: any) => ({
      id: 'filter-new',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mocks.prisma.mailFilter.findUnique.mockResolvedValue({
      id: 'filter-1',
      userId: 'user-1',
      name: 'Existing',
      conditions: [],
      actions: [],
    });
    mocks.prisma.mailFilter.update.mockImplementation(async ({ data }: any) => ({
      id: 'filter-1',
      userId: 'user-1',
      name: 'Existing',
      ...data,
      updatedAt: new Date(),
    }));
  });

  it('creates a forwarding filter when the last strong auth is fresh', async () => {
    const app = await build();
    const token = await signToken(Math.floor(Date.now() / 1000) - 60);
    const response = await app.inject({
      method: 'POST',
      url: '/',
      headers: { authorization: `Bearer ${token}` },
      payload: forwardPayload(),
    });
    expect(response.statusCode).toBe(201);
    expect(mocks.prisma.mailFilter.create).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('rejects a forwarding filter create with 401 STEP_UP_REQUIRED when stale', async () => {
    const app = await build();
    const token = await signToken(Math.floor(Date.now() / 1000) - 3600);
    const response = await app.inject({
      method: 'POST',
      url: '/',
      headers: { authorization: `Bearer ${token}` },
      payload: forwardPayload(),
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('STEP_UP_REQUIRED');
    expect(body.stepUp.required).toBe(true);
    expect(body.stepUp.howTo).toEqual(
      expect.arrayContaining([expect.stringContaining('/auth/login')]),
    );
    // The exfiltration write must never execute.
    expect(mocks.prisma.mailFilter.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a forwarding filter create when the claim is missing (fail closed)', async () => {
    const app = await build();
    const token = await signToken(undefined);
    const response = await app.inject({
      method: 'POST',
      url: '/',
      headers: { authorization: `Bearer ${token}` },
      payload: forwardPayload(),
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('STEP_UP_REQUIRED');
    expect(mocks.prisma.mailFilter.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('still creates a non-forwarding filter on a stale session (no step-up)', async () => {
    const app = await build();
    const token = await signToken(Math.floor(Date.now() / 1000) - 3600);
    const response = await app.inject({
      method: 'POST',
      url: '/',
      headers: { authorization: `Bearer ${token}` },
      payload: plainPayload(),
    });
    expect(response.statusCode).toBe(201);
    expect(mocks.prisma.mailFilter.create).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('updates a filter to add forwarding with fresh step-up', async () => {
    const app = await build();
    const token = await signToken(Math.floor(Date.now() / 1000) - 60);
    const response = await app.inject({
      method: 'PUT',
      url: '/filter-1',
      headers: { authorization: `Bearer ${token}` },
      payload: { actions: [{ forwardTo: 'backup@quantmail.in' }] },
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.prisma.mailFilter.update).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('rejects a forwarding filter update with 401 STEP_UP_REQUIRED when stale', async () => {
    const app = await build();
    const token = await signToken(Math.floor(Date.now() / 1000) - 3600);
    const response = await app.inject({
      method: 'PUT',
      url: '/filter-1',
      headers: { authorization: `Bearer ${token}` },
      payload: { actions: [{ forwardTo: 'backup@quantmail.in' }] },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('STEP_UP_REQUIRED');
    expect(mocks.prisma.mailFilter.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('still updates a filter without forwarding actions on a stale session', async () => {
    const app = await build();
    const token = await signToken(Math.floor(Date.now() / 1000) - 3600);
    const response = await app.inject({
      method: 'PUT',
      url: '/filter-1',
      headers: { authorization: `Bearer ${token}` },
      payload: { enabled: false },
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.prisma.mailFilter.update).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
