// @vitest-environment node
// ============================================================================
// GET/PUT /settings/display — the account-roaming display settings.
//
// Contracts under test:
//   1. Auth is mandatory: no session means 401 on both verbs, and nothing is
//      read or written.
//   2. GET returns the stored triple, and the old defaults for a user who
//      never chose, with `stored` flags and a null stamp.
//   3. PUT validates: only the documented vocabularies are accepted, at
//      least one field is required, and a 400 writes nothing.
//   4. PUT is a real round-trip: a partial write persists, unrelated
//      `User.preferences` keys survive the merge, and the stamp advances.
//   5. The settings are per-user: one user's PUT never touches another
//      user's row.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import displaySettingsRoutes from '../routes/display-settings';

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
  await app.register(displaySettingsRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  users.clear();
  users.set('user-1', { id: 'user-1', preferences: {} });
  users.set('user-2', {
    id: 'user-2',
    preferences: {
      displayTheme: 'light',
      displayDensity: 'compact',
      aiIntent: 'deep',
      displaySettingsUpdatedAt: '2026-10-25T10:00:00.000Z',
    },
  });
});

describe('GET /settings/display', () => {
  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/settings/display' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns the defaults with empty flags for a user who never chose', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'GET', url: '/settings/display' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual({
      theme: 'dark',
      density: 'comfortable',
      aiIntent: 'auto',
      stored: { theme: false, density: false, aiIntent: false },
      updatedAt: null,
    });
    await app.close();
  });

  it('returns the stored triple with flags and stamp', async () => {
    const app = await buildApp('user-2');
    const res = await app.inject({ method: 'GET', url: '/settings/display' });
    expect(res.json().data).toEqual({
      theme: 'light',
      density: 'compact',
      aiIntent: 'deep',
      stored: { theme: true, density: true, aiIntent: true },
      updatedAt: '2026-10-25T10:00:00.000Z',
    });
    await app.close();
  });
});

describe('PUT /settings/display', () => {
  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'PUT',
      url: '/settings/display',
      payload: { theme: 'light' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects unknown values and empty bodies without writing', async () => {
    const app = await buildApp('user-1');
    for (const payload of [{ theme: 'midnight' }, { density: 'tight' }, { aiIntent: 'gpt' }, {}]) {
      const res = await app.inject({ method: 'PUT', url: '/settings/display', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(users.get('user-1')?.preferences).toEqual({});
    await app.close();
  });

  it('persists a partial write and keeps unrelated keys', async () => {
    users.get('user-1')!.preferences = { mailNotificationMode: 'important' };
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'PUT',
      url: '/settings/display',
      payload: { theme: 'system', aiIntent: 'balanced' },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.theme).toBe('system');
    expect(data.aiIntent).toBe('balanced');
    expect(data.density).toBe('comfortable');
    expect(data.stored).toEqual({ theme: true, density: false, aiIntent: true });
    expect(typeof data.updatedAt).toBe('string');
    const saved = users.get('user-1')!.preferences;
    expect(saved.mailNotificationMode).toBe('important');
    expect(saved.displayTheme).toBe('system');
    await app.close();
  });

  it('never touches another user’s row', async () => {
    const app = await buildApp('user-1');
    await app.inject({ method: 'PUT', url: '/settings/display', payload: { theme: 'dark' } });
    // user-2 still holds its own fixture values, untouched by user-1's write.
    expect(users.get('user-2')?.preferences.displayTheme).toBe('light');
    expect(users.get('user-2')?.preferences.displaySettingsUpdatedAt).toBe(
      '2026-10-25T10:00:00.000Z',
    );
    await app.close();
  });
});
