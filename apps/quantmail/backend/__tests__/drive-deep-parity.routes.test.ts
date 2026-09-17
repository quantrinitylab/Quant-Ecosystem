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

interface ShareRow {
  id: string;
  fileId: string | null;
  folderId: string | null;
  ownerUserId: string;
  sharedWithUserId: string;
  encryptedFileKey: string;
  permission: string;
  status: string;
  createdAt: Date;
}

interface EmailRow {
  id: string;
  userId?: string;
  from?: string;
  fromAddress?: string;
  fromName?: string;
  to?: string;
  toAddresses?: any;
  subject?: string;
  bodyText?: string;
  bodyPlain?: string;
  bodyHtml?: string;
  folder?: string;
  folderId?: string;
  deliveryStatus?: string;
  isRead?: boolean;
  createdAt?: Date;
}

let users: UserRow[] = [];
let files: FileRow[] = [];
let folders: FolderRow[] = [];
let driveShares: DriveShareRow[] = [];
let shares: ShareRow[] = [];
let emails: EmailRow[] = [];

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
      if ('startsWith' in val && typeof (val as any).startsWith === 'string') {
        const obj = val as Record<string, unknown>;
        const prefix = (val as any).startsWith;
        if (obj.mode === 'insensitive') {
          if (!String(recVal).toLowerCase().startsWith(prefix.toLowerCase())) return false;
        } else if (!String(recVal).startsWith(prefix)) {
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
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const item = folders.find((f) => f.id === where.id);
        if (item) Object.assign(item, data);
        return item;
      },
    },
    share: {
      findFirst: async ({ where }: { where?: any }) =>
        shares.find((s) => matches(s, where)) ?? null,
      findMany: async ({ where }: { where?: any }) => shares.filter((s) => matches(s, where)),
      create: async ({ data }: { data: any }) => {
        const row: ShareRow = {
          id: `share_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          fileId: data.fileId ?? null,
          folderId: data.folderId ?? null,
          ownerUserId: data.ownerUserId,
          sharedWithUserId: data.sharedWithUserId,
          encryptedFileKey: data.encryptedFileKey ?? '',
          permission: data.permission,
          status: data.status ?? 'pending',
          createdAt: new Date(),
        };
        shares.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const item = shares.find((s) => s.id === where.id);
        if (item) Object.assign(item, data);
        return item;
      },
      deleteMany: async ({ where }: { where: any }) => {
        const initial = shares.length;
        shares = shares.filter((s) => !matches(s, where));
        return { count: initial - shares.length };
      },
    },
    email: {
      findMany: async ({ where }: { where?: any }) => emails.filter((e) => matches(e, where)),
      create: async ({ data }: { data: any }) => {
        const row: EmailRow = {
          id: `email_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          ...data,
          createdAt: new Date(),
        };
        emails.push(row);
        return row;
      },
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
    shares = [];
    emails = [];
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

  it('Task D02: POST /drive/files/:id/share creates share and sends notification email record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/file_spec_1/share',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'bob@quantmail.in',
        permission: 'view',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.share).toBeDefined();
    expect(body.share.email).toBe('bob@quantmail.in');
    expect(body.share.permission).toBe('view');
    expect(body.share.status).toBe('pending');
    expect(body.share.notificationSent).toBe(true);
    expect(body.notificationSent).toBe(true);

    // Verify share row in database
    expect(shares.length).toBe(1);
    expect(shares[0].fileId).toBe('file_spec_1');
    expect(shares[0].sharedWithUserId).toBe('user_bob');
    expect(shares[0].ownerUserId).toBe('user_alice');

    // Verify email invitation record in database
    expect(emails.length).toBe(1);
    const invite = emails[0];
    expect(invite.from).toBe('alice@quantmail.in');
    expect(invite.to).toBe('bob@quantmail.in');
    expect(invite.subject).toBe('Alice shared "quant-specs.pdf" with you');
    expect(invite.bodyText).toBe(
      `Alice has invited you to view/edit "quant-specs.pdf". View it in QuantDrive: /drive?shareId=${shares[0].id}`,
    );
    expect(invite.bodyHtml).toBe(
      `<p><strong>Alice</strong> shared "<strong>quant-specs.pdf</strong>" with you.</p><p><a href="/drive?shareId=${shares[0].id}">Open in QuantDrive</a></p>`,
    );
    expect(invite.folder).toBe('INBOX');

    // Updating existing share retains notificationSent
    const resUpdate = await app.inject({
      method: 'POST',
      url: '/drive/files/file_spec_1/share',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'bob@quantmail.in',
        permission: 'edit',
      },
    });

    expect(resUpdate.statusCode).toBe(200);
    const bodyUpdate = JSON.parse(resUpdate.body);
    expect(bodyUpdate.share.permission).toBe('edit');
    expect(bodyUpdate.share.notificationSent).toBe(true);
    expect(emails.length).toBe(2);
  });

  it('Task D12: POST /drive/repair-paths repairs mismatched folder paths recursively', async () => {
    folders.push(
      {
        id: 'folder_root_docs',
        name: 'Documents',
        parentId: null,
        path: '/corrupted_docs_path',
        userId: 'user_alice',
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'folder_child_work',
        name: 'Work',
        parentId: 'folder_root_docs',
        path: '/some_wrong_prefix/Work',
        userId: 'user_alice',
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'folder_sub_projects',
        name: 'Projects',
        parentId: 'folder_child_work',
        path: '/Documents/Work/Projects',
        userId: 'user_alice',
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'folder_root_photos',
        name: 'Photos',
        parentId: null,
        path: '/Photos',
        userId: 'user_alice',
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/drive/repair-paths',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.scanned).toBe(4);
    expect(body.data.repaired).toBe(2);

    // Verify folder paths were updated in database
    expect(folders.find((f) => f.id === 'folder_root_docs')?.path).toBe('/Documents');
    expect(folders.find((f) => f.id === 'folder_child_work')?.path).toBe('/Documents/Work');
    expect(folders.find((f) => f.id === 'folder_sub_projects')?.path).toBe(
      '/Documents/Work/Projects',
    );
    expect(folders.find((f) => f.id === 'folder_root_photos')?.path).toBe('/Photos');

    // Re-running repair-paths should report 0 repaired (idempotent)
    const resIdempotent = await app.inject({
      method: 'POST',
      url: '/drive/repair-paths',
    });
    expect(resIdempotent.statusCode).toBe(200);
    const bodyIdempotent = JSON.parse(resIdempotent.body);
    expect(bodyIdempotent.data.scanned).toBe(4);
    expect(bodyIdempotent.data.repaired).toBe(0);
  });

  it('Task D17: fileDto includes thumbnailUrl: /api/drive/files/:id/thumbnail', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/drive/files',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files).toBeDefined();
    const file1 = body.files.find((f: any) => f.id === 'file_spec_1');
    expect(file1).toBeDefined();
    expect(file1.thumbnailUrl).toBe('/api/drive/files/file_spec_1/thumbnail');

    const file2 = body.files.find((f: any) => f.id === 'file_spec_2');
    expect(file2).toBeDefined();
    expect(file2.thumbnailUrl).toBe('/api/drive/files/file_spec_2/thumbnail');
  });

  it('Task D17: GET /drive/files/:id/thumbnail returns thumbnail preview with valid headers for non-image file', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/drive/files/file_spec_1/thumbnail',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/svg+xml');
    expect(res.headers['cache-control']).toBe('private, max-age=86400');
    expect(res.body).toContain('<svg');
    expect(res.body).toContain('PDF');
    expect(res.body).toContain('quant-specs.pdf');
  });

  it('Task D17: GET /drive/files/:id/thumbnail returns decrypted thumbnail preview with valid headers for image file', async () => {
    files.push({
      id: 'file_img_banner',
      name: 'banner.png',
      mimeType: 'image/png',
      size: 1024,
      folderId: null,
      isStarred: false,
      isDeleted: false,
      deletedAt: null,
      trashRootId: null,
      encryptedContent: 'enc_img_banner',
      encryptionIV: 'iv_banner',
      encryptionAuthTag: 'tag_banner',
      encryptionKey: 'key_banner',
      contentHash: 'hash_banner',
      userId: 'user_alice',
      updatedAt: new Date(),
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/drive/files/file_img_banner/thumbnail',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('private, max-age=86400');
    expect(res.body).toBe('quant-public-streamed-file-content');
  });

  it('Task D17: GET /drive/files/:id/thumbnail requires authentication and enforces access permissions', async () => {
    // Unauthenticated request
    const resUnauth = await app.inject({
      method: 'GET',
      url: '/drive/files/file_spec_1/thumbnail',
      headers: { 'x-user-id': '' },
    });
    expect(resUnauth.statusCode).toBe(401);

    // Request by unauthorized user
    const resForbidden = await app.inject({
      method: 'GET',
      url: '/drive/files/file_spec_1/thumbnail',
      headers: { 'x-user-id': 'user_bob' },
    });
    expect(resForbidden.statusCode).toBe(403);

    // Request by authorized user with accepted share
    shares.push({
      id: 'share_thumb_bob',
      fileId: 'file_spec_1',
      folderId: null,
      ownerUserId: 'user_alice',
      sharedWithUserId: 'user_bob',
      encryptedFileKey: 'key1',
      permission: 'read',
      status: 'accepted',
      createdAt: new Date(),
    });

    const resShared = await app.inject({
      method: 'GET',
      url: '/drive/files/file_spec_1/thumbnail',
      headers: { 'x-user-id': 'user_bob' },
    });
    expect(resShared.statusCode).toBe(200);
    expect(resShared.headers['content-type']).toBe('image/svg+xml');
  });

  it('Task D15/D20: GET /drive/files?filter=images returns only image files', async () => {
    files.push(
      {
        id: 'file_img_photo',
        name: 'landscape.jpg',
        mimeType: 'image/jpeg',
        size: 2048,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'enc_img_photo',
        encryptionIV: 'iv_photo',
        encryptionAuthTag: 'tag_photo',
        encryptionKey: 'key_photo',
        contentHash: 'hash_photo',
        userId: 'user_alice',
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'file_img_png',
        name: 'diagram.png',
        mimeType: 'image/png',
        size: 1024,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'enc_img_png',
        encryptionIV: 'iv_png',
        encryptionAuthTag: 'tag_png',
        encryptionKey: 'key_png',
        contentHash: 'hash_png',
        userId: 'user_alice',
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    );
    folders.push({
      id: 'folder_img_test',
      name: 'Pictures',
      parentId: null,
      path: '/Pictures',
      userId: 'user_alice',
      isStarred: false,
      isDeleted: false,
      deletedAt: null,
      trashRootId: null,
      updatedAt: new Date(),
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/drive/files?filter=images',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files.length).toBeGreaterThan(0);
    expect(body.files.every((f: any) => f.type === 'file' && f.mimeType.startsWith('image/'))).toBe(
      true,
    );
    expect(body.files.some((f: any) => f.id === 'file_img_photo')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_img_png')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'folder_img_test')).toBe(false);
    expect(body.files.some((f: any) => f.id === 'file_spec_1')).toBe(false);
  });

  it('Task D15/D20: GET /drive/files?filter=documents returns only document files', async () => {
    files.push({
      id: 'file_audio_test',
      name: 'song.mp3',
      mimeType: 'audio/mpeg',
      size: 5000,
      folderId: null,
      isStarred: false,
      isDeleted: false,
      deletedAt: null,
      trashRootId: null,
      encryptedContent: 'enc_song',
      encryptionIV: 'iv_song',
      encryptionAuthTag: 'tag_song',
      encryptionKey: 'key_song',
      contentHash: 'hash_song',
      userId: 'user_alice',
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    folders.push({
      id: 'folder_docs_test',
      name: 'DocsFolder',
      parentId: null,
      path: '/DocsFolder',
      userId: 'user_alice',
      isStarred: false,
      isDeleted: false,
      deletedAt: null,
      trashRootId: null,
      updatedAt: new Date(),
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/drive/files?filter=documents',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files.length).toBe(2);
    expect(body.files.every((f: any) => f.type === 'file')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_spec_1')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_spec_2')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_audio_test')).toBe(false);
    expect(body.files.some((f: any) => f.id === 'folder_docs_test')).toBe(false);
  });

  it('Task D15/D20: GET /drive/files?filter=folders returns only folders without files', async () => {
    folders.push(
      {
        id: 'folder_f1',
        name: 'Folder Alpha',
        parentId: null,
        path: '/Folder Alpha',
        userId: 'user_alice',
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'folder_f2',
        name: 'Folder Beta',
        parentId: null,
        path: '/Folder Beta',
        userId: 'user_alice',
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/drive/files?filter=folders',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files.length).toBeGreaterThan(0);
    expect(body.files.every((f: any) => f.type === 'folder')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'folder_f1')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'folder_f2')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_spec_1')).toBe(false);
    expect(body.totalCount).toBe(0);
  });

  it('Task D15/D20: GET /drive/files?filter=starred returns only starred items', async () => {
    const file1 = files.find((f) => f.id === 'file_spec_1');
    if (file1) file1.isStarred = true;

    folders.push({
      id: 'folder_starred_1',
      name: 'Starred Folder',
      parentId: null,
      path: '/Starred Folder',
      userId: 'user_alice',
      isStarred: true,
      isDeleted: false,
      deletedAt: null,
      trashRootId: null,
      updatedAt: new Date(),
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/drive/files?filter=starred',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files.length).toBe(2);
    expect(body.files.every((f: any) => f.isStarred === true)).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_spec_1')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'folder_starred_1')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_spec_2')).toBe(false);
  });

  it('Task D15/D20: GET /drive/files?filter=spreadsheets returns only spreadsheet files', async () => {
    files.push(
      {
        id: 'file_sheet_csv',
        name: 'budget.csv',
        mimeType: 'text/csv',
        size: 512,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'enc_csv',
        encryptionIV: 'iv_csv',
        encryptionAuthTag: 'tag_csv',
        encryptionKey: 'key_csv',
        contentHash: 'hash_csv',
        userId: 'user_alice',
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'file_sheet_xlsx',
        name: 'financials.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'enc_xlsx',
        encryptionIV: 'iv_xlsx',
        encryptionAuthTag: 'tag_xlsx',
        encryptionKey: 'key_xlsx',
        contentHash: 'hash_xlsx',
        userId: 'user_alice',
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/drive/files?filter=spreadsheets',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files.length).toBe(2);
    expect(body.files.some((f: any) => f.id === 'file_sheet_csv')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_sheet_xlsx')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_spec_1')).toBe(false);
  });

  it('Task D15/D20: GET /drive/files?filter=media returns only audio and video files', async () => {
    files.push(
      {
        id: 'file_audio_1',
        name: 'podcast.mp3',
        mimeType: 'audio/mpeg',
        size: 4096,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'enc_aud',
        encryptionIV: 'iv_aud',
        encryptionAuthTag: 'tag_aud',
        encryptionKey: 'key_aud',
        contentHash: 'hash_aud',
        userId: 'user_alice',
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'file_video_1',
        name: 'intro.mp4',
        mimeType: 'video/mp4',
        size: 8192,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'enc_vid',
        encryptionIV: 'iv_vid',
        encryptionAuthTag: 'tag_vid',
        encryptionKey: 'key_vid',
        contentHash: 'hash_vid',
        userId: 'user_alice',
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/drive/files?filter=media',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files.length).toBe(2);
    expect(body.files.some((f: any) => f.id === 'file_audio_1')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_video_1')).toBe(true);
    expect(body.files.some((f: any) => f.id === 'file_spec_1')).toBe(false);
  });
});
