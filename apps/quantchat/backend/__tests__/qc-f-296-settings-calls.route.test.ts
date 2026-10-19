// ============================================================================
// QC-F-296 — settings contract `calls` section route tests
// (specialist-qc-f-296-buildprep.md §8: NC-296-1, NC-296-2, PIN-296-14).
//
// Before this fix the settings contract had NO call-quality section at
// all: PUT {calls:{lowDataMode:true}} was rejected 400 by the .strict()
// schema (the key was unknown) and GET never returned a `calls` field,
// so a "Use less data for calls" preference had nowhere real to live.
//
// Harness mirrors qc-f-317-settings-block.routes.test.ts: bare Fastify +
// errorHandlerPlugin + a stable fake Prisma (module-level identities,
// no fresh-identity mocks). The websocket module is stubbed because
// settings.ts imports closeLiveSocketsForUser from it.
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { errorHandlerPlugin } from '@quant/server-core';

vi.mock('../routes/websocket', () => ({
  closeLiveSocketsForUser: vi.fn(),
}));

import settingsRoutes from '../routes/settings';

const OWNER = 'user-owner';
const FRESH = 'user-fresh';

interface FakeUserRow {
  preferences: unknown;
  displayName: string;
  username: string;
  deletedAt: Date | null;
}

function makeStore(seed: Record<string, Partial<FakeUserRow>>) {
  const rows = new Map<string, FakeUserRow>();
  for (const [id, partial] of Object.entries(seed)) {
    rows.set(id, {
      preferences: null,
      displayName: `Name of ${id}`,
      username: `name-of-${id}`,
      deletedAt: null,
      ...partial,
    });
  }
  const update = vi.fn(
    async ({ where, data }: { where: { id: string }; data: { preferences: unknown } }) => {
      const row = rows.get(where.id);
      if (row) row.preferences = data.preferences;
      return row;
    },
  );
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id);
        return row ? { id: where.id, ...row } : null;
      }),
      update,
    },
  };
  const prismaWithTx = Object.assign(prisma, {
    $transaction: async <T,>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> =>
      fn(prisma),
  });
  return { rows, update, prisma: prismaWithTx as unknown as PrismaClient };
}

type Store = ReturnType<typeof makeStore>;

async function buildApp(store: Store, authUserId?: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', store.prisma as never);
  if (authUserId) {
    app.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
      done();
    });
  }
  await app.register(settingsRoutes, { prefix: '/settings' });
  await app.ready();
  return app;
}

describe('QC-F-296: settings `calls` section (low-data preference)', () => {
  let app: FastifyInstance;
  let store: Store;

  beforeEach(() => {
    store = makeStore({
      [OWNER]: {
        preferences: {
          chatSettings: {
            privacy: { whoCanMessage: 'everyone', showOnlineStatus: true },
            theme: 'dark',
            blockedUsers: [],
          },
        },
      },
      [FRESH]: { preferences: null },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('NC-296-1: PUT {calls:{lowDataMode:true}} succeeds and GET reads it back; other sections preserved', async () => {
    app = await buildApp(store, OWNER);
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { calls: { lowDataMode: true } },
    });
    expect(put.statusCode).toBe(200);
    const putBody = put.json();
    expect(putBody.success).toBe(true);
    expect(putBody.data.calls).toEqual({ lowDataMode: true });
    // Stored in the preferences JSON under chatSettings.calls — the one home.
    const stored = store.rows.get(OWNER)?.preferences as {
      chatSettings: { calls?: { lowDataMode?: boolean }; privacy?: unknown };
    };
    expect(stored.chatSettings.calls).toEqual({ lowDataMode: true });
    expect(stored.chatSettings.privacy).toMatchObject({ whoCanMessage: 'everyone' });

    const get = await app.inject({ method: 'GET', url: '/settings' });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.calls).toEqual({ lowDataMode: true });
    expect(get.json().data.privacy).toMatchObject({ whoCanMessage: 'everyone' });
  });

  it('NC-296-2: GET for a user with empty preferences returns the honest default calls:{lowDataMode:false}', async () => {
    app = await buildApp(store, FRESH);
    const get = await app.inject({ method: 'GET', url: '/settings' });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.calls).toEqual({ lowDataMode: false });
  });

  it('PUT {calls:{lowDataMode:false}} turns a stored true back off', async () => {
    store.rows.get(OWNER)!.preferences = {
      chatSettings: { calls: { lowDataMode: true }, blockedUsers: [] },
    };
    app = await buildApp(store, OWNER);
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { calls: { lowDataMode: false } },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data.calls).toEqual({ lowDataMode: false });
  });

  it('PIN-296-14: a later PUT of another section does not clobber the stored calls pref', async () => {
    app = await buildApp(store, OWNER);
    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { calls: { lowDataMode: true } },
    });
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { notifications: { sound: false } },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data.calls).toEqual({ lowDataMode: true });
    expect(put.json().data.notifications.sound).toBe(false);
  });

  it('PUT with a non-boolean lowDataMode is rejected 400 (validation before write)', async () => {
    app = await buildApp(store, OWNER);
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { calls: { lowDataMode: 'yes' } },
    });
    expect(res.statusCode).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('PIN-296-14: unknown top-level keys are still rejected 400 (strict schema intact)', async () => {
    app = await buildApp(store, OWNER);
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { evil: 'injection' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('unauthenticated PUT of the calls section is rejected 401 (fail closed)', async () => {
    app = await buildApp(store);
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { calls: { lowDataMode: true } },
    });
    expect(res.statusCode).toBe(401);
  });
});
