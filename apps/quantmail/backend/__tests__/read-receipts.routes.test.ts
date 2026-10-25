// @vitest-environment node
// ============================================================================
// /read-receipts — the per-user read-receipts default (GET/PUT).
//
// Contracts under test:
//   1. Auth is mandatory: no session means 401 on both verbs, and nothing
//      is read or written.
//   2. GET returns the stored default, and the fail-open default true for a
//      user who never chose (the old tracked-by-default behaviour).
//   3. PUT validates: only a boolean `enabled` is accepted; anything else
//      is a 400 that writes nothing.
//   4. PUT is a real round-trip: the value persists, and unrelated
//      `User.preferences` keys survive the merge.
//   5. The setting is per-user: one user's PUT never touches another
//      user's row.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import readReceiptsRoutes from '../routes/read-receipts';

const users = new Map<string, { id: string; preferences: Record<string, unknown> }>();

function fakePrisma() {
  return {
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }): Promise<{ preferences: unknown } | null> => {
          const user = users.get(where.id);
          return user ? { preferences: user.preferences } : null;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { preferences: unknown };
        }): Promise<{ id: string }> => {
          const user = users.get(where.id);
          if (!user) throw new Error('user not found');
          user.preferences = data.preferences as Record<string, unknown>;
          return { id: where.id };
        },
      ),
    },
  };
}

async function buildApp(userId: string | null) {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', fakePrisma() as never);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(readReceiptsRoutes, { prefix: '/read-receipts' });
  await app.ready();
  return app;
}

beforeEach(() => {
  users.clear();
  users.set('user-1', { id: 'user-1', preferences: {} });
  users.set('user-2', { id: 'user-2', preferences: { readReceiptsEnabled: false } });
});

describe('GET /read-receipts', () => {
  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/read-receipts' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns the fail-open default for a user who never chose', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'GET', url: '/read-receipts' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.enabled).toBe(true);
    await app.close();
  });

  it('returns the stored default', async () => {
    const app = await buildApp('user-2');
    const res = await app.inject({ method: 'GET', url: '/read-receipts' });
    expect(res.json().data.enabled).toBe(false);
    await app.close();
  });
});

describe('PUT /read-receipts', () => {
  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'PUT',
      url: '/read-receipts',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects a non-boolean enabled and writes nothing', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'PUT',
      url: '/read-receipts',
      payload: { enabled: 'off' },
    });
    expect(res.statusCode).toBe(400);
    expect(users.get('user-1')!.preferences).toEqual({});
    await app.close();
  });

  it('persists the value and preserves unrelated preference keys', async () => {
    users.get('user-1')!.preferences = { mailNotificationMode: 'important' };
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'PUT',
      url: '/read-receipts',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.enabled).toBe(false);
    expect(users.get('user-1')!.preferences).toEqual({
      mailNotificationMode: 'important',
      readReceiptsEnabled: false,
    });
    // The other user's row is untouched.
    expect(users.get('user-2')!.preferences).toEqual({ readReceiptsEnabled: false });
    await app.close();
  });
});
