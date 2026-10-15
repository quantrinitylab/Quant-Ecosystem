// ============================================================================
// QC-F-317 — POST /settings/blocked/:userId (the block WRITER) route tests
//
// The block system had enforcement (PrivacyService.checkBlockedBy, the
// QC-F-218 calls-initiate gate) but NO writer anywhere: no route, schema
// key, proxy, or UI action could ever add an entry to
// `chatSettings.blockedUsers`, so the list was always empty and the
// settings page's "Blocked Users" screen always showed (0). These tests
// pin the new writer + its coherence fixes:
//   - the entry is built from the target's REAL User row (client-supplied
//     name/username/blockedAt are ignored — a block entry is a safety
//     record, its identity comes from the server);
//   - idempotent repeats, self-block 400, ghost/deleted target 404,
//     missing auth user 404, no-auth 401;
//   - a malformed stored list fails closed (503 BLOCKED_LIST_UNAVAILABLE,
//     NO write — a writer must never erase a list it cannot read);
//   - legacy bare-string entries dedupe on POST and are removed by DELETE
//     (R1: the old DELETE filter only removed object entries, so a string
//     entry could never be unblocked while the handler said success);
//   - PUT /settings still rejects a `blockedUsers` key 400 (the band-B
//     full-list-replace route was deliberately NOT taken) and a valid PUT
//     preserves the blocked list;
//   - writer → gate integration: after POST, PrivacyService on the SAME
//     store answers checkBlockedBy 'blocked' and checkCanMessage 'denied'
//     (even with whoCanMessage 'everyone'); after DELETE both flip back.
//
// Harness mirrors qc-f-218: bare Fastify + errorHandlerPlugin + a stable
// fake Prisma (module-level identities, no fresh-identity mocks). The
// websocket module is stubbed because settings.ts imports
// closeLiveSocketsForUser from it (account delete) and the real module
// pulls the realtime stack, which this route suite does not exercise.
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { errorHandlerPlugin } from '@quant/server-core';

vi.mock('../routes/websocket', () => ({
  closeLiveSocketsForUser: vi.fn(),
}));

import settingsRoutes from '../routes/settings';
import { PrivacyService, type PrivacyPrismaLike } from '../services/privacy.service';

const OWNER = 'user-owner';
const TARGET = 'user-target';
const LEGACY = 'user-legacy';

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
  // QC-F-371: settings writers now run through the atomic preferences
  // helper, which requires $transaction on the client. Sequential fake:
  // the tx client is the same store (no interleaving in this suite).
  const prismaWithTx = Object.assign(prisma, {
    $transaction: async <T,>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> =>
      fn(prisma),
  });
  return { rows, update, prisma: prismaWithTx as unknown as PrismaClient, raw: prismaWithTx };
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

function ownerPrefs(blockedUsers: unknown) {
  return {
    chatSettings: {
      privacy: { whoCanMessage: 'everyone', showOnlineStatus: true },
      theme: 'dark',
      blockedUsers,
    },
  };
}

describe('QC-F-317: POST /settings/blocked/:userId — the block writer', () => {
  let app: FastifyInstance;
  let store: Store;

  beforeEach(() => {
    store = makeStore({
      [OWNER]: { preferences: ownerPrefs([]) },
      [TARGET]: { displayName: 'Target Person', username: 'target' },
      [LEGACY]: { displayName: 'Legacy Person', username: 'legacy' },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('1. writes a canonical entry built from the target row; forged body fields are ignored; other settings preserved', async () => {
    app = await buildApp(store, OWNER);
    const res = await app.inject({
      method: 'POST',
      url: `/settings/blocked/${TARGET}`,
      payload: { name: 'Forged Name', username: 'forged', blockedAt: '1970-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.blockedUsers).toHaveLength(1);
    const entry = body.data.blockedUsers[0];
    expect(entry.id).toBe(TARGET);
    expect(entry.name).toBe('Target Person');
    expect(entry.username).toBe('target');
    expect(Number.isNaN(Date.parse(entry.blockedAt))).toBe(false);
    expect(entry.blockedAt).not.toBe('1970-01-01T00:00:00.000Z');

    const stored = store.rows.get(OWNER)!.preferences as {
      chatSettings: { privacy: unknown; theme: unknown; blockedUsers: unknown };
    };
    expect(stored.chatSettings.blockedUsers).toEqual(body.data.blockedUsers);
    expect(stored.chatSettings.privacy).toEqual({
      whoCanMessage: 'everyone',
      showOnlineStatus: true,
    });
    expect(stored.chatSettings.theme).toBe('dark');
  });

  it('2. is idempotent: a repeat POST keeps one entry, the first blockedAt, and writes nothing more', async () => {
    app = await buildApp(store, OWNER);
    const first = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(first.statusCode).toBe(200);
    const firstList = first.json().data.blockedUsers;
    expect(store.update).toHaveBeenCalledTimes(1);

    const second = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.blockedUsers).toEqual(firstList);
    expect(second.json().data.blockedUsers).toHaveLength(1);
    expect(store.update).toHaveBeenCalledTimes(1);
  });

  it('3. rejects self-block with 400 BAD_REQUEST and never writes', async () => {
    app = await buildApp(store, OWNER);
    const res = await app.inject({ method: 'POST', url: `/settings/blocked/${OWNER}` });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('4. answers 404 USER_NOT_FOUND for a nonexistent target and never writes', async () => {
    app = await buildApp(store, OWNER);
    const res = await app.inject({ method: 'POST', url: '/settings/blocked/user-ghost' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'USER_NOT_FOUND' } });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('5. answers 404 USER_NOT_FOUND for a deleted target and never writes', async () => {
    store.rows.get(TARGET)!.deletedAt = new Date();
    app = await buildApp(store, OWNER);
    const res = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'USER_NOT_FOUND' } });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('6. rejects an unauthenticated request 401 UNAUTHORIZED (fail closed)', async () => {
    app = await buildApp(store);
    const res = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('7. answers 404 USER_NOT_FOUND when the authenticated user row itself is missing', async () => {
    app = await buildApp(store, 'user-not-in-store');
    const res = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'USER_NOT_FOUND' } });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('8. fails closed 503 BLOCKED_LIST_UNAVAILABLE on a malformed stored list and preserves it byte-for-byte', async () => {
    store.rows.get(OWNER)!.preferences = ownerPrefs('oops-string');
    app = await buildApp(store, OWNER);
    const res = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BLOCKED_LIST_UNAVAILABLE' },
    });
    expect(store.update).not.toHaveBeenCalled();
    expect(store.rows.get(OWNER)!.preferences).toEqual(ownerPrefs('oops-string'));
  });

  it('9. dedupes against a legacy bare-string entry (no object duplicate is appended)', async () => {
    store.rows.get(OWNER)!.preferences = ownerPrefs([TARGET]);
    app = await buildApp(store, OWNER);
    const res = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.blockedUsers).toEqual([TARGET]);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('10. round-trips through DELETE — including a legacy string entry (R1)', async () => {
    app = await buildApp(store, OWNER);
    await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    const unblocked = await app.inject({ method: 'DELETE', url: `/settings/blocked/${TARGET}` });
    expect(unblocked.statusCode).toBe(200);
    expect(unblocked.json().data.blockedUsers).toEqual([]);

    store.rows.get(OWNER)!.preferences = ownerPrefs([LEGACY]);
    const legacyUnblocked = await app.inject({
      method: 'DELETE',
      url: `/settings/blocked/${LEGACY}`,
    });
    expect(legacyUnblocked.statusCode).toBe(200);
    expect(legacyUnblocked.json().data.blockedUsers).toEqual([]);
    const stored = store.rows.get(OWNER)!.preferences as {
      chatSettings: { blockedUsers: unknown };
    };
    expect(stored.chatSettings.blockedUsers).toEqual([]);
  });

  it('11. PUT /settings still rejects a blockedUsers key 400 (band-B not taken), and a valid PUT preserves the list', async () => {
    app = await buildApp(store, OWNER);
    const badPut = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { blockedUsers: [{ id: TARGET, name: 'Forged', username: 'forged' }] },
    });
    expect(badPut.statusCode).toBe(400);
    expect(badPut.json()).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
    expect(store.rows.get(OWNER)!.preferences).toEqual(ownerPrefs([]));

    await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    const goodPut = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { privacy: { showOnlineStatus: false } },
    });
    expect(goodPut.statusCode).toBe(200);
    expect(goodPut.json().data.blockedUsers).toHaveLength(1);
    expect(goodPut.json().data.blockedUsers[0].id).toBe(TARGET);
    expect(goodPut.json().data.privacy.showOnlineStatus).toBe(false);
  });

  it('12. the new entry is visible through GET /settings (the settings page shape)', async () => {
    app = await buildApp(store, OWNER);
    await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    const res = await app.inject({ method: 'GET', url: '/settings' });
    expect(res.statusCode).toBe(200);
    const blocked = res.json().data.blockedUsers;
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ id: TARGET, name: 'Target Person', username: 'target' });
  });

  it('13. writer → gate integration: blocked verdicts flip with POST and back with DELETE', async () => {
    app = await buildApp(store, OWNER);
    await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });

    const svc = new PrivacyService(store.raw as unknown as PrivacyPrismaLike);
    await expect(svc.checkBlockedBy(OWNER, TARGET)).resolves.toBe('blocked');
    // whoCanMessage is 'everyone' on the owner seed — the block must win.
    await expect(svc.checkCanMessage(TARGET, OWNER)).resolves.toBe('denied');

    await app.inject({ method: 'DELETE', url: `/settings/blocked/${TARGET}` });
    const svcAfter = new PrivacyService(store.raw as unknown as PrivacyPrismaLike);
    await expect(svcAfter.checkBlockedBy(OWNER, TARGET)).resolves.toBe('clear');
    await expect(svcAfter.checkCanMessage(TARGET, OWNER)).resolves.toBe('allowed');
  });
});
