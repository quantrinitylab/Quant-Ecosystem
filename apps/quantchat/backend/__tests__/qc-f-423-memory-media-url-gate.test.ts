// ============================================================================
// QC-F-423 — Memories vault mediaUrl gate regression tests
//
// Memories was the ONE stored-media writer the QC-F-330 shared validator
// never reached: POST /memories accepted any non-empty string as mediaUrl
// (`javascript:`, `data:text/html`, an SSRF/metadata host, another user's
// storage key, any external host) and MemoryService.create() persisted it
// unchecked; the owner's client then loaded it verbatim (grid/viewer src,
// and the viewer Download anchor href + click).
//
// The closed Slice-1 rule (specialist-qc-f-423-buildprep.md, band):
//   - Enforcement lives ONCE, at the persistence boundary —
//     MemoryService.create() asserts the shared validator with the stories
//     option set { allowData: ['image/','video/'], maxDataLength:
//     12_582_912, maxUrlLength: 4096 } BEFORE any row is written.
//     Rejection is the validator's own 400 MEDIA_URL_NOT_ALLOWED.
//   - The route adds NO second copy; its QC-F-450 passcode/unlock checks
//     still answer BEFORE the gate (409 PASSCODE_NOT_SET / 401
//     MEMORIES_LOCKED) — the validator is never an oracle for vault state.
//
// Negative control (proven in build-QC-F-423.md): on the pre-fix service
// the 7 service NC cases + route T-423-11 persist/201 instead of rejecting;
// the ordering pins and happy paths pass on BOTH trees by design.
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
  // QC-F-423: memory.service now reaches lib/media-url, which value-imports
  // MessageType through message.service (extractStorageKey) — the enum must
  // exist on the mock or that transitive import fails at load.
  MessageType: {
    TEXT: 'TEXT',
    IMAGE: 'IMAGE',
    VIDEO: 'VIDEO',
    AUDIO: 'AUDIO',
    FILE: 'FILE',
    STICKER: 'STICKER',
    GIF: 'GIF',
    LOCATION: 'LOCATION',
    CONTACT: 'CONTACT',
    POLL: 'POLL',
    SYSTEM: 'SYSTEM',
  },
}));

import { MemoryService } from '../services/memory.service';
import memoriesRoutes from '../routes/memories';
import type { MemoryRecord } from '../services/memory.service';
import type {
  MemoriesVaultCredentialRecord,
  MemoriesVaultUnlockRecord,
} from '../services/memories-vault.service';
import { passwordService } from '@quant/auth';

const OWNER = 'user-1';
const OWN_URL = `https://quantchat-media.s3.amazonaws.com/${OWNER}/media_abc/photo.jpg`;
const OTHER_KEY_URL = 'https://quantchat-media.s3.amazonaws.com/victim-9/media_abc/secret.jpg';

// ---------------------------------------------------------------------------
// Service-level gate (mock prisma with stable identities)
// ---------------------------------------------------------------------------
function createMockPrisma() {
  return {
    memory: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

describe('QC-F-423 MemoryService.create mediaUrl gate', () => {
  let prisma: MockPrisma;
  let service: MemoryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MemoryService(prisma);
    prisma.memory.create.mockImplementation(async (args: unknown) => {
      const { data } = args as { data: Omit<MemoryRecord, 'id' | 'createdAt' | 'deletedAt'> };
      return { id: 'mem-new', createdAt: new Date(), deletedAt: null, ...data };
    });
  });

  it('T-423-01 NC: javascript: URL is rejected 400 MEDIA_URL_NOT_ALLOWED and nothing is persisted', async () => {
    await expect(
      service.create({ userId: OWNER, mediaUrl: 'javascript:alert(1)', mediaType: 'PHOTO' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_ALLOWED' });
    expect(prisma.memory.create).not.toHaveBeenCalled();
  });

  it('T-423-02 NC: data:text/html is rejected (only image/video data families are allowed)', async () => {
    await expect(
      service.create({
        userId: OWNER,
        mediaUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        mediaType: 'PHOTO',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_ALLOWED' });
    expect(prisma.memory.create).not.toHaveBeenCalled();
  });

  it('T-423-03 NC: data:audio is rejected — mediaType is PHOTO|VIDEO only, audio has no real form here', async () => {
    await expect(
      service.create({
        userId: OWNER,
        mediaUrl: 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4',
        mediaType: 'PHOTO',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_ALLOWED' });
    expect(prisma.memory.create).not.toHaveBeenCalled();
  });

  it('T-423-04 NC: an external host is rejected even over https (post-save swap / tracking beacon)', async () => {
    await expect(
      service.create({
        userId: OWNER,
        mediaUrl: 'https://evil.example.com/user-1/media_abc/photo.jpg',
        mediaType: 'PHOTO',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_ALLOWED' });
    expect(prisma.memory.create).not.toHaveBeenCalled();
  });

  it('T-423-05 NC: the cloud metadata address over http is rejected', async () => {
    await expect(
      service.create({
        userId: OWNER,
        mediaUrl: 'http://169.254.169.254/latest/meta-data',
        mediaType: 'PHOTO',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_ALLOWED' });
    expect(prisma.memory.create).not.toHaveBeenCalled();
  });

  it("T-423-06 NC: another user's own-storage key is rejected (key-not-owned)", async () => {
    await expect(
      service.create({ userId: OWNER, mediaUrl: OTHER_KEY_URL, mediaType: 'PHOTO' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_ALLOWED' });
    expect(prisma.memory.create).not.toHaveBeenCalled();
  });

  it('T-423-07 NC: an inline data:image larger than the stories cap (12_582_912) is rejected', async () => {
    const oversized = `data:image/jpeg;base64,${'A'.repeat(12_582_912)}`;
    await expect(
      service.create({ userId: OWNER, mediaUrl: oversized, mediaType: 'PHOTO' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_URL_NOT_ALLOWED' });
    expect(prisma.memory.create).not.toHaveBeenCalled();
  });

  it("T-423-08 control: the caller's own-storage URL persists unchanged", async () => {
    const result = await service.create({ userId: OWNER, mediaUrl: OWN_URL, mediaType: 'PHOTO' });
    expect(result.mediaUrl).toBe(OWN_URL);
    expect(prisma.memory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: OWNER, mediaUrl: OWN_URL }),
    });
  });

  it('T-423-09 control: data:image/jpeg (the shipped capture shape) persists', async () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';
    const result = await service.create({ userId: OWNER, mediaUrl: dataUrl, mediaType: 'PHOTO' });
    expect(result.mediaUrl).toBe(dataUrl);
    expect(prisma.memory.create).toHaveBeenCalledTimes(1);
  });

  it('T-423-10 control: data:video/mp4 persists for a VIDEO memory', async () => {
    const dataUrl = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
    const result = await service.create({ userId: OWNER, mediaUrl: dataUrl, mediaType: 'VIDEO' });
    expect(result.mediaUrl).toBe(dataUrl);
    expect(prisma.memory.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Route-level: the gate surfaces as the validator's envelope through the
// REAL route plugin, and the QC-F-450 vault checks keep their precedence.
// Harness = the qc-f-017 / memories-vault pattern: bare Fastify, preHandler
// installs request.auth, error handler mirrors server-core's AppError
// mapping, Prisma is an in-memory fake with stable identities; passcode
// hashing is the real argon2id service.
// ---------------------------------------------------------------------------
const USER = 'user_vault';
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
  return true;
}

function makeFakePrisma() {
  const state: FakeState = { memories: [], credential: null, unlocks: [], users: new Map() };
  let seq = 0;

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
        const row: MemoryRecord = { id: `mem-${++seq}`, createdAt: new Date(), deletedAt: null, ...data };
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
        const { where, data } = args as { where: { id: string }; data: Partial<MemoryRecord> };
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
        state.credential = { id: `cred-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...data };
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
        const { data } = args as { data: Omit<MemoriesVaultUnlockRecord, 'id' | 'createdAt'> };
        const row: MemoriesVaultUnlockRecord = { id: `unl-${++seq}`, createdAt: new Date(), ...data };
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
          (u) => !((where.userId && u.userId === where.userId) || (where.id && u.id === where.id)),
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
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  return { prisma, state };
}

type FakePrisma = ReturnType<typeof makeFakePrisma>['prisma'];

async function buildRouteApp(authUserId: string, prisma: FakePrisma): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
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
  (app as unknown as { decorate: (key: string, value: FakePrisma) => void }).decorate('prisma', prisma);
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
  await app.register(memoriesRoutes, { prefix: '/memories' });
  await app.ready();
  return app;
}

describe('QC-F-423 POST /memories mediaUrl gate (route surface + vault ordering)', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let app: FastifyInstance;

  beforeEach(async () => {
    fake = makeFakePrisma();
    const hash = await passwordService.hash(ACCOUNT_PASSWORD);
    fake.state.users.set(USER, { id: USER, passwordHash: hash });
    app = await buildRouteApp(USER, fake.prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('T-423-11 NC: a public create with a javascript: URL -> 400 MEDIA_URL_NOT_ALLOWED, no row stored', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/memories',
      payload: { mediaUrl: 'javascript:alert(1)', mediaType: 'PHOTO' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('MEDIA_URL_NOT_ALLOWED');
    expect(fake.state.memories).toHaveLength(0);
  });

  it('T-423-12 ordering pin: private create with a BAD url but NO passcode set -> 409 PASSCODE_NOT_SET (gate never answers first)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/memories',
      payload: { mediaUrl: 'javascript:alert(1)', mediaType: 'PHOTO', isPrivate: true },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('PASSCODE_NOT_SET');
    expect(fake.state.memories).toHaveLength(0);
  });

  it('T-423-13 ordering pin: private create with a BAD url, passcode set but NO unlock token -> 401 MEMORIES_LOCKED', async () => {
    const set = await app.inject({
      method: 'POST',
      url: '/memories/passcode/set',
      payload: { passcode: PASSCODE },
    });
    expect(set.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: '/memories',
      payload: { mediaUrl: 'https://evil.example.com/x.jpg', mediaType: 'PHOTO', isPrivate: true },
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('MEMORIES_LOCKED');
    expect(fake.state.memories).toHaveLength(0);
  });

  it("T-423-14 control: private create with a valid unlock and the caller's own-storage URL -> 201 and the row is private", async () => {
    const set = await app.inject({
      method: 'POST',
      url: '/memories/passcode/set',
      payload: { passcode: PASSCODE },
    });
    expect(set.statusCode).toBe(200);
    const verify = await app.inject({
      method: 'POST',
      url: '/memories/passcode/verify',
      payload: { passcode: PASSCODE },
    });
    expect(verify.statusCode).toBe(200);
    const token = (verify.json() as { data: { unlockToken: string } }).data.unlockToken;

    const ownUrl = `https://quantchat-media.s3.amazonaws.com/${USER}/media_fixture/new-secret.jpg`;
    const res = await app.inject({
      method: 'POST',
      url: '/memories',
      payload: { mediaUrl: ownUrl, mediaType: 'PHOTO', isPrivate: true },
      headers: { 'x-memories-unlock': token },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: MemoryRecord };
    expect(body.data.mediaUrl).toBe(ownUrl);
    expect(body.data.isPrivate).toBe(true);
    expect(fake.state.memories).toHaveLength(1);
  });
});
