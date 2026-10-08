// @vitest-environment node
// QM-M39-007 — file details panel (M39 screen 24): GET /drive/files/:id/details.
//
// FILE IDENTITY RULE under test:
// - Every field comes from the database; nothing is invented.
// - Scan state wires through the QM-M39-009 model ('unknown' stays 'unknown').
// - People-share emails and link metadata are owner-visible only; recipients
//   get counts, never addresses.
// - Deleted rows 404; unauthorized readers 403.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';

vi.mock('@quant/ai', () => ({ AIEngine: class { infer = vi.fn(); } }));
vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 1024 * 1024,
  DRIVE_MAX_FILE_BYTES: 1024 * 1024,
  checkedPlaintext: vi.fn(),
  deleteDriveObject: vi.fn(),
  driveObjectKey: vi.fn((userId: string, fileId: string) => `drive/${userId}/${fileId}`),
  driveStorageReady: vi.fn(() => true),
  driveStorageUnavailableReason: vi.fn(() => ''),
  encryptForDrive: vi.fn(() => ({
    ciphertext: Buffer.from('ciphertext'), iv: 'iv', authTag: 'tag', wrappedKey: 'key',
    contentHash: 'a'.repeat(64),
  })),
  hashFromVersionKey: vi.fn(() => null),
  putDriveObject: vi.fn(),
  safeFileName: vi.fn((name: string) => name),
}));

const OWNER_ID = 'owner-1';
const READER_ID = 'reader-1';
const STRANGER_ID = 'stranger-1';

const fileRow = {
  id: 'file-1',
  userId: OWNER_ID,
  name: 'report.pdf',
  mimeType: 'application/pdf',
  size: 2048,
  folderId: 'folder-child',
  isDeleted: false,
  isStarred: false,
  deletedAt: null,
  trashRootId: null,
  encryptedContent: 'key',
  encryptionIV: 'iv',
  encryptionAuthTag: 'tag',
  encryptionKey: 'wrapped',
  contentHash: 'hash',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-07T12:00:00Z'),
  lastOpenedAt: new Date('2026-10-08T09:00:00Z'),
  scanStatus: 'clean',
  scanReason: null,
  scannedAt: new Date('2026-10-07T12:30:00Z'),
};

const folderRows = [
  { id: 'folder-root', userId: OWNER_ID, name: 'Projects', parentId: null, path: '/Projects', isDeleted: false, updatedAt: new Date('2026-09-01T00:00:00Z') },
  { id: 'folder-child', userId: OWNER_ID, name: 'Q3', parentId: 'folder-root', path: '/Projects/Q3', isDeleted: false, updatedAt: new Date('2026-09-15T00:00:00Z') },
];

const folderOwnRow = {
  id: 'folder-own',
  userId: OWNER_ID,
  name: 'Archive',
  parentId: null,
  path: '/Archive',
  isDeleted: false,
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

const shareRows = [
  {
    id: 'share-1',
    fileId: 'file-1',
    folderId: null,
    ownerUserId: OWNER_ID,
    sharedWithUserId: READER_ID,
    permission: 'read',
    status: 'accepted',
    createdAt: new Date('2026-10-06T00:00:00Z'),
  },
];

const linkRows = [
  {
    id: 'link-1',
    fileId: 'file-1',
    createdById: OWNER_ID,
    token: 'tok-abc',
    role: 'viewer',
    password: null,
    expiresAt: null,
    createdAt: new Date('2026-10-05T00:00:00Z'),
  },
  {
    id: 'link-2',
    fileId: 'file-1',
    createdById: OWNER_ID,
    token: 'tok-expired',
    role: 'editor',
    password: null,
    expiresAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-02T00:00:00Z'),
  },
];

const versionRows = [
  { id: 'v1', fileId: 'file-1', versionNumber: 1, size: 1024, createdAt: new Date('2026-10-01T00:00:00Z') },
  { id: 'v2', fileId: 'file-1', versionNumber: 2, size: 2048, createdAt: new Date('2026-10-07T12:00:00Z') },
];

function fakePrisma() {
  return {
    file: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) =>
        where.id === fileRow.id ? { ...fileRow } : null,
      ),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    folder: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        const all = [...folderRows, folderOwnRow];
        const row = all.find((f) => f.id === where.id);
        if (!row) return null;
        if (where.userId && row.userId !== where.userId) return null;
        if (where.isDeleted === false && row.isDeleted) return null;
        return { ...row };
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    share: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) =>
        shareRows.find(
          (s) =>
            (where.fileId ? s.fileId === where.fileId : true) &&
            (where.folderId ? s.folderId === where.folderId : true) &&
            s.sharedWithUserId === where.sharedWithUserId &&
            s.status === where.status,
        ) ?? null,
      ),
      findMany: vi.fn().mockImplementation(async ({ where }: any) =>
        shareRows.filter((s) =>
          (where.fileId ? s.fileId === where.fileId : true) &&
          (where.folderId ? s.folderId === where.folderId : true),
        ),
      ),
    },
    driveShare: {
      findMany: vi.fn().mockImplementation(async ({ where }: any) =>
        linkRows.filter((l) => l.fileId === where.fileId),
      ),
    },
    fileVersion: {
      count: vi.fn().mockResolvedValue(versionRows.length),
      findFirst: vi.fn().mockResolvedValue({ ...versionRows[1] }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ displayName: 'Owner Name', email: 'owner@example.com' }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) =>
        [{ id: READER_ID, email: 'reader@example.com' }].filter((u) => where.id.in.includes(u.id)),
      ),
    },
    userSubscription: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
}

async function buildApp(prisma: ReturnType<typeof fakePrisma>, userId: string) {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

describe('QM-M39-007 file details endpoint', () => {
  it('returns the full honest identity for the owner', async () => {
    const app = await buildApp(fakePrisma(), OWNER_ID);
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/details' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: 'file-1',
      name: 'report.pdf',
      type: 'file',
      mimeType: 'application/pdf',
      size: 2048,
      owner: { name: 'Owner Name', email: 'owner@example.com' },
      isOwner: true,
      sharing: {
        people: [{ email: 'reader@example.com', permission: 'view' }],
        peopleCount: 1,
        linkCount: 1, // the expired link is not counted
      },
      scan: { status: 'clean', reason: null },
      versions: { count: 2 },
    });
    expect(body.versions.latest).toMatchObject({ version: 2, size: 2048 });
    // Breadcrumb: root → child, real folder names from the database.
    expect(body.location).toEqual([
      { id: 'folder-root', name: 'Projects' },
      { id: 'folder-child', name: 'Q3' },
    ]);
    await app.close();
  });

  it('hides people emails and link metadata from non-owner readers', async () => {
    const app = await buildApp(fakePrisma(), READER_ID);
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/details' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isOwner).toBe(false);
    expect(body.sharing.people).toBeNull();
    expect(body.sharing.links).toBeNull();
    expect(body.sharing.peopleCount).toBe(1);
    expect(body.sharing.linkCount).toBe(1);
    await app.close();
  });

  it('403s strangers with no accepted share', async () => {
    const app = await buildApp(fakePrisma(), STRANGER_ID);
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/details' });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('404s missing items and deleted files', async () => {
    const app = await buildApp(fakePrisma(), OWNER_ID);
    const res = await app.inject({ method: 'GET', url: '/drive/files/nope/details' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('works for folders: no scan, no versions, ancestor breadcrumb', async () => {
    const app = await buildApp(fakePrisma(), OWNER_ID);
    const res = await app.inject({ method: 'GET', url: '/drive/files/folder-child/details' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: 'folder-child',
      name: 'Q3',
      type: 'folder',
      scan: null,
      versions: null,
    });
    expect(body.location).toEqual([{ id: 'folder-root', name: 'Projects' }]);
    await app.close();
  });

  it('never renders an unscanned file as clean', async () => {
    const prisma = fakePrisma();
    (prisma.file.findUnique as any).mockResolvedValueOnce({ ...fileRow, scanStatus: null, scanReason: null, scannedAt: null });
    const app = await buildApp(prisma, OWNER_ID);
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/details' });
    expect(res.json().scan.status).toBe('unknown');
    await app.close();
  });
});
