// @vitest-environment node
// ============================================================================
// QM-M39-008 — Drive per-file activity/history view (M39 screen 25) route tests.
// Covers: the backend event log for file actions — upload, rename, move,
// share change (added/updated/revoked), version restore — and the
// GET /drive/files/:id/activity read path (newest-first, honest empty list).
//
// No fake activity: every event asserted here is produced by the real route
// handler performing the real action. Event-write failures must never break
// the action itself (same best-effort contract as QM-M39-002 tracking).
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
  checkedPlaintext: vi.fn(async () => Buffer.from('activity-bytes')),
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

interface ActivityRow {
  id: string;
  fileId: string;
  userId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

interface FileRow {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  isStarred: boolean;
  isDeleted: boolean;
  userId: string;
  updatedAt: Date;
  createdAt: Date;
}

interface ShareRow {
  id: string;
  fileId: string | null;
  folderId: string | null;
  ownerUserId: string;
  sharedWithUserId: string;
  permission: string;
  status: string;
}

interface FolderRow {
  id: string;
  name: string;
  userId: string;
  parentId: string | null;
  path: string;
  isDeleted: boolean;
}

let files: FileRow[] = [];
let shares: ShareRow[] = [];
let folders: FolderRow[] = [];
let events: ActivityRow[] = [];
let versions: Array<{ id: string; fileId: string; versionNumber: number; size: number }> = [];
const rawCalls: Array<{ sql: string; params: unknown[] }> = [];
let rawShouldThrow = false;

const users = new Map<string, { id: string; displayName: string; email: string }>([
  ['user-owner', { id: 'user-owner', displayName: 'Owner Name', email: 'owner@quantmail.in' }],
  ['user-friend', { id: 'user-friend', displayName: 'Friend', email: 'friend@quantmail.in' }],
  ['user-stranger', { id: 'user-stranger', displayName: 'Stranger', email: 'x@quantmail.in' }],
]);

function makeFile(partial: Partial<FileRow> & { id: string }): FileRow {
  return {
    name: 'doc.pdf',
    mimeType: 'application/pdf',
    size: 10,
    folderId: null,
    isStarred: false,
    isDeleted: false,
    userId: 'user-owner',
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...partial,
  };
}

function matchesFileWhere(f: FileRow, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (key === 'id' && typeof value === 'object' && value !== null && 'in' in value) {
      if (!(value as { in: string[] }).in.includes(f.id)) return false;
    } else if ((f as unknown as Record<string, unknown>)[key] !== value) {
      return false;
    }
  }
  return true;
}

function createFakePrisma() {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.get(where.id) ?? null,
      findMany: async () => [],
      findFirst: async ({ where }: { where: { email?: { equals: string; mode?: string } } }) => {
        const target = where.email?.equals?.toLowerCase();
        for (const u of users.values()) if (u.email.toLowerCase() === target) return u;
        return null;
      },
    },
    userSubscription: {
      findUnique: async () => null,
    },
    file: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        files.find((f) => f.id === where.id) ?? null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        files.find((f) => matchesFileWhere(f, where)) ?? null,
      findMany: async ({ where }: { where?: Record<string, unknown> }) =>
        files.filter((f) => matchesFileWhere(f, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = makeFile({
          id: `file-${files.length + 1}`,
          ...(data as unknown as Partial<FileRow>),
        });
        files.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = files.find((f) => f.id === where.id);
        if (!row) throw new Error('file not found');
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const row of files) {
          if (matchesFileWhere(row, where)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
      aggregate: async () => ({
        _sum: { size: files.filter((f) => !f.isDeleted).reduce((s, f) => s + f.size, 0) },
      }),
    },
    folder: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        folders.find(
          (f) =>
            f.id === (where.id as string) &&
            (where.userId === undefined || f.userId === where.userId) &&
            (where.isDeleted === undefined || f.isDeleted === where.isDeleted),
        ) ?? null,
      findMany: async ({ where }: { where?: Record<string, unknown> }) => {
        let rows = [...folders];
        if (where?.id && typeof where.id === 'object' && 'in' in (where.id as object)) {
          const ids = (where.id as { in: string[] }).in;
          rows = rows.filter((f) => ids.includes(f.id));
        }
        return rows;
      },
    },
    share: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        shares.find((s) => {
          for (const [k, v] of Object.entries(where)) {
            if ((s as unknown as Record<string, unknown>)[k] !== v) return false;
          }
          return true;
        }) ?? null,
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `share-${shares.length + 1}`, ...(data as unknown as Omit<ShareRow, 'id'>) };
        shares.push(row as ShareRow);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = shares.find((s) => s.id === where.id);
        if (!row) throw new Error('share not found');
        Object.assign(row, data);
        return row;
      },
    },
    fileVersion: {
      findMany: async () => [],
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        versions.find(
          (v) =>
            (where.fileId === undefined || v.fileId === where.fileId) &&
            (where.id === undefined || v.id === where.id),
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ver-${versions.length + 1}`, ...(data as { fileId: string; versionNumber: number; size: number }) };
        versions.push(row);
        return row;
      },
    },
    $transaction: async (ops: Array<Promise<unknown>>) => {
      const results: unknown[] = [];
      for (const op of ops) results.push(await op);
      return results;
    },
    $executeRawUnsafe: async (sql: string, ...params: unknown[]) => {
      rawCalls.push({ sql, params });
      if (rawShouldThrow) throw new Error('db down');
      if (sql.includes('INSERT INTO "drive_file_activity_events"')) {
        events.push({
          id: params[0] as string,
          fileId: params[1] as string,
          userId: params[2] as string,
          actorUserId: params[3] as string,
          actorName: params[4] as string | null,
          actorEmail: params[5] as string | null,
          action: params[6] as string,
          details: JSON.parse(params[7] as string),
          createdAt: params[8] as Date,
        });
        return 1;
      }
      return 1;
    },
    $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
      rawCalls.push({ sql, params });
      if (rawShouldThrow) throw new Error('db down');
      if (sql.includes('FROM "drive_file_activity_events"')) {
        const fileId = params[0] as string;
        const limit = params[1] as number;
        return events
          .filter((e) => e.fileId === fileId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit)
          .map((e) => ({ ...e }));
      }
      return [];
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

const uploadBody = (name = 'report.pdf') => ({
  name,
  mimeType: 'application/pdf',
  contentBase64: Buffer.from('hello-bytes').toString('base64'),
});

describe('QM-M39-008 Drive activity event log', () => {
  beforeEach(() => {
    rawCalls.length = 0;
    rawShouldThrow = false;
    files = [makeFile({ id: 'file-1', name: 'report.pdf' })];
    shares = [];
    folders = [
      { id: 'folder-a', name: 'Invoices', userId: 'user-owner', parentId: null, path: '/Invoices', isDeleted: false },
      { id: 'folder-b', name: 'Archive', userId: 'user-owner', parentId: null, path: '/Archive', isDeleted: false },
    ];
    events = [];
    versions = [];
  });

  it('POST /drive/upload records an upload event with real file details', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/drive/upload', payload: uploadBody() });
    expect(res.statusCode).toBe(201);
    const insert = rawCalls.find((c) => c.sql.includes('INSERT INTO "drive_file_activity_events"'));
    expect(insert).toBeDefined();
    const fileId = (insert!.params[1] as string);
    expect(insert!.params[6]).toBe('upload');
    expect(insert!.params[3]).toBe('user-owner'); // actorUserId
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('upload');
    expect(events[0].fileId).toBe(fileId);
    expect(events[0].details.name).toBe('report.pdf');
  });

  it('upload still succeeds when the event write fails (best-effort)', async () => {
    rawShouldThrow = true;
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/drive/upload', payload: uploadBody() });
    expect(res.statusCode).toBe(201);
    expect(events).toHaveLength(0);
  });

  it('PUT /drive/files/:id records a rename event with from/to names', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/drive/files/file-1',
      payload: { name: 'report-final.pdf' },
    });
    expect(res.statusCode).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('rename');
    expect(events[0].details).toMatchObject({ fromName: 'report.pdf', toName: 'report-final.pdf' });
  });

  it('rename with an unchanged name records no event', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/drive/files/file-1',
      payload: { name: 'report.pdf' },
    });
    expect(res.statusCode).toBe(200);
    expect(events).toHaveLength(0);
  });

  it('POST /drive/move records a move event with from/to folder references', async () => {
    files[0].folderId = 'folder-a';
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/drive/move',
      payload: { fileIds: ['file-1'], targetFolderId: 'folder-b' },
    });
    expect(res.statusCode).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('move');
    expect(events[0].details).toMatchObject({
      fromFolderId: 'folder-a',
      toFolderId: 'folder-b',
      fromFolderName: 'Invoices',
      toFolderName: 'Archive',
    });
  });

  it('moving a file that is already in the target folder records no event', async () => {
    files[0].folderId = 'folder-b';
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/drive/move',
      payload: { fileIds: ['file-1'], targetFolderId: 'folder-b' },
    });
    expect(res.statusCode).toBe(200);
    expect(events).toHaveLength(0);
  });

  it('moving a file the user does not own records no event for it', async () => {
    files.push(makeFile({ id: 'file-other', userId: 'user-stranger' }));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/drive/move',
      payload: { fileIds: ['file-1', 'file-other'], targetFolderId: 'folder-b' },
    });
    expect(res.statusCode).toBe(200);
    // Only the owned file moved and is logged.
    expect(events).toHaveLength(1);
    expect(events[0].fileId).toBe('file-1');
  });

  it('POST /drive/files/:id/share records share_added, then share_updated', async () => {
    const app = await buildApp();
    const first = await app.inject({
      method: 'POST',
      url: '/drive/files/file-1/share',
      payload: { email: 'friend@quantmail.in', permission: 'view' },
    });
    expect(first.statusCode).toBe(201);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('share_added');
    expect(events[0].details).toMatchObject({ email: 'friend@quantmail.in', permission: 'view' });

    const second = await app.inject({
      method: 'POST',
      url: '/drive/files/file-1/share',
      payload: { email: 'friend@quantmail.in', permission: 'edit' },
    });
    expect(second.statusCode).toBe(200);
    expect(events).toHaveLength(2);
    expect(events[1].action).toBe('share_updated');
    expect(events[1].details).toMatchObject({ email: 'friend@quantmail.in', permission: 'edit' });
  });

  it('DELETE /drive/files/:id/share/:shareId records share_revoked', async () => {
    shares.push({
      id: 'share-1',
      fileId: 'file-1',
      folderId: null,
      ownerUserId: 'user-owner',
      sharedWithUserId: 'user-friend',
      permission: 'read',
      status: 'accepted',
    });
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/drive/files/file-1/share/share-1' });
    expect(res.statusCode).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('share_revoked');
    expect(events[0].details).toMatchObject({ email: 'friend@quantmail.in' });
  });

  it('POST /drive/files/:id/versions/:versionId/restore records version_restored', async () => {
    versions.push({ id: 'ver-2', fileId: 'file-1', versionNumber: 2, size: 42 });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/file-1/versions/ver-2/restore',
    });
    expect(res.statusCode).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('version_restored');
    expect(events[0].details).toMatchObject({ versionNumber: 2 });
  });

  it('GET /drive/files/:id/activity returns events newest-first', async () => {
    const base = new Date('2026-10-01T00:00:00Z').getTime();
    events = [
      {
        id: 'e-old',
        fileId: 'file-1',
        userId: 'user-owner',
        actorUserId: 'user-owner',
        actorName: 'Owner Name',
        actorEmail: 'owner@quantmail.in',
        action: 'upload',
        details: {},
        createdAt: new Date(base),
      },
      {
        id: 'e-new',
        fileId: 'file-1',
        userId: 'user-owner',
        actorUserId: 'user-owner',
        actorName: 'Owner Name',
        actorEmail: 'owner@quantmail.in',
        action: 'rename',
        details: { fromName: 'a', toName: 'b' },
        createdAt: new Date(base + 1000),
      },
      {
        id: 'e-other-file',
        fileId: 'file-2',
        userId: 'user-owner',
        actorUserId: 'user-owner',
        actorName: 'Owner Name',
        actorEmail: 'owner@quantmail.in',
        action: 'upload',
        details: {},
        createdAt: new Date(base + 2000),
      },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/activity' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fileId).toBe('file-1');
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(['e-new', 'e-old']);
    expect(body.events[0]).toMatchObject({
      action: 'rename',
      actor: { userId: 'user-owner', name: 'Owner Name', email: 'owner@quantmail.in' },
      details: { fromName: 'a', toName: 'b' },
    });
    expect(typeof body.events[0].createdAt).toBe('string');
  });

  it('GET /drive/files/:id/activity is an honest empty list when nothing was recorded', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/activity' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ fileId: 'file-1', events: [] });
  });

  it('GET /drive/files/:id/activity degrades to an empty list when the event table is missing', async () => {
    rawShouldThrow = true;
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/activity' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ fileId: 'file-1', events: [] });
  });

  it('GET /drive/files/:id/activity requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/activity' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /drive/files/:id/activity returns 404 for an unknown file', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/drive/files/nope/activity' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /drive/files/:id/activity returns 403 for a user with no access', async () => {
    const app = await buildApp('user-stranger');
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/activity' });
    expect(res.statusCode).toBe(403);
  });

  it('GET /drive/files/:id/activity is visible to an accepted share recipient', async () => {
    shares.push({
      id: 'share-9',
      fileId: 'file-1',
      folderId: null,
      ownerUserId: 'user-owner',
      sharedWithUserId: 'user-stranger',
      permission: 'read',
      status: 'accepted',
    });
    events.push({
      id: 'e-1',
      fileId: 'file-1',
      userId: 'user-owner',
      actorUserId: 'user-owner',
      actorName: null,
      actorEmail: null,
      action: 'upload',
      details: {},
      createdAt: new Date(),
    });
    const app = await buildApp('user-stranger');
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/activity' });
    expect(res.statusCode).toBe(200);
    expect(res.json().events).toHaveLength(1);
  });

  it('GET /drive/files/:id/activity caps the limit at 200', async () => {
    for (let i = 0; i < 210; i++) {
      events.push({
        id: `e-${i}`,
        fileId: 'file-1',
        userId: 'user-owner',
        actorUserId: 'user-owner',
        actorName: null,
        actorEmail: null,
        action: 'upload',
        details: {},
        createdAt: new Date(1000 + i),
      });
    }
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/activity?limit=9999' });
    expect(res.statusCode).toBe(200);
    expect(res.json().events).toHaveLength(200);
    const limitedCall = rawCalls.find((c) => c.sql.includes('FROM "drive_file_activity_events"'));
    expect(limitedCall!.params[1]).toBe(200);
  });
});
