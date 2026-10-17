// @vitest-environment node
// ============================================================================
// /notifications/mail-notification-mode — the per-user "important mail only"
// mode (GET/PUT).
//
// Contracts under test:
//   1. Auth is mandatory: no session means 401 on both verbs, and nothing is
//      read or written.
//   2. GET returns the stored mode, and the fail-open default 'all' for a
//      user who never chose (the old every-mail behaviour).
//   3. PUT validates: only 'all' | 'important' | 'off' are accepted; anything
//      else is a 400 that writes nothing.
//   4. PUT is a real round-trip: the mode persists, and unrelated
//      `User.preferences` keys survive the merge.
//   5. The mode is per-user: one user's PUT never touches another user's row.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import notificationRoutes from '../routes/notifications';

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
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.ready();
  return app;
}

beforeEach(() => {
  users.clear();
  users.set('user-1', { id: 'user-1', preferences: {} });
  users.set('user-2', { id: 'user-2', preferences: { mailNotificationMode: 'important' } });
});

describe('GET /notifications/mail-notification-mode', () => {
  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/notifications/mail-notification-mode' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns the fail-open default for a user who never chose', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'GET', url: '/notifications/mail-notification-mode' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { mode: 'all' } });
    await app.close();
  });

  it('returns the stored mode', async () => {
    const app = await buildApp('user-2');
    const res = await app.inject({ method: 'GET', url: '/notifications/mail-notification-mode' });
    expect(res.json()).toEqual({ success: true, data: { mode: 'important' } });
    await app.close();
  });
});

describe('PUT /notifications/mail-notification-mode', () => {
  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'PUT',
      url: '/notifications/mail-notification-mode',
      payload: { mode: 'off' },
    });
    expect(res.statusCode).toBe(401);
    expect(users.get('user-1')!.preferences).toEqual({});
    await app.close();
  });

  it.each([{ mode: 'everything' }, { mode: '' }, {}, { mode: null }, { mode: 'ALL' }])(
    'rejects %p with a 400 and writes nothing',
    async (payload) => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'PUT',
        url: '/notifications/mail-notification-mode',
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(users.get('user-1')!.preferences).toEqual({});
      await app.close();
    },
  );

  it('persists the mode and preserves unrelated preference keys', async () => {
    users.get('user-1')!.preferences = { theme: 'dark' };
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'PUT',
      url: '/notifications/mail-notification-mode',
      payload: { mode: 'important' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { mode: 'important' } });
    expect(users.get('user-1')!.preferences).toEqual({
      theme: 'dark',
      mailNotificationMode: 'important',
    });
    const get = await app.inject({ method: 'GET', url: '/notifications/mail-notification-mode' });
    expect(get.json()).toEqual({ success: true, data: { mode: 'important' } });
    await app.close();
  });

  it('is per-user: one caller cannot change another user\'s mode', async () => {
    const app = await buildApp('user-1');
    await app.inject({
      method: 'PUT',
      url: '/notifications/mail-notification-mode',
      payload: { mode: 'off' },
    });
    expect(users.get('user-1')!.preferences['mailNotificationMode']).toBe('off');
    expect(users.get('user-2')!.preferences['mailNotificationMode']).toBe('important');
    await app.close();
  });
});
