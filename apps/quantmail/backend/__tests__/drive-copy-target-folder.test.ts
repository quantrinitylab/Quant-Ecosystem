// @vitest-environment node
// QM-AUTO — copy-to-folder honesty contract for /drive/files/:id/copy.
//
// The Quanty "copy to suggested folder" flow once posted
// { targetFolderId: null } when the folder did not exist, and the backend
// silently fell back to the SOURCE folder (?? source.folderId) — duplicating
// in place while the UI reported a successful copy to the suggested folder.
//
// Contract under test:
// - An explicitly requested folder id that does not resolve to a real,
//   user-owned, non-trashed folder answers 404 FOLDER_NOT_FOUND and creates
//   nothing (mirrors the /drive/move contract).
// - A missing/empty target keeps the documented default: duplicate in the
//   source folder.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';

const { checkedPlaintextMock } = vi.hoisted(() => ({ checkedPlaintextMock: vi.fn() }));

vi.mock('@quant/ai', () => ({ AIEngine: class { infer = vi.fn(); } }));
vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 1024,
  DRIVE_MAX_FILE_BYTES: 1024,
  checkedPlaintext: checkedPlaintextMock,
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

const USER_ID = 'user-1';
const SOURCE_FOLDER = 'folder-src';
const TARGET_FOLDER = 'folder-docs';

function fileRow() {
  return {
    id: 'file-1',
    userId: USER_ID,
    name: 'a.txt',
    mimeType: 'text/plain',
    size: 1,
    folderId: SOURCE_FOLDER,
    isDeleted: false,
    isStarred: false,
    deletedAt: null,
    trashRootId: null,
    encryptedContent: 'key',
    encryptionIV: 'iv',
    encryptionAuthTag: 'tag',
    encryptionKey: 'wrapped',
    contentHash: 'hash',
    updatedAt: new Date('2026-10-08T00:00:00Z'),
    lastOpenedAt: null,
    scanStatus: 'clean',
    scanReason: null,
    scannedAt: new Date('2026-10-08T00:00:00Z'),
  };
}

function fakePrisma() {
  const source = fileRow();
  const created: Record<string, unknown>[] = [];
  const file = {
    aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }),
    findUnique: vi.fn().mockImplementation(async ({ where }: any) =>
      where.id === source.id ? source : null,
    ),
    findFirst: vi.fn().mockImplementation(async ({ where }: any) =>
      where.id === source.id ? source : null,
    ),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async ({ data }: any) => {
      const row = {
        id: `file-${created.length + 2}`,
        updatedAt: new Date('2026-10-12T00:00:00Z'),
        lastOpenedAt: null,
        isStarred: false,
        scanReason: null,
        scannedAt: null,
        ...data,
      };
      created.push(row);
      return row;
    }),
    update: vi.fn().mockImplementation(async ({ where, data }: any) => {
      const row = where.id === source.id ? source : created.find((r) => r.id === where.id);
      Object.assign(row ?? {}, data);
      return row;
    }),
    delete: vi.fn(),
  };
  // Exactly one real folder exists for the user; anything else (bogus id,
  // another user's folder, trashed) must resolve to null — the honest 404.
  const folder = {
    findFirst: vi.fn().mockImplementation(async ({ where }: any) =>
      where.id === TARGET_FOLDER && where.userId === USER_ID && where.isDeleted === false
        ? { id: TARGET_FOLDER, name: 'Documents' }
        : null,
    ),
    findMany: vi.fn().mockResolvedValue([]),
  };
  return {
    file,
    folder,
    userSubscription: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
    share: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    fileVersion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'v1', versionNumber: 1 }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ displayName: 'User', email: 'u@example.com' }), findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (ops: any) => {
      if (!Array.isArray(ops)) throw new Error('callback transactions not supported in this mock');
      return Promise.all(ops.map((op: any) => op));
    }),
    __created: created,
  };
}

async function buildApp(prisma: ReturnType<typeof fakePrisma>) {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: USER_ID };
  });
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  checkedPlaintextMock.mockReset();
  checkedPlaintextMock.mockResolvedValue(Buffer.from('x'));
});

describe('POST /drive/files/:id/copy — target folder honesty', () => {
  it('404s FOLDER_NOT_FOUND for a bogus folder id and creates nothing', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/file-1/copy',
      payload: { targetFolderId: 'folder-nope' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: 'FOLDER_NOT_FOUND', message: 'Target folder not found' });
    // No silent in-place duplicate may be created.
    expect(prisma.file.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('404s for a folder id that fails the ownership/trashed check', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    // The folder mock only resolves TARGET_FOLDER for USER_ID & not trashed:
    // a lookup that fails those checks must 404, never fall back in place.
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/file-1/copy',
      payload: { targetFolderId: 'folder-other-user' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('FOLDER_NOT_FOUND');
    expect(prisma.file.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('copies into the requested folder when the target exists', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/file-1/copy',
      payload: { targetFolderId: TARGET_FOLDER },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.file.create).toHaveBeenCalledTimes(1);
    const data = prisma.file.create.mock.calls[0][0].data;
    expect(data.folderId).toBe(TARGET_FOLDER);
    expect(res.json()).toMatchObject({ parentId: TARGET_FOLDER, name: 'a.txt (copy)' });
    await app.close();
  });

  it('missing target keeps the documented in-place duplicate default', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'POST', url: '/drive/files/file-1/copy', payload: {} });
    expect(res.statusCode).toBe(201);
    expect(prisma.file.create.mock.calls[0][0].data.folderId).toBe(SOURCE_FOLDER);
    await app.close();
  });

  it('explicit null target keeps the documented in-place duplicate default', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/drive/files/file-1/copy',
      payload: { targetFolderId: null },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.file.create.mock.calls[0][0].data.folderId).toBe(SOURCE_FOLDER);
    await app.close();
  });
});
