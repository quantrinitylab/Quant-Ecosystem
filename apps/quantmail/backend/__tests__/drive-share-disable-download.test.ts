// @vitest-environment node
// fix/qm-drive-disable-download-3 (QM-M39-006): owner can hide the download
// action for viewer-role share links (viewers get preview only, editors
// always need the bytes to edit). Hiding the action is NOT copy protection.
//
// - POST /drive/shares/link stores the flag and echoes it honestly
//   (default false when omitted).
// - POST editor+true is server-normalized to false — editor+true is never
//   stored, no matter what the client sends.
// - PATCH role-only viewer→editor→viewer transitions never reactivate the
//   flag (the editor step clears it); a legacy editor+true row returning to
//   viewer role-only also stays false.
// - GET /drive/public/share/:token/download on a viewer-role link with the
//   flag → 403 SHARE_DOWNLOAD_DISABLED, no byte read, honest message.
// - ...?preview=1 on the same link for a PREVIEWABLE type → 200 with an
//   inline disposition (the viewer's preview lane).
// - ...?preview=1 on the same link for an UNPREVIEWABLE type (ZIP,
//   application/octet-stream) → 403 SHARE_PREVIEW_UNAVAILABLE, no byte read
//   and no original bytes — the old behavior streamed original bytes for
//   every MIME type while the page claimed preview was unavailable.
// - The same flag on an EDITOR-role link is ignored → 200.
// - GET /drive/public/share/:token advertises disableDownload honestly
//   (normalized: a legacy editor+true row reads false).
// - PATCH /drive/shares/link/:id can flip the flag on a viewer link.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';

const { checkedPlaintextMock } = vi.hoisted(() => ({ checkedPlaintextMock: vi.fn() }));

vi.mock('@quant/ai', () => ({ AIEngine: class { infer = vi.fn(); } }));
vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 1024 * 1024,
  DRIVE_MAX_FILE_BYTES: 1024 * 1024,
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

function fileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    userId: USER_ID,
    name: 'a.txt',
    mimeType: 'text/plain',
    size: 1,
    folderId: null,
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
    scanStatus: 'clean',
    scanReason: null,
    scannedAt: null,
    ...overrides,
  };
}

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'share-1',
    token: 'tok-1',
    fileId: 'file-1',
    createdById: USER_ID,
    role: 'viewer',
    password: null,
    expiresAt: null,
    scope: 'anyone',
    audience: null,
    disableDownload: false,
    createdAt: new Date('2026-10-08T00:00:00Z'),
    ...overrides,
  };
}

function fakePrisma() {
  const rows = [
    fileRow(),
    fileRow({ id: 'file-zip', name: 'a.zip', mimeType: 'application/zip', size: 2048 }),
    fileRow({ id: 'file-bin', name: 'a.bin', mimeType: 'application/octet-stream', size: 512 }),
  ];
  const shares: Record<string, unknown>[] = [
    shareRow({ id: 'share-blocked', token: 'tok-blocked', disableDownload: true }),
    shareRow({ id: 'share-editor-blocked', token: 'tok-editor', role: 'editor', disableDownload: true }),
    shareRow({ id: 'share-open', token: 'tok-open' }),
    shareRow({ id: 'share-zip', token: 'tok-zip', fileId: 'file-zip', disableDownload: true }),
    shareRow({ id: 'share-bin', token: 'tok-bin', fileId: 'file-bin', disableDownload: true }),
  ];
  const file = {
    aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }),
    findUnique: vi.fn().mockImplementation(async ({ where }: any) =>
      rows.find((r) => r.id === where.id) ?? null,
    ),
    findFirst: vi.fn().mockImplementation(async ({ where }: any) =>
      rows.find(
        (r) =>
          (!where.id || r.id === where.id) &&
          (!where.userId || r.userId === where.userId) &&
          (where.isDeleted === undefined || r.isDeleted === where.isDeleted),
      ) ?? null,
    ),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(rows.length),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const driveShare = {
    findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.token) return shares.find((s) => s.token === where.token) ?? null;
      if (where.id) return shares.find((s) => s.id === where.id) ?? null;
      return null;
    }),
    create: vi.fn().mockImplementation(async ({ data }: any) => {
      const row = { id: `share-${shares.length + 1}`, createdAt: new Date(), ...data };
      shares.push(row);
      return row;
    }),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockImplementation(async ({ where, data }: any) => {
      const row = shares.find((s) => s.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
    delete: vi.fn(),
  };
  return {
    file,
    driveShare,
    userSubscription: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
    share: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    fileVersion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'v1', versionNumber: 1 }),
    },
    folder: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ displayName: 'User', email: 'u@example.com' }), findMany: vi.fn().mockResolvedValue([]) },
    organizationMember: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (ops: any) => {
      if (!Array.isArray(ops)) throw new Error('callback transactions not supported in this mock');
      return Promise.all(ops.map((op: any) => op));
    }),
    __shares: shares,
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

describe('share-link disableDownload flag', () => {
  it('POST stores the flag and echoes it honestly', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/drive/shares/link',
      payload: { fileId: 'file-1', disableDownload: true },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.driveShare.create).toHaveBeenCalled();
    const createData = (prisma.driveShare.create as any).mock.calls[0][0].data;
    expect(createData.disableDownload).toBe(true);
    expect(res.json().share.disableDownload).toBe(true);
    await app.close();
  });

  it('POST defaults the flag to false when omitted', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/drive/shares/link',
      payload: { fileId: 'file-1' },
    });
    expect(res.statusCode).toBe(201);
    const createData = (prisma.driveShare.create as any).mock.calls[0][0].data;
    expect(createData.disableDownload).toBe(false);
    expect(res.json().share.disableDownload).toBe(false);
    await app.close();
  });

  it('PATCH flips the flag on an existing link', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: '/drive/shares/link/share-open',
      payload: { disableDownload: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().share.disableDownload).toBe(true);
    const updateData = (prisma.driveShare.update as any).mock.calls[0][0].data;
    expect(updateData.disableDownload).toBe(true);
    await app.close();
  });

  it('POST editor+disableDownload=true is server-normalized to false', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/drive/shares/link',
      payload: { fileId: 'file-1', role: 'editor', disableDownload: true },
    });
    expect(res.statusCode).toBe(201);
    const createData = (prisma.driveShare.create as any).mock.calls[0][0].data;
    expect(createData.role).toBe('editor');
    expect(createData.disableDownload).toBe(false);
    expect(res.json().share.disableDownload).toBe(false);
    await app.close();
  });

  it('PATCH explicit editor+disableDownload=true stores false', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: '/drive/shares/link/share-open',
      payload: { role: 'editor', disableDownload: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().share.disableDownload).toBe(false);
    const updateData = (prisma.driveShare.update as any).mock.calls[0][0].data;
    expect(updateData.role).toBe('editor');
    expect(updateData.disableDownload).toBe(false);
    await app.close();
  });

  it('PATCH role-only viewer→editor clears the flag, and viewer again never reactivates it', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const toEditor = await app.inject({
      method: 'PATCH',
      url: '/drive/shares/link/share-blocked',
      payload: { role: 'editor' },
    });
    expect(toEditor.statusCode).toBe(200);
    expect(toEditor.json().share.disableDownload).toBe(false);
    const editorData = (prisma.driveShare.update as any).mock.calls[0][0].data;
    expect(editorData.disableDownload).toBe(false);
    expect(
      (prisma.__shares.find((s) => s.id === 'share-blocked') as any).disableDownload,
    ).toBe(false);

    const backToViewer = await app.inject({
      method: 'PATCH',
      url: '/drive/shares/link/share-blocked',
      payload: { role: 'viewer' },
    });
    expect(backToViewer.statusCode).toBe(200);
    expect(backToViewer.json().share.disableDownload).toBe(false);
    const viewerData = (prisma.driveShare.update as any).mock.calls[1][0].data;
    expect(viewerData.disableDownload).toBe(false);
    expect(
      (prisma.__shares.find((s) => s.id === 'share-blocked') as any).disableDownload,
    ).toBe(false);
    const meta = await app.inject({ method: 'GET', url: '/drive/public/share/tok-blocked' });
    expect(meta.json().file.disableDownload).toBe(false);
    await app.close();
  });

  it('PATCH role-only editor→viewer on a legacy editor+true row does not reactivate the flag', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: '/drive/shares/link/share-editor-blocked',
      payload: { role: 'viewer' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().share.disableDownload).toBe(false);
    expect(
      (prisma.__shares.find((s) => s.id === 'share-editor-blocked') as any).disableDownload,
    ).toBe(false);
    const meta = await app.inject({ method: 'GET', url: '/drive/public/share/tok-editor' });
    expect(meta.json().file.disableDownload).toBe(false);
    await app.close();
  });

  it('metadata normalizes a legacy editor+true row to false', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const meta = await app.inject({ method: 'GET', url: '/drive/public/share/tok-editor' });
    expect(meta.statusCode).toBe(200);
    expect(meta.json().file.role).toBe('editor');
    expect(meta.json().file.disableDownload).toBe(false);
    await app.close();
  });

  it('metadata advertises disableDownload honestly', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const meta = await app.inject({ method: 'GET', url: '/drive/public/share/tok-blocked' });
    expect(meta.statusCode).toBe(200);
    expect(meta.json().file.disableDownload).toBe(true);
    const metaOpen = await app.inject({ method: 'GET', url: '/drive/public/share/tok-open' });
    expect(metaOpen.statusCode).toBe(200);
    expect(metaOpen.json().file.disableDownload).toBe(false);
    await app.close();
  });
});

describe('public download enforcement', () => {
  it('viewer-role link with the flag → 403 SHARE_DOWNLOAD_DISABLED, no byte read', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/drive/public/share/tok-blocked/download' });
    expect(res.statusCode).toBe(403);
    const err = res.json().error;
    expect(err.code).toBe('SHARE_DOWNLOAD_DISABLED');
    expect(err.message).toMatch(/hid the download action/i);
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('?preview=1 on a blocked ZIP link → 403 SHARE_PREVIEW_UNAVAILABLE, no bytes', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/drive/public/share/tok-zip/download?preview=1',
    });
    expect(res.statusCode).toBe(403);
    const err = res.json().error;
    expect(err.code).toBe('SHARE_PREVIEW_UNAVAILABLE');
    expect(err.message).toMatch(/Preview isn’t available for this file type/i);
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('manual ?preview=1 on a blocked unsupported-MIME link is rejected, not served', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/drive/public/share/tok-bin/download?preview=1',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('SHARE_PREVIEW_UNAVAILABLE');
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('plain download on a blocked ZIP link still 403s with no byte read', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/drive/public/share/tok-zip/download' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('SHARE_DOWNLOAD_DISABLED');
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('?preview=1 on the blocked link streams inline for a previewable type — viewers can still preview', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/drive/public/share/tok-blocked/download?preview=1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    expect(checkedPlaintextMock).toHaveBeenCalled();
    await app.close();
  });

  it('editor-role link with the flag still downloads — editors need the bytes', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/drive/public/share/tok-editor/download' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    await app.close();
  });

  it('link without the flag downloads as before', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/drive/public/share/tok-open/download' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    await app.close();
  });
});
