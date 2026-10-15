// ============================================================================
// QC-F-371 (Slice-1) — User.preferences read-modify-write race
//
// The four writers of the User.preferences JSON column (settings PUT,
// settings POST /blocked, settings DELETE /blocked, AutoReplyService.
// setEnabled) each used to read the whole snapshot, mutate it in memory,
// and write the whole snapshot back unconditionally — no transaction, no
// version guard. Two overlapping writes raced and the LAST committer
// silently overwrote the other's change; the lost change was usually a
// safety record (a block, a privacy tightening), with both requests
// answering success.
//
// These tests interleave two writers DETERMINISTICALLY (no sleep): the
// first writer is parked at its unconditional direct update via a
// one-shot gate in the fake store, the second writer runs to completion,
// then the gate is released. On the fixed code both writers go through
// the shared Serializable-transaction helper (lib/preferences-update),
// so the gate never fires, the writers serialize on the fake's tx mutex,
// the second reads the first's committed snapshot, and BOTH changes
// survive.
//
// Negative control (behavioural, this file): on pre-fix code the four
// race cases FAIL — the final stored preferences are missing exactly
// one writer's change in each case (block erased by a settings PUT,
// second block erased by the first, auto-reply toggle erased by a
// settings PUT, unblock resurrected by a settings PUT) — while the
// three control cases PASS on both versions.
//
// The fake store models the Prisma surface faithfully for this column:
// direct findUnique/update act on committed state immediately (the old
// racy path), while $transaction takes a snapshot under a mutex, lets
// the callback read/write the snapshot, and commits atomically on
// success (discarding it when the callback throws — QC-F-317 rollback).
// Module-level stable identities only; no fresh-identity mocks.
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { errorHandlerPlugin } from '@quant/server-core';

vi.mock('../routes/websocket', () => ({
  closeLiveSocketsForUser: vi.fn(),
}));

import settingsRoutes from '../routes/settings';
import { AutoReplyManager } from '../lib/auto-reply-manager';
import {
  AutoReplyService,
  type AutoReplyAgent,
  type AutoReplyPrisma,
} from '../services/auto-reply.service';

const OWNER = 'user-owner';
const TARGET = 'user-target';
const TARGET2 = 'user-target-2';
const CONV = 'conv-1';

interface FakeUserRow {
  preferences: unknown;
  displayName: string;
  username: string;
  deletedAt: Date | null;
}

function clonePrefs(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

interface UpdateGate {
  called: Promise<void>;
  release: () => void;
}

function makeRaceDb(seed: Record<string, Partial<FakeUserRow>>) {
  const committed = new Map<string, FakeUserRow>();
  for (const [id, partial] of Object.entries(seed)) {
    committed.set(id, {
      displayName: `Name of ${id}`,
      username: `name-of-${id}`,
      deletedAt: null,
      ...partial,
      preferences: clonePrefs(partial.preferences ?? null),
    });
  }
  const members = new Set<string>([`${OWNER}::${CONV}`]);
  let committedWrites = 0;

  let gateArmed = false;
  let gateCalledResolve: (() => void) | null = null;
  let gateWait: Promise<void> | null = null;
  let gateReleaseFn: (() => void) | null = null;

  function armDirectUpdateGate(): UpdateGate {
    let calledResolve!: () => void;
    let waitResolve!: () => void;
    const called = new Promise<void>((resolve) => {
      calledResolve = resolve;
    });
    gateWait = new Promise<void>((resolve) => {
      waitResolve = resolve;
    });
    gateCalledResolve = calledResolve;
    gateArmed = true;
    gateReleaseFn = () => {
      gateArmed = false;
      waitResolve();
    };
    return { called, release: () => gateReleaseFn?.() };
  }

  const snapshotRow = (row: FakeUserRow): FakeUserRow => ({
    ...row,
    preferences: clonePrefs(row.preferences),
  });

  const directUser = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = committed.get(where.id);
      return row ? { id: where.id, ...snapshotRow(row) } : null;
    },
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in
        .filter((id) => committed.has(id))
        .map((id) => ({ id, preferences: clonePrefs(committed.get(id)!.preferences) })),
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { preferences: unknown };
    }) => {
      if (gateArmed) {
        gateArmed = false;
        gateCalledResolve?.();
        await gateWait;
      }
      const row = committed.get(where.id);
      if (row) {
        row.preferences = clonePrefs(data.preferences);
        committedWrites += 1;
      }
      return row;
    },
  };

  let txChain: Promise<unknown> = Promise.resolve();
  const $transaction = (
    fn: (tx: { user: typeof directUser }) => Promise<unknown>,
  ): Promise<unknown> => {
    const run = txChain.then(async () => {
      const snapshot = new Map(
        [...committed.entries()].map(([id, row]) => [id, snapshotRow(row)]),
      );
      let dirty = false;
      const txUser: typeof directUser = {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const row = snapshot.get(where.id);
          return row ? { id: where.id, ...snapshotRow(row) } : null;
        },
        findMany: directUser.findMany,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { preferences: unknown };
        }) => {
          const row = snapshot.get(where.id);
          if (row) {
            row.preferences = clonePrefs(data.preferences);
            dirty = true;
          }
          return row;
        },
      };
      const out = await fn({ user: txUser });
      if (dirty) {
        for (const [id, row] of snapshot) committed.set(id, snapshotRow(row));
        committedWrites += 1;
      }
      return out;
    });
    txChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const routePrisma = { user: directUser, $transaction };
  const autoPrisma = {
    user: directUser,
    conversationMember: {
      findFirst: async ({
        where,
      }: {
        where: { conversationId: string; userId: string; leftAt: null };
      }) =>
        members.has(`${where.userId}::${where.conversationId}`)
          ? { id: `mem_${where.userId}` }
          : null,
      findMany: async () => [] as Array<{ userId: string }>,
    },
    message: { findMany: async () => [] },
    $transaction,
  };

  return {
    routePrisma: routePrisma as unknown as PrismaClient,
    autoPrisma: autoPrisma as unknown as AutoReplyPrisma,
    armDirectUpdateGate,
    prefsOf: (id: string) => clonePrefs(committed.get(id)?.preferences) as {
      chatSettings?: Record<string, unknown>;
    } | null,
    committedWrites: () => committedWrites,
  };
}

type RaceDb = ReturnType<typeof makeRaceDb>;

async function buildApp(db: RaceDb, authUserId: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', db.routePrisma as never);
  app.addHook('onRequest', (request, _reply, done) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
    done();
  });
  await app.register(settingsRoutes, { prefix: '/settings' });
  await app.ready();
  return app;
}

function makeAutoReplyService(db: RaceDb): AutoReplyService {
  const agent: AutoReplyAgent = {
    autoReply: async () => ({ content: 'stub', isAIGenerated: true as const, confidence: 1 }),
  };
  return new AutoReplyService(db.autoPrisma, new AutoReplyManager(), agent, async () => {});
}

function blockedIds(db: RaceDb): string[] {
  const blocked = db.prefsOf(OWNER)?.chatSettings?.['blockedUsers'];
  if (!Array.isArray(blocked)) return [];
  return blocked.map((entry) =>
    typeof entry === 'string' ? entry : (entry as { id: string }).id,
  );
}

describe('QC-F-371: preferences writers race — both changes must survive', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('1. block ‖ settings PUT — the block AND the privacy change both survive', async () => {
    const db = makeRaceDb({
      [OWNER]: {
        preferences: {
          chatSettings: {
            privacy: { whoCanMessage: 'everyone' },
            theme: 'dark',
            blockedUsers: [],
          },
        },
      },
      [TARGET]: { displayName: 'Target Person', username: 'target' },
    });
    app = await buildApp(db, OWNER);

    const gate = db.armDirectUpdateGate();
    const putPromise = app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { privacy: { whoCanMessage: 'nobody' } },
    });
    // Pre-fix: PUT parks at its stale unconditional update. Fixed: PUT
    // completes through the transaction and the gate never fires.
    await Promise.race([gate.called, putPromise]);

    const postRes = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(postRes.statusCode).toBe(200);
    gate.release();
    const putRes = await putPromise;
    expect(putRes.statusCode).toBe(200);

    const chat = db.prefsOf(OWNER)?.chatSettings;
    expect((chat?.['privacy'] as { whoCanMessage?: string })?.whoCanMessage).toBe('nobody');
    expect(blockedIds(db)).toContain(TARGET);
  });

  it('2. two parallel blocks — both entries survive', async () => {
    const db = makeRaceDb({
      [OWNER]: { preferences: { chatSettings: { blockedUsers: [] } } },
      [TARGET]: { displayName: 'Target Person', username: 'target' },
      [TARGET2]: { displayName: 'Second Person', username: 'second' },
    });
    app = await buildApp(db, OWNER);

    const gate = db.armDirectUpdateGate();
    const firstPromise = app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    await Promise.race([gate.called, firstPromise]);

    const secondRes = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET2}` });
    expect(secondRes.statusCode).toBe(200);
    gate.release();
    const firstRes = await firstPromise;
    expect(firstRes.statusCode).toBe(200);

    expect(blockedIds(db).sort()).toEqual([TARGET, TARGET2].sort());
  });

  it('3. settings PUT ‖ auto-reply toggle — both effects survive', async () => {
    const db = makeRaceDb({
      [OWNER]: {
        preferences: { chatSettings: { privacy: { whoCanMessage: 'everyone' } } },
      },
    });
    app = await buildApp(db, OWNER);
    const service = makeAutoReplyService(db);

    const gate = db.armDirectUpdateGate();
    const putPromise = app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { privacy: { whoCanMessage: 'nobody' } },
    });
    await Promise.race([gate.called, putPromise]);

    const toggle = await service.setEnabled(OWNER, CONV, true);
    expect(toggle.enabled).toBe(true);
    gate.release();
    const putRes = await putPromise;
    expect(putRes.statusCode).toBe(200);

    const chat = db.prefsOf(OWNER)?.chatSettings;
    expect((chat?.['privacy'] as { whoCanMessage?: string })?.whoCanMessage).toBe('nobody');
    const autoReply = chat?.['autoReply'] as { conversationIds?: string[] } | undefined;
    expect(autoReply?.conversationIds).toContain(CONV);
  });

  it('4. settings PUT ‖ unblock — the removal is not resurrected and the PUT survives', async () => {
    const db = makeRaceDb({
      [OWNER]: {
        preferences: {
          chatSettings: {
            theme: 'dark',
            blockedUsers: [
              { id: TARGET, name: 'Target Person', username: 'target', blockedAt: '2026-01-01T00:00:00.000Z' },
            ],
          },
        },
      },
      [TARGET]: { displayName: 'Target Person', username: 'target' },
    });
    app = await buildApp(db, OWNER);

    const gate = db.armDirectUpdateGate();
    const putPromise = app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { theme: 'light' },
    });
    await Promise.race([gate.called, putPromise]);

    const deleteRes = await app.inject({ method: 'DELETE', url: `/settings/blocked/${TARGET}` });
    expect(deleteRes.statusCode).toBe(200);
    gate.release();
    const putRes = await putPromise;
    expect(putRes.statusCode).toBe(200);

    const chat = db.prefsOf(OWNER)?.chatSettings;
    expect(chat?.['theme']).toBe('light');
    expect(blockedIds(db)).toEqual([]);
  });

  it('5. control: sequential writes compose (passes on old and new code)', async () => {
    const db = makeRaceDb({
      [OWNER]: { preferences: { chatSettings: { blockedUsers: [] } } },
      [TARGET]: { displayName: 'Target Person', username: 'target' },
    });
    app = await buildApp(db, OWNER);
    const service = makeAutoReplyService(db);

    const postRes = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(postRes.statusCode).toBe(200);
    const putRes = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { privacy: { showOnlineStatus: false } },
    });
    expect(putRes.statusCode).toBe(200);
    await service.setEnabled(OWNER, CONV, true);

    const chat = db.prefsOf(OWNER)?.chatSettings;
    expect(blockedIds(db)).toEqual([TARGET]);
    expect((chat?.['privacy'] as { showOnlineStatus?: boolean })?.showOnlineStatus).toBe(false);
    const autoReply = chat?.['autoReply'] as { conversationIds?: string[] } | undefined;
    expect(autoReply?.conversationIds).toEqual([CONV]);

    const deleteRes = await app.inject({ method: 'DELETE', url: `/settings/blocked/${TARGET}` });
    expect(deleteRes.statusCode).toBe(200);
    expect(blockedIds(db)).toEqual([]);
    const after = db.prefsOf(OWNER)?.chatSettings;
    expect((after?.['autoReply'] as { conversationIds?: string[] })?.conversationIds).toEqual([CONV]);
  });

  it('6. control: malformed blocked list still fails closed 503 with no write (QC-F-317)', async () => {
    const seedPrefs = { chatSettings: { blockedUsers: 'oops-string' } };
    const db = makeRaceDb({
      [OWNER]: { preferences: seedPrefs },
      [TARGET]: { displayName: 'Target Person', username: 'target' },
    });
    app = await buildApp(db, OWNER);

    const res = await app.inject({ method: 'POST', url: `/settings/blocked/${TARGET}` });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BLOCKED_LIST_UNAVAILABLE' },
    });
    expect(db.committedWrites()).toBe(0);
    expect(db.prefsOf(OWNER)).toEqual(seedPrefs);
  });

  it('7. control: PUT for a missing user row answers 404 (helper null path)', async () => {
    const db = makeRaceDb({ [TARGET]: {} });
    app = await buildApp(db, OWNER);

    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { theme: 'light' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'USER_NOT_FOUND' } });
    expect(db.committedWrites()).toBe(0);
  });
});
