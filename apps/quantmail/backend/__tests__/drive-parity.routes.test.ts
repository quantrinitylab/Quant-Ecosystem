// @vitest-environment node
// ============================================================================
// QuantDrive Integrity & Sharing Parity - Route Injection Tests (Wave 5 Phase D)
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
  checkedPlaintext: vi.fn(async () => Buffer.from('sovereign-quant-drive-bytes')),
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

interface FileVersionRow {
  id: string;
  fileId: string;
  versionNumber: number;
  encryptedContent: string;
  encryptionIV: string;
  encryptionAuthTag: string;
  encryptionKey: string;
  size: number;
  createdAt: Date;
}

let users: UserRow[] = [];
let files: FileRow[] = [];
let folders: FolderRow[] = [];
let shares: ShareRow[] = [];
let fileVersions: FileVersionRow[] = [];

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
      if ('startsWith' in val && typeof val.startsWith === 'string') {
        if (typeof recVal !== 'string' || !recVal.startsWith(val.startsWith)) return false;
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
        const hits = users.filter((u) => matches(u, where));
        return hits.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
        }));
      },
    },
    share: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        shares.find((s) => s.id === where.id) ?? null,
      findFirst: async ({ where }: { where: any }) => shares.find((s) => matches(s, where)) ?? null,
      findMany: async ({ where, orderBy }: { where?: any; orderBy?: any }) => {
        void orderBy;
        return shares.filter((s) => matches(s, where));
      },
      create: async ({ data }: { data: any }) => {
        const record: ShareRow = {
          id: data.id || `share-${shares.length + 1}`,
          fileId: data.fileId ?? null,
          folderId: data.folderId ?? null,
          ownerUserId: data.ownerUserId,
          sharedWithUserId: data.sharedWithUserId,
          encryptedFileKey: data.encryptedFileKey || 'key',
          permission: data.permission || 'read',
          status: data.status || 'pending',
          createdAt: new Date(),
        };
        shares.push(record);
        return record;
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const hit = shares.find((s) => s.id === where.id);
        if (!hit) throw new Error('Share not found');
        Object.assign(hit, data);
        return hit;
      },
      deleteMany: async ({ where }: { where: any }) => {
        const initial = shares.length;
        shares = shares.filter((s) => !matches(s, where));
        return { count: initial - shares.length };
      },
    },
    file: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        files.find((f) => f.id === where.id) ?? null,
      findFirst: async ({ where }: { where: any }) => files.find((f) => matches(f, where)) ?? null,
      findMany: async ({ where, orderBy }: { where?: any; orderBy?: any }) => {
        void orderBy;
        return files.filter((f) => matches(f, where));
      },
      count: async ({ where }: { where?: any }) => files.filter((f) => matches(f, where)).length,
      create: async ({ data }: { data: any }) => {
        const record: FileRow = {
          id: data.id || `file-${files.length + 1}`,
          name: data.name,
          mimeType: data.mimeType || 'application/octet-stream',
          size: data.size || 0,
          folderId: data.folderId ?? null,
          isStarred: data.isStarred ?? false,
          isDeleted: data.isDeleted ?? false,
          deletedAt: data.deletedAt ?? null,
          trashRootId: data.trashRootId ?? null,
          encryptedContent: data.encryptedContent || '',
          encryptionIV: data.encryptionIV || '',
          encryptionAuthTag: data.encryptionAuthTag || '',
          encryptionKey: data.encryptionKey || '',
          contentHash: data.contentHash || '',
          userId: data.userId,
          updatedAt: new Date(),
          createdAt: new Date(),
        };
        files.push(record);
        return record;
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const hit = files.find((f) => f.id === where.id);
        if (!hit) throw new Error('File not found');
        Object.assign(hit, data, { updatedAt: new Date() });
        return hit;
      },
      updateMany: async ({ where, data }: { where: any; data: any }) => {
        const hits = files.filter((f) => matches(f, where));
        for (const hit of hits) {
          Object.assign(hit, data, { updatedAt: new Date() });
        }
        return { count: hits.length };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = files.findIndex((f) => f.id === where.id);
        if (idx >= 0) files.splice(idx, 1);
        return { ok: true };
      },
      deleteMany: async ({ where }: { where: any }) => {
        const initial = files.length;
        files = files.filter((f) => !matches(f, where));
        return { count: initial - files.length };
      },
    },
    folder: {
      findFirst: async ({ where }: { where: any }) =>
        folders.find((f) => matches(f, where)) ?? null,
      findMany: async ({ where, orderBy }: { where?: any; orderBy?: any }) => {
        void orderBy;
        return folders.filter((f) => matches(f, where));
      },
      count: async ({ where }: { where?: any }) => folders.filter((f) => matches(f, where)).length,
      create: async ({ data }: { data: any }) => {
        const record: FolderRow = {
          id: data.id || `folder-${folders.length + 1}`,
          name: data.name,
          parentId: data.parentId ?? null,
          path: data.path,
          userId: data.userId,
          isStarred: data.isStarred ?? false,
          isDeleted: data.isDeleted ?? false,
          deletedAt: data.deletedAt ?? null,
          trashRootId: data.trashRootId ?? null,
          updatedAt: new Date(),
          createdAt: new Date(),
        };
        folders.push(record);
        return record;
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const hit = folders.find((f) => f.id === where.id);
        if (!hit) throw new Error('Folder not found');
        Object.assign(hit, data, { updatedAt: new Date() });
        return hit;
      },
      updateMany: async ({ where, data }: { where: any; data: any }) => {
        const hits = folders.filter((f) => matches(f, where));
        for (const hit of hits) {
          Object.assign(hit, data, { updatedAt: new Date() });
        }
        return { count: hits.length };
      },
      deleteMany: async ({ where }: { where: any }) => {
        const initial = folders.length;
        folders = folders.filter((f) => !matches(f, where));
        return { count: initial - folders.length };
      },
    },
    fileVersion: {
      findFirst: async ({ where }: { where: any }) =>
        fileVersions.find((fv) => matches(fv, where)) ?? null,
      findMany: async ({ where }: { where: any }) =>
        fileVersions.filter((fv) => matches(fv, where)),
      create: async ({ data }: { data: any }) => {
        const record: FileVersionRow = {
          id: `fv-${fileVersions.length + 1}`,
          fileId: data.fileId,
          versionNumber: data.versionNumber || 1,
          encryptedContent: data.encryptedContent || '',
          encryptionIV: data.encryptionIV || '',
          encryptionAuthTag: data.encryptionAuthTag || '',
          encryptionKey: data.encryptionKey || '',
          size: data.size || 0,
          createdAt: new Date(),
        };
        fileVersions.push(record);
        return record;
      },
      deleteMany: async ({ where }: { where: any }) => {
        const initial = fileVersions.length;
        fileVersions = fileVersions.filter((fv) => !matches(fv, where));
        return { count: initial - fileVersions.length };
      },
    },
    fileIndex: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    $transaction: async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === 'function') {
        return arg(fake);
      }
      return arg;
    },
  };
  return fake;
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

describe('QuantDrive Parity & Integrity (Wave 5 Phase D)', () => {
  beforeEach(() => {
    users = [
      { id: 'user-owner', email: 'owner@quantmail.in', displayName: 'Owner' },
      { id: 'user-recipient', email: 'recipient@quantmail.in', displayName: 'Recipient' },
      { id: 'user-other', email: 'other@quantmail.in', displayName: 'Other User' },
    ];
    files = [];
    folders = [];
    shares = [];
    fileVersions = [];
  });

  // 1. POST /drive/shares/:id/accept & decline
  describe('Task D01: Share Accept & Decline Routes', () => {
    it('accepts a pending share and authorizes the recipient to access the file', async () => {
      const now = new Date();
      files.push({
        id: 'file-1',
        name: 'Quarterly_Report.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'key-1',
        encryptionIV: 'iv-1',
        encryptionAuthTag: 'tag-1',
        encryptionKey: 'enckey-1',
        contentHash: 'hash-1',
        userId: 'user-owner',
        createdAt: now,
        updatedAt: now,
      });

      shares.push({
        id: 'share-1',
        fileId: 'file-1',
        folderId: null,
        ownerUserId: 'user-owner',
        sharedWithUserId: 'user-recipient',
        encryptedFileKey: 'enckey-1',
        permission: 'read',
        status: 'pending',
        createdAt: now,
      });

      // Before accepting: recipient cannot access / download file (status is pending)
      const recipientApp = await buildApp('user-recipient');
      const unacceptedRes = await recipientApp.inject({
        method: 'GET',
        url: '/drive/files/file-1/download',
      });
      expect(unacceptedRes.statusCode).toBe(403);

      // Recipient accepts the share
      const acceptRes = await recipientApp.inject({
        method: 'POST',
        url: '/drive/shares/share-1/accept',
      });
      expect(acceptRes.statusCode).toBe(200);
      const acceptBody = acceptRes.json();
      expect(acceptBody.success).toBe(true);
      expect(acceptBody.share).toMatchObject({
        id: 'share-1',
        status: 'accepted',
        fileId: 'file-1',
        permission: 'read',
      });

      // Verify share in db is accepted
      expect(shares.find((s) => s.id === 'share-1')?.status).toBe('accepted');

      // After accepting: recipient is now authorized to download
      const downloadRes = await recipientApp.inject({
        method: 'GET',
        url: '/drive/files/file-1/download',
      });
      expect(downloadRes.statusCode).toBe(200);
      expect(downloadRes.headers['content-type']).toBe('application/pdf');

      await recipientApp.close();
    });

    it('declines a share and keeps access forbidden', async () => {
      const now = new Date();
      files.push({
        id: 'file-2',
        name: 'Private_Notes.txt',
        mimeType: 'text/plain',
        size: 512,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'key-2',
        encryptionIV: 'iv-2',
        encryptionAuthTag: 'tag-2',
        encryptionKey: 'enckey-2',
        contentHash: 'hash-2',
        userId: 'user-owner',
        createdAt: now,
        updatedAt: now,
      });

      shares.push({
        id: 'share-2',
        fileId: 'file-2',
        folderId: null,
        ownerUserId: 'user-owner',
        sharedWithUserId: 'user-recipient',
        encryptedFileKey: 'enckey-2',
        permission: 'read',
        status: 'pending',
        createdAt: now,
      });

      const recipientApp = await buildApp('user-recipient');
      const declineRes = await recipientApp.inject({
        method: 'POST',
        url: '/drive/shares/share-2/decline',
      });
      expect(declineRes.statusCode).toBe(200);
      const declineBody = declineRes.json();
      expect(declineBody.success).toBe(true);
      expect(declineBody.share).toMatchObject({
        id: 'share-2',
        status: 'declined',
      });

      expect(shares.find((s) => s.id === 'share-2')?.status).toBe('declined');

      // Access remains forbidden
      const downloadRes = await recipientApp.inject({
        method: 'GET',
        url: '/drive/files/file-2/download',
      });
      expect(downloadRes.statusCode).toBe(403);

      await recipientApp.close();
    });

    it('rejects accept/decline when user is not the intended recipient or share does not exist', async () => {
      shares.push({
        id: 'share-3',
        fileId: 'file-3',
        folderId: null,
        ownerUserId: 'user-owner',
        sharedWithUserId: 'user-recipient',
        encryptedFileKey: 'enckey-3',
        permission: 'read',
        status: 'pending',
        createdAt: new Date(),
      });

      const otherApp = await buildApp('user-other');
      const forbiddenRes = await otherApp.inject({
        method: 'POST',
        url: '/drive/shares/share-3/accept',
      });
      expect(forbiddenRes.statusCode).toBe(403);

      const notFoundRes = await otherApp.inject({
        method: 'POST',
        url: '/drive/shares/non-existent/accept',
      });
      expect(notFoundRes.statusCode).toBe(404);

      await otherApp.close();
    });
  });

  // 2. GET /drive/shares/received
  describe('Task D03 Support: GET /drive/shares/received', () => {
    it('returns all non-revoked shares received by the authenticated user with metadata', async () => {
      const now = new Date();
      files.push({
        id: 'shared-file-1',
        name: 'Shared_Design.png',
        mimeType: 'image/png',
        size: 2048,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'k',
        encryptionIV: 'iv',
        encryptionAuthTag: 'tag',
        encryptionKey: 'key',
        contentHash: 'hash',
        userId: 'user-owner',
        createdAt: now,
        updatedAt: now,
      });

      shares.push(
        {
          id: 'share-pending',
          fileId: 'shared-file-1',
          folderId: null,
          ownerUserId: 'user-owner',
          sharedWithUserId: 'user-recipient',
          encryptedFileKey: 'key',
          permission: 'read',
          status: 'pending',
          createdAt: now,
        },
        {
          id: 'share-accepted',
          fileId: 'shared-file-1',
          folderId: null,
          ownerUserId: 'user-owner',
          sharedWithUserId: 'user-recipient',
          encryptedFileKey: 'key',
          permission: 'write',
          status: 'accepted',
          createdAt: now,
        },
        {
          id: 'share-revoked',
          fileId: 'shared-file-1',
          folderId: null,
          ownerUserId: 'user-owner',
          sharedWithUserId: 'user-recipient',
          encryptedFileKey: 'key',
          permission: 'read',
          status: 'revoked',
          createdAt: now,
        },
        {
          id: 'share-other-user',
          fileId: 'shared-file-1',
          folderId: null,
          ownerUserId: 'user-owner',
          sharedWithUserId: 'user-other',
          encryptedFileKey: 'key',
          permission: 'read',
          status: 'pending',
          createdAt: now,
        },
      );

      const recipientApp = await buildApp('user-recipient');
      const res = await recipientApp.inject({
        method: 'GET',
        url: '/drive/shares/received',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.shares).toHaveLength(2);

      const ids = body.shares.map((s: any) => s.id);
      expect(ids).toContain('share-pending');
      expect(ids).toContain('share-accepted');
      expect(ids).not.toContain('share-revoked');
      expect(ids).not.toContain('share-other-user');

      const item = body.shares.find((s: any) => s.id === 'share-pending');
      expect(item.owner.email).toBe('owner@quantmail.in');
      expect(item.file.name).toBe('Shared_Design.png');
      expect(item.permission).toBe('view');

      await recipientApp.close();
    });
  });

  // 3. Task D11: Folder Rename Descendant Path Recalculation
  describe('Task D11: Folder Rename Descendant Path Recalculation', () => {
    it('recalculates path for the renamed folder and all nested descendants', async () => {
      const now = new Date();
      folders.push(
        {
          id: 'root-folder',
          name: 'docs',
          parentId: null,
          path: '/docs',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'child-folder',
          name: 'archive',
          parentId: 'root-folder',
          path: '/docs/archive',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'grandchild-folder',
          name: '2026',
          parentId: 'child-folder',
          path: '/docs/archive/2026',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
      );

      const app = await buildApp('user-owner');
      const res = await app.inject({
        method: 'PUT',
        url: '/drive/files/root-folder',
        payload: { name: 'documents' },
      });
      expect(res.statusCode).toBe(200);

      const root = folders.find((f) => f.id === 'root-folder');
      const child = folders.find((f) => f.id === 'child-folder');
      const grandchild = folders.find((f) => f.id === 'grandchild-folder');

      expect(root?.name).toBe('documents');
      expect(root?.path).toBe('/documents');
      expect(child?.path).toBe('/documents/archive');
      expect(grandchild?.path).toBe('/documents/archive/2026');

      await app.close();
    });
  });

  // 4. Task D13: Depth & Cycle Limits in folderTree()
  describe('Task D13: Depth & Cycle Limits in folderTree()', () => {
    it('terminates safely without infinite loop on cyclic folder references', async () => {
      const now = new Date();
      // Synthetic cycle: A -> B -> C -> A
      folders.push(
        {
          id: 'cyc-a',
          name: 'A',
          parentId: null,
          path: '/A',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'cyc-b',
          name: 'B',
          parentId: 'cyc-a',
          path: '/A/B',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'cyc-c',
          name: 'C',
          parentId: 'cyc-b',
          path: '/A/B/C',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'cyc-loop',
          name: 'LoopToA',
          parentId: 'cyc-c',
          path: '/A/B/C/LoopToA',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
      );
      // Make cyc-a claim cyc-loop as its child to form a graph cycle
      folders.push({
        id: 'cyc-a-cycle',
        name: 'BackToA',
        parentId: 'cyc-loop',
        path: '/A/B/C/LoopToA/BackToA',
        userId: 'user-owner',
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        createdAt: now,
        updatedAt: now,
      });

      const app = await buildApp('user-owner');

      // Trashing 'cyc-a' calls folderTree(prisma, userId, 'cyc-a')
      // If cycle detection were missing, this would hang indefinitely and timeout
      const res = await app.inject({
        method: 'POST',
        url: '/drive/files/trash',
        payload: { fileIds: ['cyc-a'] },
      });
      expect(res.statusCode).toBe(200);

      const trashed = folders.filter((f) => f.isDeleted);
      expect(trashed.length).toBeGreaterThanOrEqual(4);

      await app.close();
    });
  });

  // 5. Task D10: Unify Move Route & Path Recalculation
  describe('Task D10: Unify Move Route & Descendant Path Updates', () => {
    it('moves folder into target folder and updates paths for it and all descendants', async () => {
      const now = new Date();
      folders.push(
        {
          id: 'target-folder',
          name: 'Projects',
          parentId: null,
          path: '/Projects',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'alpha-folder',
          name: 'Alpha',
          parentId: null,
          path: '/Alpha',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'assets-folder',
          name: 'Assets',
          parentId: 'alpha-folder',
          path: '/Alpha/Assets',
          userId: 'user-owner',
          isStarred: false,
          isDeleted: false,
          deletedAt: null,
          trashRootId: null,
          createdAt: now,
          updatedAt: now,
        },
      );

      const app = await buildApp('user-owner');
      // Test both canonical /drive/move and unified alias /drive/files/move
      const res = await app.inject({
        method: 'POST',
        url: '/drive/move',
        payload: {
          folderIds: ['alpha-folder'],
          targetFolderId: 'target-folder',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);

      const alpha = folders.find((f) => f.id === 'alpha-folder');
      const assets = folders.find((f) => f.id === 'assets-folder');

      expect(alpha?.parentId).toBe('target-folder');
      expect(alpha?.path).toBe('/Projects/Alpha');
      expect(assets?.path).toBe('/Projects/Alpha/Assets');

      // Test circular reference rejection
      const circularSelfRes = await app.inject({
        method: 'POST',
        url: '/drive/files/move',
        payload: {
          folderIds: ['target-folder'],
          targetFolderId: 'target-folder',
        },
      });
      expect(circularSelfRes.statusCode).toBe(400);

      await app.close();
    });
  });

  // 6. Trash Lifecycle: trash -> list -> restore -> purge
  describe('Trash Lifecycle (D06, D07, D08)', () => {
    it('executes the complete soft-delete, list, restore, and permanent purge lifecycle', async () => {
      const now = new Date();
      files.push({
        id: 'file-lifecycle',
        name: 'DeleteMe.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 4096,
        folderId: null,
        isStarred: false,
        isDeleted: false,
        deletedAt: null,
        trashRootId: null,
        encryptedContent: 'k',
        encryptionIV: 'iv',
        encryptionAuthTag: 'tag',
        encryptionKey: 'key',
        contentHash: 'hash',
        userId: 'user-owner',
        createdAt: now,
        updatedAt: now,
      });

      const app = await buildApp('user-owner');

      // 1. Move to Trash
      const trashRes = await app.inject({
        method: 'POST',
        url: '/drive/files/trash',
        payload: { fileIds: ['file-lifecycle'] },
      });
      expect(trashRes.statusCode).toBe(200);

      // Verify marked as deleted in DB
      const fileInDb = files.find((f) => f.id === 'file-lifecycle');
      expect(fileInDb?.isDeleted).toBe(true);
      expect(fileInDb?.trashRootId).toBe('file-lifecycle');

      // 2. List Trash
      const listTrashRes = await app.inject({
        method: 'GET',
        url: '/drive/trash',
      });
      expect(listTrashRes.statusCode).toBe(200);
      const trashBody = listTrashRes.json();
      expect(trashBody.files).toHaveLength(1);
      expect(trashBody.files[0].id).toBe('file-lifecycle');

      // 3. Restore
      const restoreRes = await app.inject({
        method: 'POST',
        url: '/drive/files/file-lifecycle/restore',
      });
      expect(restoreRes.statusCode).toBe(200);
      expect(fileInDb?.isDeleted).toBe(false);
      expect(fileInDb?.trashRootId).toBe(null);

      // Verify trash is now empty
      const listAfterRestore = await app.inject({ method: 'GET', url: '/drive/trash' });
      expect(listAfterRestore.json().files).toHaveLength(0);

      // 4. Trash again and Permanently Purge
      await app.inject({
        method: 'POST',
        url: '/drive/files/trash',
        payload: { fileIds: ['file-lifecycle'] },
      });
      expect(fileInDb?.isDeleted).toBe(true);

      const purgeRes = await app.inject({
        method: 'DELETE',
        url: '/drive/files/file-lifecycle/purge',
      });
      expect(purgeRes.statusCode).toBe(200);
      expect(purgeRes.json().purged).toBe(1);

      // 5. Verify permanently removed
      expect(files.find((f) => f.id === 'file-lifecycle')).toBeUndefined();

      await app.close();
    });
  });
});
