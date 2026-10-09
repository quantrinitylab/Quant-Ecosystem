// @vitest-environment node
// ============================================================================
// QM-M39-002 — Drive "Recent" view (M39 screen 6) route tests.
// Covers: GET /drive/recent (server-side recency ordering, cursor pagination,
// honest empty set), POST /drive/files/:id/open (explicit open tracking with
// the same authz as download), and the open-tracking hook in the download
// route. Tracking failures must never break open/download.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

vi.mock('@quant/ai', () => ({
  AIEngine: class {
    infer = vi.fn();
  },
}));

vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 10 * 1024 * 1024,
  DRIVE_MAX_FILE_BYTES: 10 * 1024 * 1024,
  checkedPlaintext: vi.fn(async () => Buffer.from('recent-bytes')),
  deleteDriveObject: vi.fn(async () => {}),
  driveObjectKey: vi.fn((userId: string, path: string) => `${userId}/${path}`),
  driveStorageReady: vi.fn(() => true),
  driveStorageUnavailableReason: vi.fn(() => null),
  encryptForDrive: vi.fn(() => ({
    ciphertext: Buffer.from('ciphertext'),
    iv: 'iv',
    authTag: 'tag',
    wrappedKey: 'wrapped-key',
    contentHash: 'hash-abc-123',
  })),
  putDriveObject: vi.fn(async () => {}),
  safeFileName: vi.fn((n: string) => n),
  hashFromVersionKey: vi.fn(() => null),
}));

interface FileRow {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  isStarred: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
  trashRootId: string | null;
  userId: string;
  updatedAt: Date;
  lastOpenedAt: Date | null;
  createdAt: Date;
}

let files: FileRow[] = [];
const rawCalls: Array<{ sql: string; params: unknown[] }> = [];
let rawShouldThrow = false;

function makeRow(partial: Partial<FileRow> & { id: string }): FileRow {
  return {
    name: 'file',
    mimeType: 'application/pdf',
    size: 10,
    folderId: null,
    isStarred: false,
    isDeleted: false,
    deletedAt: null,
    trashRootId: null,
    userId: 'user-owner',
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    lastOpenedAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...partial,
  };
}

function createFakePrisma() {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'user-owner'
          ? { id: 'user-owner', displayName: 'Owner', email: 'owner@quantmail.in' }
          : null,
      findMany: async () => [],
    },
    share: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    file: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        files.find((f) => f.id === where.id) ?? null,
    },
    fileVersion: {
      findMany: async () => [],
    },
    // QM-UIUX-079 — documents table projected into /drive/recent.
    // Empty fixture store; present so the route does not 500.
    document: {
      findMany: async () => [],
      findFirst: async () => null,
      count: async () => 0,
      updateMany: async () => ({ count: 0 }),
    },
    $executeRawUnsafe: async (sql: string, ...params: unknown[]) => {
      rawCalls.push({ sql, params });
      if (rawShouldThrow) throw new Error('db down');
      const id = params[0] as string;
      const hit = files.find((f) => f.id === id);
      if (hit && sql.includes('"lastOpenedAt"')) hit.lastOpenedAt = new Date();
      return 1;
    },
    // The recent list is ordered by the DB; the fake returns the fixture rows
    // in a fixed order so the test asserts the response preserves it verbatim
    // (client must not re-sort).
    $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
      rawCalls.push({ sql, params });
      if (sql.includes('COUNT(*)')) {
        return [{ count: files.filter((f) => !f.isDeleted).length }];
      }
      return files
        .filter((f) => !f.isDeleted)
        .map((f) => ({
          ...f,
          recency: f.lastOpenedAt && f.lastOpenedAt > f.updatedAt ? f.lastOpenedAt : f.updatedAt,
        }));
    },
  };
}

async function buildApp(currentUserId: string | null = 'user-owner'): Promise<FastifyInstance> {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  app.decorate('prisma', createFakePrisma() as never);
  app.addHook('onRequest', async (request) => {
    if (currentUserId) {
      (request as unknown as { auth: { userId: string } }).auth = { userId: currentUserId };
    }
  });
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

describe('QM-M39-002 Drive Recent view', () => {
  beforeEach(() => {
    rawCalls.length = 0;
    rawShouldThrow = false;
    files = [
      makeRow({
        id: 'file-opened-recently',
        name: 'opened-lately.pdf',
        updatedAt: new Date('2026-09-01T00:00:00Z'),
        lastOpenedAt: new Date('2026-10-07T12:00:00Z'),
      }),
      makeRow({
        id: 'file-modified-recently',
        name: 'modified-lately.pdf',
        updatedAt: new Date('2026-10-06T12:00:00Z'),
        lastOpenedAt: null,
      }),
      makeRow({
        id: 'file-trashed',
        name: 'trashed.pdf',
        isDeleted: true,
        updatedAt: new Date('2026-10-07T15:00:00Z'),
      }),
    ];
  });

  it('GET /drive/recent returns backend-ordered files with lastOpenedAt, excluding trash', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/drive/recent' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The fake returns rows in fixture order; the response must preserve it
    // verbatim — recency ordering is the DB's job, never the client's.
    expect(body.files.map((f: { id: string }) => f.id)).toEqual([
      'file-opened-recently',
      'file-modified-recently',
    ]);
    expect(body.files[0].lastOpenedAt).toBe('2026-10-07T12:00:00.000Z');
    expect(body.files[1].lastOpenedAt).toBeNull();
    expect(body.totalCount).toBe(2);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    // The SQL must filter trash and order by real recency server-side.
    const select = rawCalls.find((c) => c.sql.includes('FROM "drive_files"'));
    expect(select).toBeDefined();
    expect(select!.sql).toContain('"isDeleted" = false');
    expect(select!.sql).toContain('GREATEST(COALESCE("lastOpenedAt", "updatedAt"), "updatedAt")');
    expect(select!.params[0]).toBe('user-owner');
  });

  it('GET /drive/recent returns an honest empty list when there is nothing', async () => {
    files = [];
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/drive/recent' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.files).toEqual([]);
    expect(body.totalCount).toBe(0);
    expect(body.hasMore).toBe(false);
  });

  it('GET /drive/recent forwards the cursor for pagination', async () => {
    const app = await buildApp();
    const cursor = `${new Date('2026-10-07T12:00:00Z').getTime()}:file-opened-recently`;
    const res = await app.inject({
      method: 'GET',
      url: `/drive/recent?cursor=${encodeURIComponent(cursor)}`,
    });
    expect(res.statusCode).toBe(200);
    const select = rawCalls.find((c) => c.sql.includes('FROM "drive_files"'));
    expect(select).toBeDefined();
    expect(select!.sql).toContain('$2::timestamptz');
    expect(select!.params).toContain(cursor.split(':')[1]);
  });

  it('GET /drive/recent requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/drive/recent' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /drive/files/:id/open stamps lastOpenedAt without touching updatedAt', async () => {
    const app = await buildApp();
    const before = files[1].updatedAt.getTime();
    const res = await app.inject({ method: 'POST', url: '/drive/files/file-modified-recently/open' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe('file-modified-recently');
    const update = rawCalls.find((c) => c.sql.startsWith('UPDATE "drive_files"'));
    expect(update).toBeDefined();
    expect(update!.params).toEqual(['file-modified-recently']);
    // Only the opened-at column is written; updatedAt must not move.
    expect(update!.sql).not.toContain('"updatedAt"');
    expect(files[1].lastOpenedAt).not.toBeNull();
    expect(files[1].updatedAt.getTime()).toBe(before);
  });

  it('POST /drive/files/:id/open 404s for unknown files and 401s without auth', async () => {
    const app = await buildApp();
    const missing = await app.inject({ method: 'POST', url: '/drive/files/nope/open' });
    expect(missing.statusCode).toBe(404);
    expect(rawCalls.filter((c) => c.sql.startsWith('UPDATE'))).toHaveLength(0);

    const anon = await buildApp(null);
    const unauth = await anon.inject({ method: 'POST', url: '/drive/files/file-modified-recently/open' });
    expect(unauth.statusCode).toBe(401);
  });

  it('GET /drive/files/:id/download records the open', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-modified-recently/download' });
    expect(res.statusCode).toBe(200);
    const update = rawCalls.find((c) => c.sql.startsWith('UPDATE "drive_files"'));
    expect(update).toBeDefined();
    expect(update!.params).toEqual(['file-modified-recently']);
  });

  it('a tracking write failure never breaks open or download', async () => {
    rawShouldThrow = true;
    const app = await buildApp();
    const openRes = await app.inject({ method: 'POST', url: '/drive/files/file-modified-recently/open' });
    expect(openRes.statusCode).toBe(200);
    const dlRes = await app.inject({ method: 'GET', url: '/drive/files/file-modified-recently/download' });
    expect(dlRes.statusCode).toBe(200);
  });
});
