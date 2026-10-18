// ============================================================================
// QC-F-450 — 'My Eyes Only' route regression tests
//
// Mounts the REAL memories route plugin on a bare Fastify instance (the
// qc-f-017 harness pattern): a preHandler installs request.auth the way
// the real auth plugin does, a minimal error handler mirrors the
// server-core AppError mapping, and only Prisma is an in-memory fake with
// stable identities. Passcode hashing is the real argon2id service.
//
// The closed rule under test, on every surface: without a valid unlock
// token NO response reveals anything about a private item — no id, no
// mediaUrl, no caption, not even its count in `total` — and a locked
// private listing is a 401 MEMORIES_LOCKED, never an honest-looking
// empty list. All of these fail on the pre-fix tree (no vault existed).
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// @quant/database (pulled in transitively via @quant/server-core) only
// constructs a client at import time; it is never used by these routes.
vi.mock('@prisma/client', () => ({
  Prisma: {},
  PrismaClient: class {
    constructor(..._args: unknown[]) {}
  },
}));

import memoriesRoutes from '../routes/memories';
import type { MemoryRecord } from '../services/memory.service';
import type {
  MemoriesVaultCredentialRecord,
  MemoriesVaultUnlockRecord,
} from '../services/memories-vault.service';
import { passwordService } from '@quant/auth';

const USER = 'user_vault';
const OTHER = 'user_other';
const PASSCODE = '90210';
const ACCOUNT_PASSWORD = '135790';

interface FakeState {
  memories: MemoryRecord[];
  credential: MemoriesVaultCredentialRecord | null;
  unlocks: MemoriesVaultUnlockRecord[];
  users: Map<string, { id: string; passwordHash: string }>;
}

function matchesWhere(row: MemoryRecord, where: Record<string, unknown>): boolean {
  if (where['id'] !== undefined && row.id !== where['id']) return false;
  if (where['userId'] !== undefined && row.userId !== where['userId']) return false;
  if ('deletedAt' in where) {
    const cond = where['deletedAt'];
    if (cond === null && row.deletedAt !== null) return false;
    if (typeof cond === 'object' && cond !== null && 'not' in cond && row.deletedAt === null)
      return false;
  }
  if (where['isPrivate'] !== undefined && row.isPrivate !== where['isPrivate']) return false;
  const caption = where['caption'] as { contains?: string } | undefined;
  if (caption?.contains && !row.caption?.toLowerCase().includes(caption.contains.toLowerCase()))
    return false;
  const location = where['location'] as { contains?: string } | undefined;
  if (
    location?.contains &&
    !row.location?.toLowerCase().includes(location.contains.toLowerCase())
  )
    return false;
  return true;
}

function makeFakePrisma() {
  const state: FakeState = {
    memories: [],
    credential: null,
    unlocks: [],
    users: new Map(),
  };
  let seq = 0;

  // QC-F-511: same atomic-write fake semantics as the service test —
  // every credential mutation applies in ONE synchronous step (the
  // fake's model of a single atomic SQL statement, HG-511-5).
  type CredData = Omit<Partial<MemoriesVaultCredentialRecord>, 'failedAttempts'> & {
    failedAttempts?: number | { increment: number } | { set: number };
  };
  function applyCredentialData(data: CredData): void {
    if (!state.credential) return;
    const { failedAttempts, ...rest } = data;
    Object.assign(state.credential, rest);
    if (failedAttempts !== undefined) {
      state.credential.failedAttempts =
        typeof failedAttempts === 'number'
          ? failedAttempts
          : 'increment' in failedAttempts
            ? state.credential.failedAttempts + failedAttempts.increment
            : failedAttempts.set;
    }
  }
  function lockoutMatches(value: Date | null, cond: unknown): boolean {
    if (cond === null) return value === null;
    const c = cond as { lte?: Date; gt?: Date; not?: unknown };
    if (c.not === null && value === null) return false;
    if (c.lte !== undefined) return value !== null && value.getTime() <= c.lte.getTime();
    if (c.gt !== undefined) return value !== null && value.getTime() > c.gt.getTime();
    return true;
  }
  function credentialMatches(where: Record<string, unknown>): boolean {
    const cred = state.credential;
    if (!cred) return false;
    if (where['userId'] !== undefined && cred.userId !== where['userId']) return false;
    if ('lockoutUntil' in where && !lockoutMatches(cred.lockoutUntil, where['lockoutUntil']))
      return false;
    const or = where['OR'] as Array<Record<string, unknown>> | undefined;
    if (
      or &&
      !or.some(
        (clause) =>
          !('lockoutUntil' in clause) || lockoutMatches(cred.lockoutUntil, clause['lockoutUntil']),
      )
    )
      return false;
    return true;
  }

  const prisma = {
    memory: {
      create: async (args: unknown) => {
        const { data } = args as { data: Omit<MemoryRecord, 'id' | 'createdAt' | 'deletedAt'> };
        const row: MemoryRecord = {
          id: `mem-${++seq}`,
          createdAt: new Date(),
          deletedAt: null,
          ...data,
        };
        state.memories.push(row);
        return { ...row };
      },
      findMany: async (args: unknown) => {
        const { where } = args as { where: Record<string, unknown> };
        return state.memories.filter((r) => matchesWhere(r, where)).map((r) => ({ ...r }));
      },
      findFirst: async (args: unknown) => {
        const { where } = args as { where: Record<string, unknown> };
        const row = state.memories.find((r) => matchesWhere(r, where));
        return row ? { ...row } : null;
      },
      update: async (args: unknown) => {
        const { where, data } = args as {
          where: { id: string };
          data: Partial<MemoryRecord>;
        };
        const row = state.memories.find((r) => r.id === where.id) as MemoryRecord;
        Object.assign(row, data);
        return { ...row };
      },
      delete: async (args: unknown) => {
        const { where } = args as { where: { id: string } };
        const idx = state.memories.findIndex((r) => r.id === where.id);
        const [gone] = state.memories.splice(idx, 1);
        return gone as MemoryRecord;
      },
    },
    memoriesVaultCredential: {
      findUnique: async (args: unknown) => {
        const { where } = args as { where: { userId: string } };
        return state.credential && state.credential.userId === where.userId
          ? { ...state.credential }
          : null;
      },
      create: async (args: unknown) => {
        const { data } = args as {
          data: Omit<MemoriesVaultCredentialRecord, 'id' | 'createdAt' | 'updatedAt'>;
        };
        state.credential = {
          id: `cred-${++seq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        return { ...state.credential };
      },
      update: async (args: unknown) => {
        const { data } = args as { data: CredData };
        applyCredentialData(data);
        return { ...(state.credential as MemoriesVaultCredentialRecord) };
      },
      updateMany: async (args: unknown) => {
        const { where, data } = args as { where: Record<string, unknown>; data: CredData };
        if (!credentialMatches(where)) return { count: 0 };
        applyCredentialData(data);
        return { count: 1 };
      },
      delete: async () => {
        const gone = state.credential as MemoriesVaultCredentialRecord;
        state.credential = null;
        return gone;
      },
    },
    memoriesVaultUnlock: {
      create: async (args: unknown) => {
        const { data } = args as {
          data: Omit<MemoriesVaultUnlockRecord, 'id' | 'createdAt'>;
        };
        const row: MemoriesVaultUnlockRecord = {
          id: `unl-${++seq}`,
          createdAt: new Date(),
          ...data,
        };
        state.unlocks.push(row);
        return { ...row };
      },
      findUnique: async (args: unknown) => {
        const { where } = args as { where: { tokenHash: string } };
        const row = state.unlocks.find((u) => u.tokenHash === where.tokenHash);
        return row ? { ...row } : null;
      },
      deleteMany: async (args: unknown) => {
        const { where } = args as { where: { userId?: string; id?: string } };
        const before = state.unlocks.length;
        state.unlocks = state.unlocks.filter(
          (u) =>
            !((where.userId && u.userId === where.userId) || (where.id && u.id === where.id)),
        );
        return { count: before - state.unlocks.length };
      },
    },
    user: {
      findUnique: async (args: unknown) => {
        const { where } = args as { where: { id: string } };
        return state.users.get(where.id) ?? null;
      },
    },
    // Pass-through: fake atomicity is per statement, not row locking
    // (QC-F-511 HG-511-5 — same note as the service test fake).
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  return { prisma, state };
}

type FakePrisma = ReturnType<typeof makeFakePrisma>['prisma'];

async function buildRouteApp(
  authUserId: string | null,
  prisma: FakePrisma,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Mirror of server-core error-handler's AppError branch.
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string; details?: unknown };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode, details: e.details },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  (app as unknown as { decorate: (key: string, value: FakePrisma) => void }).decorate(
    'prisma',
    prisma,
  );
  if (authUserId) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: authUserId,
        username: authUserId,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    });
  }
  await app.register(memoriesRoutes, { prefix: '/memories' });
  await app.ready();
  return app;
}

function seedMemory(state: FakeState, overrides: Partial<MemoryRecord>): MemoryRecord {
  const row: MemoryRecord = {
    id: `seed-${state.memories.length + 1}`,
    userId: USER,
    mediaUrl: 'https://cdn/quantchat/seed.jpg',
    mediaType: 'PHOTO',
    caption: 'seed',
    location: null,
    createdAt: new Date(),
    deletedAt: null,
    isPrivate: false,
    ...overrides,
  };
  state.memories.push(row);
  return row;
}

describe('QC-F-450 memories vault routes', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let app: FastifyInstance;
  let otherApp: FastifyInstance;

  beforeEach(async () => {
    fake = makeFakePrisma();
    const hash = await passwordService.hash(ACCOUNT_PASSWORD);
    fake.state.users.set(USER, { id: USER, passwordHash: hash });
    fake.state.users.set(OTHER, { id: OTHER, passwordHash: hash });
    app = await buildRouteApp(USER, fake.prisma);
    otherApp = await buildRouteApp(OTHER, fake.prisma);
  });

  afterEach(async () => {
    await app.close();
    await otherApp.close();
  });

  async function setAndVerify(target: FastifyInstance): Promise<string> {
    const set = await target.inject({
      method: 'POST',
      url: '/memories/passcode/set',
      payload: { passcode: PASSCODE },
    });
    expect(set.statusCode).toBe(200);
    const verify = await target.inject({
      method: 'POST',
      url: '/memories/passcode/verify',
      payload: { passcode: PASSCODE },
    });
    expect(verify.statusCode).toBe(200);
    return (verify.json() as { data: { unlockToken: string } }).data.unlockToken;
  }

  it('GET /passcode/status is NOT swallowed by /:id and leaks no secret fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/memories/passcode/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Record<string, unknown> };
    expect(body.data).toEqual({ hasPasscode: false, resetAvailable: true });
    expect(res.body).not.toContain('passcodeHash');
    expect(res.body).not.toContain('failedAttempts');
    expect(res.body).not.toContain('lockoutUntil');
  });

  it('the public list excludes private rows entirely — items AND their count', async () => {
    seedMemory(fake.state, { id: 'mem-pub', mediaUrl: 'https://cdn/quantchat/pub.jpg' });
    seedMemory(fake.state, {
      id: 'mem-priv',
      mediaUrl: 'https://cdn/quantchat/secret.jpg',
      caption: 'hidden caption',
      isPrivate: true,
    });

    const res = await app.inject({ method: 'GET', url: '/memories' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { memories: MemoryRecord[]; total: number } };
    expect(body.data.total).toBe(1);
    expect(body.data.memories.map((m) => m.id)).toEqual(['mem-pub']);
    expect(body.data.memories[0]?.isPrivate).toBe(false);
    expect(res.body).not.toContain('mem-priv');
    expect(res.body).not.toContain('secret.jpg');
    expect(res.body).not.toContain('hidden caption');
  });

  it('?section=private without a token -> 401 MEMORIES_LOCKED (never an empty list)', async () => {
    seedMemory(fake.state, { id: 'mem-priv', isPrivate: true });
    const res = await app.inject({ method: 'GET', url: '/memories?section=private' });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('MEMORIES_LOCKED');
  });

  it('?section=private with a garbage token -> 401 MEMORIES_LOCKED', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/memories?section=private',
      headers: { 'x-memories-unlock': 'qmu_garbage-token' },
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('MEMORIES_LOCKED');
  });

  it('an invalid section value -> 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ method: 'GET', url: '/memories?section=everything' });
    expect(res.statusCode).toBe(400);
  });

  it('passcode format: 3 digits / 9 digits / letters -> 400; "0123" (leading zero) works and never echoes back', async () => {
    for (const bad of ['123', '123456789', '12a45']) {
      const res = await app.inject({
        method: 'POST',
        url: '/memories/passcode/set',
        payload: { passcode: bad },
      });
      expect(res.statusCode).toBe(400);
    }
    const ok = await app.inject({
      method: 'POST',
      url: '/memories/passcode/set',
      payload: { passcode: '0123' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).not.toContain('0123');
    const verify = await app.inject({
      method: 'POST',
      url: '/memories/passcode/verify',
      payload: { passcode: '0123' },
    });
    expect(verify.statusCode).toBe(200);
    // The verify response carries the token, never the passcode or its hash.
    expect(verify.body).not.toContain('0123');
    expect(verify.body).not.toContain('$argon2id$');
  });

  it('after unlock, ?section=private shows ONLY private rows, search stays inside the section, public stays clean', async () => {
    seedMemory(fake.state, {
      id: 'mem-pub',
      caption: 'beach day',
      mediaUrl: 'https://cdn/quantchat/pub.jpg',
    });
    seedMemory(fake.state, {
      id: 'mem-priv',
      caption: 'beach secret',
      mediaUrl: 'https://cdn/quantchat/secret.jpg',
      isPrivate: true,
    });
    const token = await setAndVerify(app);

    const priv = await app.inject({
      method: 'GET',
      url: '/memories?section=private',
      headers: { 'x-memories-unlock': token },
    });
    expect(priv.statusCode).toBe(200);
    const privBody = priv.json() as { data: { memories: MemoryRecord[]; total: number } };
    expect(privBody.data.total).toBe(1);
    expect(privBody.data.memories.map((m) => m.id)).toEqual(['mem-priv']);
    expect(privBody.data.memories[0]?.isPrivate).toBe(true);

    const searched = await app.inject({
      method: 'GET',
      url: '/memories?section=private&q=beach',
      headers: { 'x-memories-unlock': token },
    });
    const searchedBody = searched.json() as { data: { memories: MemoryRecord[] } };
    expect(searchedBody.data.memories.map((m) => m.id)).toEqual(['mem-priv']);

    const pub = await app.inject({ method: 'GET', url: '/memories?q=beach' });
    const pubBody = pub.json() as { data: { memories: MemoryRecord[] } };
    expect(pubBody.data.memories.map((m) => m.id)).toEqual(['mem-pub']);
  });

  it('move-to-private needs an unlock; the item vanishes from public at once; move-to-public restores it', async () => {
    seedMemory(fake.state, { id: 'mem-pub' });
    const token = await setAndVerify(app);

    const lockedMove = await app.inject({
      method: 'POST',
      url: '/memories/mem-pub/move-to-private',
    });
    expect(lockedMove.statusCode).toBe(401);
    expect((lockedMove.json() as { error: { code: string } }).error.code).toBe('MEMORIES_LOCKED');

    const moved = await app.inject({
      method: 'POST',
      url: '/memories/mem-pub/move-to-private',
      headers: { 'x-memories-unlock': token },
    });
    expect(moved.statusCode).toBe(200);
    expect((moved.json() as { data: MemoryRecord }).data.isPrivate).toBe(true);

    const pub = await app.inject({ method: 'GET', url: '/memories' });
    expect((pub.json() as { data: { total: number } }).data.total).toBe(0);

    const back = await app.inject({
      method: 'POST',
      url: '/memories/mem-pub/move-to-public',
      headers: { 'x-memories-unlock': token },
    });
    expect(back.statusCode).toBe(200);
    expect((back.json() as { data: MemoryRecord }).data.isPrivate).toBe(false);
    const pub2 = await app.inject({ method: 'GET', url: '/memories' });
    expect((pub2.json() as { data: { total: number } }).data.total).toBe(1);
  });

  it('another user cannot move or even see the item: their own unlock + foreign id -> 404', async () => {
    seedMemory(fake.state, { id: 'mem-pub' });
    const otherToken = await setAndVerify(otherApp);

    const foreignMove = await otherApp.inject({
      method: 'POST',
      url: '/memories/mem-pub/move-to-private',
      headers: { 'x-memories-unlock': otherToken },
    });
    expect(foreignMove.statusCode).toBe(404);

    const foreignList = await otherApp.inject({
      method: 'GET',
      url: '/memories?section=private',
      headers: { 'x-memories-unlock': otherToken },
    });
    expect((foreignList.json() as { data: { total: number } }).data.total).toBe(0);
  });

  it('deleting a private item without an unlock -> 404 and the row is untouched; with an unlock -> 200', async () => {
    seedMemory(fake.state, { id: 'mem-priv', isPrivate: true });
    const token = await setAndVerify(app);

    const lockedDelete = await app.inject({ method: 'DELETE', url: '/memories/mem-priv' });
    expect(lockedDelete.statusCode).toBe(404);
    const row = fake.state.memories.find((m) => m.id === 'mem-priv');
    expect(row?.deletedAt).toBeNull();

    const unlockedDelete = await app.inject({
      method: 'DELETE',
      url: '/memories/mem-priv',
      headers: { 'x-memories-unlock': token },
    });
    expect(unlockedDelete.statusCode).toBe(200);
    expect(row?.deletedAt).not.toBeNull();
  });

  it('create as private: 409 before a passcode exists, 401 without an unlock, 201 with one — and it stays hidden publicly', async () => {
    const payload = {
      mediaUrl: 'https://cdn/quantchat/new-secret.jpg',
      mediaType: 'PHOTO',
      isPrivate: true,
    };
    const noPasscode = await app.inject({ method: 'POST', url: '/memories', payload });
    expect(noPasscode.statusCode).toBe(409);
    expect((noPasscode.json() as { error: { code: string } }).error.code).toBe(
      'PASSCODE_NOT_SET',
    );

    const set = await app.inject({
      method: 'POST',
      url: '/memories/passcode/set',
      payload: { passcode: PASSCODE },
    });
    expect(set.statusCode).toBe(200);
    const noToken = await app.inject({ method: 'POST', url: '/memories', payload });
    expect(noToken.statusCode).toBe(401);

    const verify = await app.inject({
      method: 'POST',
      url: '/memories/passcode/verify',
      payload: { passcode: PASSCODE },
    });
    const token = (verify.json() as { data: { unlockToken: string } }).data.unlockToken;
    const created = await app.inject({
      method: 'POST',
      url: '/memories',
      payload,
      headers: { 'x-memories-unlock': token },
    });
    expect(created.statusCode).toBe(201);
    expect((created.json() as { data: MemoryRecord }).data.isPrivate).toBe(true);

    const pub = await app.inject({ method: 'GET', url: '/memories' });
    expect((pub.json() as { data: { total: number } }).data.total).toBe(0);
    expect(pub.body).not.toContain('new-secret.jpg');
  });

  it('POST /passcode/lock revokes the live token immediately', async () => {
    const token = await setAndVerify(app);
    const before = await app.inject({
      method: 'GET',
      url: '/memories?section=private',
      headers: { 'x-memories-unlock': token },
    });
    expect(before.statusCode).toBe(200);

    const lock = await app.inject({ method: 'POST', url: '/memories/passcode/lock' });
    expect(lock.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/memories?section=private',
      headers: { 'x-memories-unlock': token },
    });
    expect(after.statusCode).toBe(401);
  });

  it('unauthenticated requests are refused (401) on list and status', async () => {
    const anon = await buildRouteApp(null, fake.prisma);
    try {
      const list = await anon.inject({ method: 'GET', url: '/memories' });
      expect(list.statusCode).toBe(401);
      const status = await anon.inject({ method: 'GET', url: '/memories/passcode/status' });
      expect(status.statusCode).toBe(401);
    } finally {
      await anon.close();
    }
  });
});
