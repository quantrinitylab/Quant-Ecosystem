// @vitest-environment node
// Lane-1 fix (QM-SCREEN-011 R2): quarantined files must not escape quarantine
// through public share links.
// - GET /drive/public/share/:token/download on a quarantined file → 403
//   FILE_QUARANTINED with the verbatim authenticated-route instruction.
// - POST /drive/shares/link on a quarantined file → 403 FILE_QUARANTINED with
//   an honest refusal (never a silently-created link).
// - Clean/unknown files: public link creation + public download unaffected.
// - 'unknown' is never presented as safe.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import { quarantineBlockedMessage } from '../services/file-scan.service';

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
    scanStatus: 'unknown',
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
    createdAt: new Date('2026-10-08T00:00:00Z'),
    ...overrides,
  };
}

function fakePrisma() {
  const rows = [
    fileRow({ id: 'file-quar', scanStatus: 'quarantined', scanReason: 'EICAR test signature' }),
    fileRow({ id: 'file-clean', scanStatus: 'clean' }),
    fileRow({ id: 'file-unknown', scanStatus: 'unknown' }),
  ];
  const shares: Record<string, unknown>[] = [shareRow({ id: 'share-quar', token: 'tok-quar', fileId: 'file-quar' })];
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
    update: vi.fn(),
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

describe('public share links on quarantined files', () => {
  it('quarantined public download 403s with the verbatim quarantine instruction', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/drive/public/share/tok-quar/download' });
    expect(res.statusCode).toBe(403);
    const err = res.json().error;
    expect(err.code).toBe('FILE_QUARANTINED');
    expect(err.message).toBe(quarantineBlockedMessage('download'));
    expect(err.details).toMatchObject({ scanStatus: 'quarantined' });
    // No byte may have been read, let alone streamed.
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('link creation on a quarantined file is refused honestly — no link is created', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/drive/shares/link',
      payload: { fileId: 'file-quar' },
    });
    expect(res.statusCode).toBe(403);
    const err = res.json().error;
    expect(err.code).toBe('FILE_QUARANTINED');
    expect(err.message).toMatch(/cannot create a public link while this file is quarantined/i);
    expect(err.message).toMatch(/security scan/i);
    expect(err.message).toMatch(/security review/i);
    expect(prisma.driveShare.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('owner-initiated flows on the quarantined file stay blocked as before', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-quar/download' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FILE_QUARANTINED');
    await app.close();
  });
});

describe('public share links on clean/unknown files are unaffected', () => {
  it('owner can create a public link and download through it for a clean file', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const created = await app.inject({
      method: 'POST',
      url: '/drive/shares/link',
      payload: { fileId: 'file-clean' },
    });
    expect(created.statusCode).toBe(201);
    const token = created.json().share.token as string;
    expect(typeof token).toBe('string');

    const res = await app.inject({
      method: 'GET',
      url: `/drive/public/share/${token}/download`,
    });
    expect(res.statusCode).toBe(200);
    expect(checkedPlaintextMock).toHaveBeenCalled();
    await app.close();
  });

  it('unknown-status files keep downloading publicly — unknown is never faked safe', async () => {
    const prisma = fakePrisma();
    const app = await buildApp(prisma);
    const created = await app.inject({
      method: 'POST',
      url: '/drive/shares/link',
      payload: { fileId: 'file-unknown' },
    });
    expect(created.statusCode).toBe(201);
    const token = created.json().share.token as string;

    const meta = await app.inject({ method: 'GET', url: `/drive/public/share/${token}` });
    expect(meta.statusCode).toBe(200);
    // The public metadata page must not present the unscanned file as safe:
    // no scan-state claim of any kind, and never the word "clean".
    expect(meta.json().file).not.toHaveProperty('scanStatus');
    expect(JSON.stringify(meta.json())).not.toMatch(/clean/i);

    const res = await app.inject({
      method: 'GET',
      url: `/drive/public/share/${token}/download`,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
