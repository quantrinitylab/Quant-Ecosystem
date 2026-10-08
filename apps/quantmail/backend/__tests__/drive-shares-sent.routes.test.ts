// @vitest-environment node
// ============================================================================
// QuantDrive "Shared by me" — GET /drive/shares/sent route tests (QM-M39-001)
//
// Verifies the endpoint lists files/folders the authenticated user owns AND
// has shared: grouped per item, real recipients with real permissions and
// statuses, real sharedCount, real link state (never the token), and honest
// exclusion of revoked shares, other users' shares, and deleted targets.
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
  userId: string;
  isDeleted: boolean;
  updatedAt: Date;
}

interface FolderRow {
  id: string;
  name: string;
  path: string;
  userId: string;
  isDeleted: boolean;
  updatedAt: Date;
}

interface ShareRow {
  id: string;
  fileId: string | null;
  folderId: string | null;
  ownerUserId: string;
  sharedWithUserId: string;
  permission: string;
  status: string;
  createdAt: Date;
}

interface DriveShareLinkRow {
  id: string;
  fileId: string;
  createdById: string;
  role: string;
  password: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

let users: UserRow[] = [];
let files: FileRow[] = [];
let folders: FolderRow[] = [];
let shares: ShareRow[] = [];
let driveShareLinks: DriveShareLinkRow[] = [];

function matches(record: any, where: any): boolean {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    const recVal = record[key];
    if (val && typeof val === 'object' && !(val instanceof Date)) {
      if ('in' in val && Array.isArray((val as any).in)) {
        if (!(val as any).in.includes(recVal)) return false;
      }
      if ('not' in val) {
        if (recVal === (val as any).not) return false;
      }
    } else {
      if (recVal !== val) return false;
    }
  }
  return true;
}

function createFakePrisma() {
  return {
    user: {
      findMany: async ({ where }: { where?: any }) => users.filter((u) => matches(u, where)),
    },
    file: {
      findMany: async ({ where }: { where?: any }) => files.filter((f) => matches(f, where)),
    },
    folder: {
      findMany: async ({ where }: { where?: any }) => folders.filter((f) => matches(f, where)),
    },
    share: {
      findMany: async ({ where }: { where?: any }) => shares.filter((s) => matches(s, where)),
    },
    driveShare: {
      findMany: async ({ where }: { where?: any }) =>
        driveShareLinks.filter((l) => matches(l, where)),
    },
    $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg),
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

const NOW = new Date('2026-10-08T10:00:00Z');

describe('GET /drive/shares/sent — "Shared by me" (QM-M39-001)', () => {
  beforeEach(() => {
    users = [
      { id: 'user-owner', email: 'owner@quantmail.in', displayName: 'Owner' },
      { id: 'user-recipient', email: 'recipient@quantmail.in', displayName: 'Recipient' },
      { id: 'user-second', email: 'second@quantmail.in', displayName: null },
    ];
    files = [
      {
        id: 'file-1',
        name: 'Roadmap.pdf',
        mimeType: 'application/pdf',
        size: 4096,
        userId: 'user-owner',
        isDeleted: false,
        updatedAt: NOW,
      },
      {
        id: 'file-deleted',
        name: 'Gone.docx',
        mimeType: 'application/docx',
        size: 128,
        userId: 'user-owner',
        isDeleted: true,
        updatedAt: NOW,
      },
    ];
    folders = [
      {
        id: 'folder-1',
        name: 'Design assets',
        path: '/Design assets',
        userId: 'user-owner',
        isDeleted: false,
        updatedAt: NOW,
      },
    ];
    shares = [
      {
        id: 'share-1',
        fileId: 'file-1',
        folderId: null,
        ownerUserId: 'user-owner',
        sharedWithUserId: 'user-recipient',
        permission: 'write',
        status: 'accepted',
        createdAt: NOW,
      },
      {
        id: 'share-2',
        fileId: 'file-1',
        folderId: null,
        ownerUserId: 'user-owner',
        sharedWithUserId: 'user-second',
        permission: 'read',
        status: 'pending',
        createdAt: NOW,
      },
      {
        id: 'share-3',
        fileId: null,
        folderId: 'folder-1',
        ownerUserId: 'user-owner',
        sharedWithUserId: 'user-recipient',
        permission: 'admin',
        status: 'accepted',
        createdAt: NOW,
      },
      {
        id: 'share-revoked',
        fileId: 'file-1',
        folderId: null,
        ownerUserId: 'user-owner',
        sharedWithUserId: 'user-recipient',
        permission: 'read',
        status: 'revoked',
        createdAt: NOW,
      },
      {
        id: 'share-deleted-target',
        fileId: 'file-deleted',
        folderId: null,
        ownerUserId: 'user-owner',
        sharedWithUserId: 'user-recipient',
        permission: 'read',
        status: 'accepted',
        createdAt: NOW,
      },
      {
        id: 'share-other-owner',
        fileId: 'file-1',
        folderId: null,
        ownerUserId: 'user-recipient',
        sharedWithUserId: 'user-owner',
        permission: 'read',
        status: 'accepted',
        createdAt: NOW,
      },
    ];
    driveShareLinks = [
      {
        id: 'link-1',
        fileId: 'file-1',
        createdById: 'user-owner',
        role: 'viewer',
        password: 'argon2-hash-not-plaintext',
        expiresAt: new Date('2026-11-08T10:00:00Z'),
        createdAt: NOW,
      },
    ];
  });

  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/drive/shares/sent' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('groups owned shares per item with real recipients, permissions, and counts', async () => {
    const app = await buildApp('user-owner');
    const res = await app.inject({ method: 'GET', url: '/drive/shares/sent' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Two real items: file-1 (2 recipients) and folder-1 (1 recipient).
    // Revoked, deleted-target, and other-owner shares are excluded.
    expect(body.items).toHaveLength(2);

    const fileItem = body.items.find((i: any) => i.id === 'file-1');
    expect(fileItem).toBeDefined();
    expect(fileItem.name).toBe('Roadmap.pdf');
    expect(fileItem.type).toBe('file');
    expect(fileItem.mimeType).toBe('application/pdf');
    expect(fileItem.size).toBe(4096);
    expect(fileItem.sharedCount).toBe(2);
    expect(fileItem.sharedWith).toHaveLength(2);

    const recipient = fileItem.sharedWith.find((p: any) => p.email === 'recipient@quantmail.in');
    expect(recipient.name).toBe('Recipient');
    expect(recipient.permission).toBe('edit'); // stored 'write' → frontend 'edit'
    expect(recipient.status).toBe('accepted');

    const pending = fileItem.sharedWith.find((p: any) => p.email === 'second@quantmail.in');
    expect(pending.name).toBe('second'); // falls back to email local part
    expect(pending.permission).toBe('view');
    expect(pending.status).toBe('pending');

    const folderItem = body.items.find((i: any) => i.id === 'folder-1');
    expect(folderItem).toBeDefined();
    expect(folderItem.type).toBe('folder');
    expect(folderItem.sharedCount).toBe(1);
    expect(folderItem.sharedWith[0].permission).toBe('admin');

    // No ghost rows: revoked shares, deleted files, and other users' shares
    // never appear.
    const allRecipients = body.items.flatMap((i: any) => i.sharedWith.map((p: any) => p.email));
    expect(allRecipients).not.toContain('share-revoked');
    expect(body.items.find((i: any) => i.id === 'file-deleted')).toBeUndefined();

    await app.close();
  });

  it('exposes link state honestly without leaking the token', async () => {
    const app = await buildApp('user-owner');
    const res = await app.inject({ method: 'GET', url: '/drive/shares/sent' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const fileItem = body.items.find((i: any) => i.id === 'file-1');
    expect(fileItem.linkShare).toBeDefined();
    expect(fileItem.linkShare.role).toBe('viewer');
    expect(fileItem.linkShare.requiresPassword).toBe(true);
    expect(new Date(fileItem.linkShare.expiresAt).toISOString()).toBe('2026-11-08T10:00:00.000Z');
    // The token (and password hash) must never leave the backend.
    expect(fileItem.linkShare.token).toBeUndefined();
    expect(fileItem.linkShare.password).toBeUndefined();

    // Folders have no public-link support: linkShare is null, not a fake.
    const folderItem = body.items.find((i: any) => i.id === 'folder-1');
    expect(folderItem.linkShare).toBeNull();

    await app.close();
  });

  it('returns an empty list when the user has shared nothing', async () => {
    shares = [];
    const app = await buildApp('user-owner');
    const res = await app.inject({ method: 'GET', url: '/drive/shares/sent' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
    await app.close();
  });

  it('shows nothing for a user who only received shares', async () => {
    const app = await buildApp('user-second');
    const res = await app.inject({ method: 'GET', url: '/drive/shares/sent' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
    await app.close();
  });
});
