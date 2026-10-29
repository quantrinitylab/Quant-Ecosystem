// @vitest-environment node

// ============================================================================
// QuantMail Drive — revoked-share exclusion in search (CODEX block for
// PR #1505: "revoked shares must not surface in search").
//
// Drives the REAL `/drive/search` route handler through Fastify inject with
// a faithful in-memory Prisma stand-in. The stand-in emulates Prisma query
// semantics exactly where it matters: a `status: { not: 'revoked' }`
// predicate is honored ONLY when the route actually sends it. A route that
// looks shares up without a standing predicate therefore sees revoked rows
// — so these tests FAIL on the pre-fix handler at exactly the leak (verified
// by running this file against the unpatched route) and pass once standing
// is enforced at query time.
//
// Fixture (viewer = user-viewer):
//   own files:  f-own-valid (shared with bob, accepted),
//               f-own-revoked (shared with bob, REVOKED),
//               f-own-plain (never shared),
//               f-own-img (image, never shared, for type: combos)
//   incoming:   f-in-valid (alice → viewer, accepted),
//               f-in-revoked (alice → viewer, REVOKED),
//               f-in-pending (alice → viewer, pending — still listed, as in
//                 the Shared tab; only revocation removes a row here),
//               f-in-bob (bob → viewer, accepted)
//   folders:    d-own-shared (viewer → bob, accepted),
//               d-own-revoked (viewer → bob, REVOKED)
//   documents:  doc-1 (viewer-owned, title matches) — documents have no
//               share rows, so they must never appear in share-scoped
//               results.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import { AISearchContentService } from '../services/ai-search-content.service';

const { inferMock, checkedPlaintextMock } = vi.hoisted(() => ({
  inferMock: vi.fn(),
  checkedPlaintextMock: vi.fn(),
}));

vi.mock('@quant/ai', () => ({
  AIEngine: class { infer = inferMock; },
}));

vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 1024,
  DRIVE_MAX_FILE_BYTES: 1024,
  checkedPlaintext: checkedPlaintextMock,
  deleteDriveObject: vi.fn(),
  driveObjectKey: vi.fn((userId: string, fileId: string) => `drive/${userId}/${fileId}`),
  driveStorageReady: vi.fn(() => true),
  driveStorageUnavailableReason: vi.fn(() => ''),
  encryptForDrive: vi.fn(() => ({ ciphertext: Buffer.from('ciphertext'), iv: 'iv', authTag: 'tag', wrappedKey: 'key', contentHash: 'a'.repeat(64) })),
  hashFromVersionKey: vi.fn(() => null),
  putDriveObject: vi.fn(),
  safeFileName: vi.fn((name: string) => name),
}));

const VIEWER = 'user-viewer';
const ALICE = 'user-alice';
const BOB = 'user-bob';

const USERS = [
  { id: VIEWER, displayName: 'Viewer', email: 'viewer@quantmail.in' },
  { id: ALICE, displayName: 'Alice', email: 'alice@quantmail.in' },
  { id: BOB, displayName: 'Bob', email: 'bob@quantmail.in' },
];

const UPDATED = new Date('2026-08-01T00:00:00.000Z');

function fileRow(id: string, userId: string, name: string, mimeType = 'application/pdf') {
  return {
    id, userId, name, mimeType, size: 100, folderId: null, isStarred: false,
    isDeleted: false, deletedAt: null, trashRootId: null, encryptedContent: 'c',
    encryptionIV: 'iv', encryptionAuthTag: 'tag', encryptionKey: 'k',
    contentHash: `hash-${id}`, updatedAt: UPDATED, scanStatus: null,
    scanReason: null, scannedAt: null, lastOpenedAt: null,
  };
}

const FILES = [
  fileRow('f-own-valid', VIEWER, 'budget valid shared.pdf'),
  fileRow('f-own-revoked', VIEWER, 'budget revoked shared.pdf'),
  fileRow('f-own-plain', VIEWER, 'budget plain.pdf'),
  fileRow('f-own-img', VIEWER, 'budget photo.png', 'image/png'),
  fileRow('f-in-valid', ALICE, 'budget from alice.pdf'),
  fileRow('f-in-revoked', ALICE, 'budget revoked from alice.pdf'),
  fileRow('f-in-pending', ALICE, 'budget pending from alice.pdf'),
  fileRow('f-in-bob', BOB, 'budget from bob.pdf'),
];

const FOLDERS = [
  { id: 'd-own-shared', name: 'budget folder', parentId: null, path: '/budget folder', userId: VIEWER, isStarred: false, isDeleted: false, deletedAt: null, trashRootId: null, updatedAt: UPDATED },
  { id: 'd-own-revoked', name: 'budget revoked folder', parentId: null, path: '/budget revoked folder', userId: VIEWER, isStarred: false, isDeleted: false, deletedAt: null, trashRootId: null, updatedAt: UPDATED },
];

const DOCUMENTS = [
  { id: 'doc-1', userId: VIEWER, title: 'budget notes', content: 'budget planning', isDeleted: false, updatedAt: UPDATED },
];

const SHARES = [
  { id: 's1', fileId: 'f-own-valid', folderId: null, ownerUserId: VIEWER, sharedWithUserId: BOB, status: 'accepted' },
  { id: 's2', fileId: 'f-own-revoked', folderId: null, ownerUserId: VIEWER, sharedWithUserId: BOB, status: 'revoked' },
  { id: 's3', fileId: 'f-in-valid', folderId: null, ownerUserId: ALICE, sharedWithUserId: VIEWER, status: 'accepted' },
  { id: 's4', fileId: 'f-in-revoked', folderId: null, ownerUserId: ALICE, sharedWithUserId: VIEWER, status: 'revoked' },
  { id: 's5', fileId: 'f-in-pending', folderId: null, ownerUserId: ALICE, sharedWithUserId: VIEWER, status: 'pending' },
  { id: 's6', fileId: 'f-in-bob', folderId: null, ownerUserId: BOB, sharedWithUserId: VIEWER, status: 'accepted' },
  { id: 's7', fileId: null, folderId: 'd-own-shared', ownerUserId: VIEWER, sharedWithUserId: BOB, status: 'accepted' },
  { id: 's8', fileId: null, folderId: 'd-own-revoked', ownerUserId: VIEWER, sharedWithUserId: BOB, status: 'revoked' },
];

const INDEX_ROWS = [
  { id: 'idx-viewer', fileId: 'f-own-valid', userId: VIEWER, content: 'budget forecast numbers', mimeType: 'application/pdf', indexedAt: UPDATED },
  { id: 'idx-alice', fileId: 'f-in-valid', userId: ALICE, content: 'budget forecast numbers', mimeType: 'application/pdf', indexedAt: UPDATED },
];

function contains(haystack: string, needle: string, mode?: string): boolean {
  if (mode === 'insensitive') return haystack.toLowerCase().includes(needle.toLowerCase());
  return haystack.includes(needle);
}

// Faithful share predicate: the standing filter applies ONLY when the query
// carries it — exactly how Prisma behaves. A route without the predicate
// sees revoked rows.
function matchShare(row: (typeof SHARES)[number], where: any): boolean {
  if (!where) return true;
  if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) return false;
  if (where.sharedWithUserId && row.sharedWithUserId !== where.sharedWithUserId) return false;
  if (where.status && typeof where.status === 'string' && row.status !== where.status) return false;
  if (where.status?.not !== undefined && row.status === where.status.not) return false;
  if (where.fileId?.in && !where.fileId.in.includes(row.fileId)) return false;
  if (typeof where.fileId === 'string' && row.fileId !== where.fileId) return false;
  if (where.folderId?.in && !where.folderId.in.includes(row.folderId)) return false;
  if (where.OR) {
    const ok = where.OR.some((cond: any) => {
      if (cond.fileId?.in) return cond.fileId.in.includes(row.fileId);
      if (cond.folderId?.in) return cond.folderId.in.includes(row.folderId);
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

function matchNameDateId(row: { name?: string; title?: string; updatedAt: Date; id: string }, clause: any): boolean {
  const label = (row as any).name ?? (row as any).title ?? '';
  if (clause.name && !contains(label, clause.name.contains, clause.name.mode)) return false;
  if (clause.title && !contains(label, clause.title.contains, clause.title.mode)) return false;
  if (clause.id?.in && !clause.id.in.includes(row.id)) return false;
  if (clause.updatedAt?.lt && !(row.updatedAt < clause.updatedAt.lt)) return false;
  if (clause.updatedAt?.gte && !(row.updatedAt >= clause.updatedAt.gte)) return false;
  if (clause.OR) {
    const ok = clause.OR.some((c: any) => {
      if (c.title) return contains(label, c.title.contains, c.title.mode);
      if (c.content) return contains((row as any).content ?? '', c.content.contains, c.content.mode);
      if (c.mimeType) return contains((row as any).mimeType ?? '', c.mimeType.contains, c.mimeType.mode);
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

function matchRow(row: any, where: any): boolean {
  if (!where) return true;
  if (where.userId && row.userId !== where.userId) return false;
  if (where.id?.in && !where.id.in.includes(row.id)) return false;
  if (where.isDeleted !== undefined && row.isDeleted !== where.isDeleted) return false;
  for (const clause of where.AND ?? []) {
    if (!matchNameDateId(row, clause)) return false;
  }
  return true;
}

function buildPrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    file: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(async (args: any) => {
        const rows = FILES.filter((f) => matchRow(f, args?.where));
        return args?.take ? rows.slice(0, args.take) : rows;
      }),
    },
    folder: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(async (args: any) => {
        const rows = FOLDERS.filter((f) => matchRow(f, args?.where));
        return args?.take ? rows.slice(0, args.take) : rows;
      }),
      create: vi.fn(),
    },
    document: {
      findMany: vi.fn(async (args: any) => {
        const rows = DOCUMENTS.filter((d) => matchRow(d, args?.where));
        return args?.take ? rows.slice(0, args.take) : rows;
      }),
    },
    share: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(async (args: any) => SHARES.filter((s) => matchShare(s, args?.where))),
    },
    fileVersion: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    fileIndex: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(), update: vi.fn(), deleteMany: vi.fn(),
      findMany: vi.fn(async (args: any) => {
        const terms = (args?.where?.OR ?? []).map((c: any) => c.content?.contains).filter(Boolean);
        return INDEX_ROWS.filter((r) => {
          if (args?.where?.userId && r.userId !== args.where.userId) return false;
          return terms.some((t: string) => r.content.toLowerCase().includes(t.toLowerCase()));
        });
      }),
    },
    user: {
      findUnique: vi.fn(async (args: any) => {
        if (args?.where?.id) return USERS.find((u) => u.id === args.where.id) ?? null;
        if (typeof args?.where?.email === 'string') return USERS.find((u) => u.email === args.where.email) ?? null;
        if (args?.where?.email?.equals) {
          const { equals, mode } = args.where.email;
          return USERS.find((u) => (mode === 'insensitive' ? u.email.toLowerCase() === equals.toLowerCase() : u.email === equals)) ?? null;
        }
        return null;
      }),
      findMany: vi.fn(async (args: any) => {
        if (args?.where?.id?.in) return USERS.filter((u) => args.where.id.in.includes(u.id));
        return [];
      }),
    },
    userSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  prisma.$transaction = vi.fn(async (input: any) => (typeof input === 'function' ? input(prisma) : Promise.all(input)));
  return { ...prisma, ...overrides };
}

async function buildDriveApp(prisma: any) {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: VIEWER };
  });
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

async function searchIds(app: FastifyInstance, query: string): Promise<string[]> {
  const response = await app.inject({ method: 'GET', url: `/drive/search?${query}` });
  expect(response.statusCode).toBe(200);
  return (response.json().files as Array<{ id: string }>).map((f) => f.id).sort();
}

beforeEach(() => {
  inferMock.mockReset();
  checkedPlaintextMock.mockReset();
  checkedPlaintextMock.mockResolvedValue(Buffer.from('budget forecast numbers'));
});

describe('GET /drive/search revoked-share exclusion', () => {
  it('owner:shared excludes revoked shares on both sides but keeps valid ones', async () => {
    const app = await buildDriveApp(buildPrisma());
    const ids = await searchIds(app, 'q=budget&owner=shared');
    expect(ids).toContain('f-own-valid');
    expect(ids).toContain('f-in-valid');
    expect(ids).toContain('f-in-pending');
    expect(ids).toContain('d-own-shared');
    expect(ids).not.toContain('f-own-revoked');
    expect(ids).not.toContain('f-in-revoked');
    expect(ids).not.toContain('d-own-revoked');
    expect(ids).not.toContain('f-own-plain');
    await app.close();
  });

  it('owner:shared excludes revoked shares under every operator combination', async () => {
    const app = await buildDriveApp(buildPrisma());
    // type: + owner: + date window together
    const ids = await searchIds(app, 'q=budget&owner=shared&type=pdf&after=2026-01-01&before=2027-01-01');
    expect(ids).toContain('f-own-valid');
    expect(ids).toContain('f-in-valid');
    expect(ids).not.toContain('f-in-revoked');
    expect(ids).not.toContain('f-own-revoked');
    // type:image narrows to the image mime — the revoked pdf still stays out
    const img = await searchIds(app, 'q=budget&owner=shared&type=image');
    expect(img).not.toContain('f-in-revoked');
    expect(img).not.toContain('f-own-revoked');
    // name: narrows to one incoming file; the revoked namesake stays out
    const named = await searchIds(app, 'owner=shared&name=from%20alice');
    expect(named).toContain('f-in-valid');
    expect(named).toContain('f-in-pending');
    expect(named).not.toContain('f-in-revoked');
    await app.close();
  });

  it('owner:shared never includes documents (they have no share rows)', async () => {
    const app = await buildDriveApp(buildPrisma());
    const ids = await searchIds(app, 'q=budget&owner=shared');
    expect(ids).not.toContain('doc:doc-1');
    expect(ids).not.toContain('doc-1');
    await app.close();
  });

  it('owner:<email> returns valid shares in both directions, never revoked ones', async () => {
    const app = await buildDriveApp(buildPrisma());
    const bobIds = await searchIds(app, 'q=budget&owner=bob@quantmail.in');
    expect(bobIds).toContain('f-own-valid'); // viewer → bob, still valid
    expect(bobIds).toContain('f-in-bob'); // bob → viewer, still valid
    expect(bobIds).not.toContain('f-own-revoked'); // viewer → bob, revoked
    expect(bobIds).not.toContain('f-in-valid'); // alice → viewer: wrong owner for this query
    expect(bobIds).not.toContain('f-own-plain');
    const aliceIds = await searchIds(app, 'q=budget&owner=alice@quantmail.in');
    expect(aliceIds).toContain('f-in-valid');
    expect(aliceIds).toContain('f-in-pending');
    expect(aliceIds).not.toContain('f-in-revoked');
    expect(aliceIds).not.toContain('f-own-valid'); // viewer → bob: wrong recipient
    await app.close();
  });

  it('owner:<unknown email> is an honest empty result, not an error', async () => {
    const app = await buildDriveApp(buildPrisma());
    const ids = await searchIds(app, 'q=budget&owner=nobody@quantmail.in');
    expect(ids).toEqual([]);
    await app.close();
  });

  it('owner:me and the default scope are NOT over-blocked by revocation', async () => {
    const app = await buildDriveApp(buildPrisma());
    // Revocation removes the SHARE, never the owner's own access.
    const mine = await searchIds(app, 'q=budget&owner=me');
    expect(mine).toContain('f-own-valid');
    expect(mine).toContain('f-own-revoked');
    expect(mine).toContain('f-own-plain');
    expect(mine).not.toContain('f-in-valid');
    const plain = await searchIds(app, 'q=budget');
    expect(plain).toContain('f-own-revoked');
    expect(plain).toContain('doc:doc-1');
    expect(plain).not.toContain('f-in-valid');
    await app.close();
  });

  it('a search-backend failure is an honest error, never an empty result', async () => {
    const throwing = buildPrisma({
      share: { findFirst: vi.fn(), findMany: vi.fn().mockRejectedValue(new Error('db down')) },
    });
    const app = await buildDriveApp(throwing);
    const response = await app.inject({ method: 'GET', url: '/drive/search?q=budget&owner=shared' });
    expect(response.statusCode).toBe(500);
    expect(response.json().files).toBeUndefined();
    await app.close();
  });
});

describe('POST /drive/ai/search share isolation', () => {
  it('semantic search never returns another owner\u2019s file, even on matching content', async () => {
    // The service scopes the index AND the file rows to the viewer, so a
    // revoked (or any) share can never surface here: shared-with-me files
    // are simply not in the viewer's index scope.
    const prisma = buildPrisma();
    const service = new AISearchContentService(prisma as never);
    const results = await service.searchContent('budget forecast', VIEWER);
    expect(results.map((r) => r.fileId)).toEqual(['f-own-valid']);
  });

  it('a semantic-search backend failure is an honest error, not empty results', async () => {
    const throwing = buildPrisma({
      fileIndex: {
        findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn(),
        findMany: vi.fn().mockRejectedValue(new Error('db down')),
      },
    });
    const app = await buildDriveApp(throwing);
    const response = await app.inject({
      method: 'POST', url: '/drive/ai/search', payload: { query: 'budget' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().results).toBeUndefined();
    await app.close();
  });
});
