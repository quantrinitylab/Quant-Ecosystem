// @vitest-environment node
// ============================================================================
// QuantDrive Deep Parity - Public Links, Trash Sweeper & Cursor Pagination
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
  DRIVE_QUOTA_BYTES: 15 * 1024 * 1024 * 1024,
  checkedPlaintext: vi.fn(async () => Buffer.from('quant-public-streamed-file-content')),
  decryptFromDrive: vi.fn(),
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
  getDriveObject: vi.fn(),
  putDriveObject: vi.fn(async () => {}),
  safeFileName: vi.fn((n: string) => n),
  hashFromVersionKey: vi.fn(() => null),
}));

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
}

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
  encryptedContent: string;
  encryptionIV: string;
  encryptionAuthTag: string;
  encryptionKey: string;
  contentHash: string;
  userId: string;
  updatedAt: Date;
  createdAt: Date;
}

interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  userId: string;
  isStarred: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
  trashRootId: string | null;
  updatedAt: Date;
  createdAt: Date;
}

interface DriveShareRow {
  id: string;
  fileId: string;
  createdById: string;
  token: string;
  role: string;
  password: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

let users: UserRow[] = [];
let files: FileRow[] = [];
let folders: FolderRow[] = [];
let driveShares: DriveShareRow[] = [];

function matches(record: any, where: any): boolean {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    if (key === 'OR' && Array.isArray(val)) {
      if (!val.some((subWhere: any) => matches(record, subWhere))) return false;
      continue;
    }
    if (key === 'AND' && Array.isArray(val)) {
      if (!val.every((subWhere: any) => matches(record, subWhere))) return false;
      continue;
    }
    const recVal = record[key];
    if (val && typeof val === 'object' && !(val instanceof Date)) {
      if ('in' in val && Array.isArray(val.in)) {
        if (!val.in.includes(recVal)) return false;
      }
      if ('not' in val) {
        if (recVal === val.not) return false;
      }
      if ('lte' in val && val.lte instanceof Date) {
        if (!recVal || !(recVal instanceof Date) || recVal.getTime() > val.lte.getTime())
          return false;
      }
      if ('gte' in val && val.gte instanceof Date) {
        if (!recVal || !(recVal instanceof Date) || recVal.getTime() < val.gte.getTime())
          return false;
      }
      if ('equals' in val) {
        const obj = val as Record<string, unknown>;
        if (obj.mode === 'insensitive') {
          if (String(recVal).toLowerCase() !== String(obj.equals).toLowerCase()) return false;
        } else if (recVal !== obj.equals) {
          return false;
        }
      }
    } else {
      if (recVal !== val) return false;
    }
  }
  return true;
}

function createFakePrisma() {
  const fake = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((u) => u.id === where.id) ?? null,
      findFirst: async ({ where }: { where: any }) => users.find((u) => matches(u, where)) ?? null,
      findMany: async ({ where, select }: { where?: any; select?: any }) => {
        void select;
        return users.filter((u) => matches(u, where));
      },
    },
    driveShare: {
      findUnique: async ({ where }: { where: { id?: string; token?: string } }) => {
        if (where.id) return driveShares.find((s) => s.id === where.id) ?? null;
        if (where.token) return driveShares.find((s) => s.token === where.token) ?? null;
        return null;
      },
      findFirst: async ({ where }: { where: any }) =>
        driveShares.find((s) => matches(s, where)) ?? null,
      findMany: async ({ where }: { where?: any }) => driveShares.filter((s) => matches(s, where)),
      create: async ({ data }: { data: any }) => {
        const record: DriveShareRow = {
          id: `share_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          fileId: data.fileId,
          createdById: data.createdById,
          token: data.token,
          role: data.role ?? 'viewer',
          password: data.password ?? null,
          expiresAt: data.expiresAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        driveShares.push(record);
        return record;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = driveShares.findIndex((s) => s.id === where.id);
        if (idx !== -1) driveShares.splice(idx, 1);
        return { ok: true };
      },
      deleteMany: async ({ where }: { where: any }) => {
        const initial = driveShares.length;
        driveShares = driveShares.filter((s) => !matches(s, where));
        return { count: initial - driveShares.length };
      },
    },
    file: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        files.find((f) => f.id === where.id) ?? null,
      findFirst: async ({ where }: { where: any }) => files.find((f) => matches(f, where)) ?? null,
      findMany: async ({
        where,
        orderBy,
        take,
        cursor,
        skip,
      }: {
        where?: any;
        orderBy?: any;
        take?: number;
        cursor?: any;
        skip?: number;
      }) => {
        let res = files.filter((f) => matches(f, where));
        if (orderBy) {
          const orderConfig = Array.isArray(orderBy) ? orderBy[0] : orderBy;
          const [field, dir] = Object.entries(orderConfig)[0];
          res.sort((a: any, b: any) => {
            const valA = a[field];
            const valB = b[field];
            if (valA < valB) return dir === 'asc' ? -1 : 1;
            if (valA > valB) return dir === 'asc' ? 1 : -1;
            return 0;
          });
        }
        if (cursor) {
          const idx = res.findIndex((f) => f.id === cursor.id);
          if (idx !== -1) {
            res = res.slice(idx + (skip ?? 0));
          }
        }
        if (take) res = res.slice(0, take);
        return res;
      },
      aggregate: async ({ where }: { where?: any }) => {
        const matching = files.filter((f) => matches(f, where));
        const sum = matching.reduce((acc, f) => acc + (f.size || 0), 0);
        return { _sum: { size: sum } };
      },
      count: async ({ where }: { where?: any }) => files.filter((f) => matches(f, where)).length,
      deleteMany: async ({ where }: { where: any }) => {
        const initial = files.length;
        files = files.filter((f) => !matches(f, where));
        return { count: initial - files.length };
      },
    },
    folder: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        folders.find((f) => f.id === where.id) ?? null,
      findFirst: async ({ where }: { where: any }) =>
        folders.find((f) => matches(f, where)) ?? null,
      findMany: async ({ where, orderBy }: { where?: any; orderBy?: any }) => {
        void orderBy;
        return folders.filter((f) => matches(f, where));
      },
      deleteMany: async ({ where }: { where: any }) => {
        const initial = folders.length;
        folders = folders.filter((f) => !matches(f, where));
        return { count: initial - folders.length };
      },
    },
    share: {
      findFirst: async () => null,
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    fileVersion: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    fileIndex: {
      deleteMany: async () => ({ count: 0 }),
    },
    fileStar: {
      findMany: async () => [],
    },
    fileTag: {
      findMany: async () => [],
    },
    userSubscription: {
      findUnique: async () => null,
      findFirst: async () => null,
    },
    $transaction: async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === 'function') return arg(fake);
      return null;
    },
  };
  return fake;
}

async function buildTestApp(currentUserId: string | null = 'user_alice'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const fakePrisma = createFakePrisma();
  app.decorate('prisma', fakePrisma as any);

  app.addHook('onRequest', async (request) => {
    const headerUser = request.headers['x-user-id'] as string | undefined;
    const uid = headerUser !== undefined ? headerUser || undefined : currentUserId;
    if (uid) {
      (request as unknown as { auth: { userId: string } }).auth = { userId: uid };
    }
  });

  app.setErrorHandler((error: any, request, reply) => {
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      success: false,
      message: error.message,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message },
    });
  });

  const driveRoutes = (await import('../routes/drive')).default;
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

describe('QuantDrive Deep Parity — Links, Sweeper & Cursor Pagination', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    users = [
      { id: 'user_alice', email: 'alice@quantmail.in', displayName: 'Alice' },
      { id: 'user_bob', email: 'bob@quantmail.in', displayName: 'Bob' },
    ];
    files = [
      {
        id: 'file_spec_1',
        name: 'quant-specs.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'enc_content_1',
        encryptionIV: 'iv1',
        encryptionAuthTag: 'tag1',
        encryptionKey: 'key1',
        contentHash: 'hash1',
        userId: 'user_alice',
        updatedAt: new Date('2026-09-17T10:00:00Z'),
        createdAt: new Date('2026-09-17T09:00:00Z'),
      },
      {
        id: 'file_spec_2',
        name: 'quantum-architecture.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 2048,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'enc_content_2',
        encryptionIV: 'iv2',
        encryptionAuthTag: 'tag2',
        encryptionKey: 'key2',
        contentHash: 'hash2',
        userId: 'user_alice',
        updatedAt: new Date('2026-09-17T11:00:00Z'),
        createdAt: new Date('2026-09-17T09:30:00Z'),
      },
    ];
    folders = [];
    driveShares = [];
    app = await buildTestApp();
  });

  it('creates public link share with expiration and role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/drive/shares/link',
      headers: { 'content-type': 'application/json' },
      payload: {
        fileId: 'file_spec_1',
        role: 'viewer',
        expiresInDays: 7,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.share.token).toBeDefined();
    expect(body.share.shareUrl).toBe(`/drive/share/${body.share.token}`);
    expect(body.share.role).toBe('viewer');
    expect(body.share.expiresAt).toBeDefined();
    expect(driveShares.length).toBe(1);
    expect(driveShares[0].token).toBe(body.share.token);
  });

  it('rejects public link share creation by non-owner with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/drive/shares/link',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user_bob' },
      payload: {
        fileId: 'file_spec_1',
        role: 'viewer',
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('fetches file metadata via public share token without authentication', async () => {
    const token = 'pub_token_1234567890abcdef123456';
    driveShares.push({
      id: 'share_1',
      fileId: 'file_spec_1',
      createdById: 'user_alice',
      token,
      role: 'viewer',
      password: null,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/drive/public/share/${token}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.file.id).toBe('file_spec_1');
    expect(body.file.name).toBe('quant-specs.pdf');
    expect(body.file.mimeType).toBe('application/pdf');
    expect(body.file.ownerName).toBe('Alice');
    expect(body.file.role).toBe('viewer');
    expect(body.file.requiresPassword).toBe(false);
  });

  it('rejects expired public share token with 410 LINK_EXPIRED', async () => {
    const token = 'expired_token_1234567890abcdef12';
    driveShares.push({
      id: 'share_expired',
      fileId: 'file_spec_1',
      createdById: 'user_alice',
      token,
      role: 'viewer',
      password: null,
      expiresAt: new Date(Date.now() - 10000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/drive/public/share/${token}`,
    });

    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/expired/i);
  });

  it('streams file content on public download route with correct headers', async () => {
    const token = 'download_token_1234567890abcdef';
    driveShares.push({
      id: 'share_dl',
      fileId: 'file_spec_1',
      createdById: 'user_alice',
      token,
      role: 'viewer',
      password: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/drive/public/share/${token}/download`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('quant-specs.pdf');
    expect(res.body).toBe('quant-public-streamed-file-content');
  });

  it('revokes public share link when requested by owner', async () => {
    const token = 'revokable_token_1234567890abcdef';
    driveShares.push({
      id: 'share_to_del',
      fileId: 'file_spec_1',
      createdById: 'user_alice',
      token,
      role: 'viewer',
      password: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/drive/shares/link/share_to_del',
    });

    expect(res.statusCode).toBe(200);
    expect(driveShares.find((s) => s.id === 'share_to_del')).toBeUndefined();
  });

  it('executes trash retention auto-purge cleanup sweeper', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000);
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);

    files.push(
      {
        id: 'file_old_trash',
        name: 'old-backup.zip',
        mimeType: 'application/zip',
        size: 5000,
        folderId: null,
        isStarred: false,
        isDeleted: true,
        deletedAt: fortyDaysAgo,
        trashRootId: null,
        encryptedContent: 'enc_old',
        encryptionIV: 'iv_old',
        encryptionAuthTag: 'tag_old',
        encryptionKey: 'key_old',
        contentHash: 'hash_old',
        userId: 'user_alice',
        updatedAt: fortyDaysAgo,
        createdAt: fortyDaysAgo,
      },
      {
        id: 'file_recent_trash',
        name: 'recent-backup.zip',
        mimeType: 'application/zip',
        size: 5000,
        folderId: null,
        isStarred: false,
        isDeleted: true,
        deletedAt: tenDaysAgo,
        trashRootId: null,
        encryptedContent: 'enc_recent',
        encryptionIV: 'iv_recent',
        encryptionAuthTag: 'tag_recent',
        encryptionKey: 'key_recent',
        contentHash: 'hash_recent',
        userId: 'user_alice',
        updatedAt: tenDaysAgo,
        createdAt: tenDaysAgo,
      },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/drive/trash/cleanup',
      headers: { 'content-type': 'application/json' },
      payload: { retentionDays: 30 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.purgedCount).toBe(1);
    expect(files.find((f) => f.id === 'file_old_trash')).toBeUndefined();
    expect(files.find((f) => f.id === 'file_recent_trash')).toBeDefined();
  });

  it('supports server-side cursor pagination and sorting on GET /drive/files', async () => {
    for (let i = 1; i <= 10; i++) {
      files.push({
        id: `file_seq_${i.toString().padStart(2, '0')}`,
        name: `document_${i.toString().padStart(2, '0')}.pdf`,
        mimeType: 'application/pdf',
        size: i * 100,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: `enc_${i}`,
        encryptionIV: `iv_${i}`,
        encryptionAuthTag: `tag_${i}`,
        encryptionKey: `key_${i}`,
        contentHash: `hash_${i}`,
        userId: 'user_alice',
        updatedAt: new Date(Date.now() + i * 1000),
        createdAt: new Date(),
      });
    }

    const resPage1 = await app.inject({
      method: 'GET',
      url: '/drive/files?limit=3&sortBy=name&sortDir=asc',
    });

    expect(resPage1.statusCode).toBe(200);
    const page1 = JSON.parse(resPage1.body);
    expect(page1.files.length).toBe(3);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeDefined();

    const resPage2 = await app.inject({
      method: 'GET',
      url: `/drive/files?limit=3&sortBy=name&sortDir=asc&cursor=${page1.nextCursor}`,
    });

    expect(resPage2.statusCode).toBe(200);
    const page2 = JSON.parse(resPage2.body);
    expect(page2.files.length).toBe(3);
    expect(page2.files[0].id).not.toBe(page1.files[0].id);
  });
});
