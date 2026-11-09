// @vitest-environment node
// ============================================================================
// /notifications/mail-notification-label-overrides — the per-label
// notification overrides (Gmail's per-label "Notify for every message", plus
// the mute side).
//
// Contracts under test:
//   1. Auth is mandatory: no session means 401 on both verbs, and nothing is
//      read or written.
//   2. GET returns the stored overrides, and an empty map for a user who
//      never set any (labels follow the global mode).
//   3. PUT validates: only 'all' | 'none' values are accepted, and a map
//      larger than the cap is a 400 that writes nothing.
//   4. PUT replaces the whole map (a removed row is a real removal), and
//      unrelated `User.preferences` keys survive the merge.
//   5. PUT drops ids that are not the caller's labels, stores only the owned
//      subset, and reports the dropped ids — it never stores an override
//      that could never match the caller's mail.
//   6. Overrides are per-user: one caller's PUT never touches another user's
//      map, and a caller cannot launder another user's label id into their
//      own map.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import notificationRoutes from '../routes/notifications';

const users = new Map<string, { id: string; preferences: Record<string, unknown> }>();
const labels = new Map<string, { id: string; userId: string }>();

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
    label: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { userId: string; id: { in: string[] } };
        }): Promise<Array<{ id: string }>> => {
          return where.id.in
            .map((id) => labels.get(id))
            .filter((label) => label && label.userId === where.userId)
            .map((label) => ({ id: label!.id }));
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
  labels.clear();
  users.set('user-1', { id: 'user-1', preferences: {} });
  users.set('user-2', {
    id: 'user-2',
    preferences: { mailNotificationLabelOverrides: { 'lbl-a': 'none' } },
  });
  labels.set('lbl-a', { id: 'lbl-a', userId: 'user-1' });
  labels.set('lbl-b', { id: 'lbl-b', userId: 'user-1' });
  labels.set('lbl-other', { id: 'lbl-other', userId: 'user-2' });
});

const URL = '/notifications/mail-notification-label-overrides';

describe('GET /notifications/mail-notification-label-overrides', () => {
  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns an empty map for a user who never set any', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { overrides: {} } });
    await app.close();
  });

  it('returns the stored map', async () => {
    const app = await buildApp('user-2');
    const res = await app.inject({ method: 'GET', url: URL });
    expect(res.json()).toEqual({ success: true, data: { overrides: { 'lbl-a': 'none' } } });
    await app.close();
  });
});

describe('PUT /notifications/mail-notification-label-overrides', () => {
  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'PUT',
      url: URL,
      payload: { overrides: { 'lbl-a': 'all' } },
    });
    expect(res.statusCode).toBe(401);
    expect(users.get('user-1')!.preferences).toEqual({});
    await app.close();
  });

  it.each([
    { overrides: { 'lbl-a': 'everything' } },
    { overrides: { 'lbl-a': '' } },
    { overrides: { 'lbl-a': null } },
    {},
    { overrides: 'all' },
    { overrides: null },
  ])('rejects %p with a 400 and writes nothing', async (payload) => {
    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'PUT', url: URL, payload });
    expect(res.statusCode).toBe(400);
    expect(users.get('user-1')!.preferences).toEqual({});
    await app.close();
  });

  it('rejects a map larger than the cap', async () => {
    const oversized: Record<string, string> = {};
    for (let i = 0; i < 201; i += 1) {
      const id = `lbl-x-${i}`;
      labels.set(id, { id, userId: 'user-1' });
      oversized[id] = 'all';
    }
    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'PUT', url: URL, payload: { overrides: oversized } });
    expect(res.statusCode).toBe(400);
    expect(users.get('user-1')!.preferences).toEqual({});
    await app.close();
  });

  it('persists the map, replaces (not merges) it, and preserves unrelated keys', async () => {
    users.get('user-1')!.preferences = {
      theme: 'dark',
      mailNotificationMode: 'important',
      mailNotificationLabelOverrides: { 'lbl-a': 'none' },
    };
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'PUT',
      url: URL,
      payload: { overrides: { 'lbl-b': 'all' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { overrides: { 'lbl-b': 'all' }, dropped: [] },
    });
    expect(users.get('user-1')!.preferences).toEqual({
      theme: 'dark',
      mailNotificationMode: 'important',
      mailNotificationLabelOverrides: { 'lbl-b': 'all' },
    });
    const get = await app.inject({ method: 'GET', url: URL });
    expect(get.json()).toEqual({ success: true, data: { overrides: { 'lbl-b': 'all' } } });
    await app.close();
  });

  it('an empty map clears all overrides', async () => {
    users.get('user-1')!.preferences = { mailNotificationLabelOverrides: { 'lbl-a': 'none' } };
    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'PUT', url: URL, payload: { overrides: {} } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { overrides: {}, dropped: [] } });
    await app.close();
  });

  it("drops ids that are not the caller's labels and reports them", async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'PUT',
      url: URL,
      payload: { overrides: { 'lbl-a': 'all', 'lbl-other': 'none', 'lbl-ghost': 'all' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { overrides: { 'lbl-a': 'all' }, dropped: ['lbl-other', 'lbl-ghost'] },
    });
    expect(users.get('user-1')!.preferences['mailNotificationLabelOverrides']).toEqual({
      'lbl-a': 'all',
    });
    await app.close();
  });

  it("is per-user: one caller cannot change another user's map", async () => {
    const app = await buildApp('user-1');
    await app.inject({ method: 'PUT', url: URL, payload: { overrides: { 'lbl-b': 'none' } } });
    expect(users.get('user-1')!.preferences['mailNotificationLabelOverrides']).toEqual({
      'lbl-b': 'none',
    });
    expect(users.get('user-2')!.preferences['mailNotificationLabelOverrides']).toEqual({
      'lbl-a': 'none',
    });
    await app.close();
  });
});
