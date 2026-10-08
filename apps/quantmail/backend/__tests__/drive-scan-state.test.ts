// @vitest-environment node
// QM-M39-009 — Drive security/scanning state surface (M39 screen 29).
//
// Honesty contract under test:
// - Every file DTO carries scanStatus; unscanned files are 'unknown'.
// - 'unknown' is never faked into 'clean'.
// - Quarantined files cannot be downloaded, thumbnailed, or copied: the API
//   answers 403 FILE_QUARANTINED with an instruction, not a generic error.
// - New uploads and new versions honestly start at 'unknown'.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import {
  DEFAULT_SCAN_STATUS,
  FILE_SCAN_STATUSES,
  isQuarantined,
  normalizeScanStatus,
  quarantineBlockedMessage,
  quarantineFile,
} from '../services/file-scan.service';

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

function fakePrisma(scanStatus: string | null = 'unknown') {
  const rows = [fileRow({ scanStatus })];
  const created: Record<string, unknown>[] = [];
  const file = {
    aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }),
    findUnique: vi.fn().mockImplementation(async ({ where }: any) =>
      rows.find((r) => r.id === where.id) ?? null,
    ),
    findFirst: vi.fn().mockImplementation(async ({ where }: any) =>
      rows.find((r) => (!where.id || r.id === where.id) && (!where.userId || r.userId === where.userId)) ?? null,
    ),
    findMany: vi.fn().mockImplementation(async ({ where }: any) => {
      if (where?.id?.in) return rows.filter((r) => where.id.in.includes(r.id));
      return rows.filter((r) => !where?.userId || r.userId === where.userId);
    }),
    count: vi.fn().mockResolvedValue(rows.length),
    create: vi.fn().mockImplementation(async ({ data }: any) => {
      const row = { id: `file-${created.length + 2}`, ...data };
      created.push(row);
      return row;
    }),
    update: vi.fn().mockImplementation(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id) ?? created.find((r) => r.id === where.id);
      Object.assign(row ?? {}, data);
      return row;
    }),
    delete: vi.fn(),
  };
  return {
    file,
    userSubscription: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
    share: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    fileVersion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'v1', versionNumber: 1 }),
    },
    folder: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
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

describe('file-scan.service honesty contract', () => {
  it('exposes exactly the five documented states', () => {
    expect([...FILE_SCAN_STATUSES].sort()).toEqual(
      ['clean', 'pending', 'quarantined', 'scanning', 'unknown'].sort(),
    );
    expect(DEFAULT_SCAN_STATUS).toBe('unknown');
  });

  it('normalizes anything unexpected to unknown — never to clean', () => {
    expect(normalizeScanStatus(null)).toBe('unknown');
    expect(normalizeScanStatus(undefined)).toBe('unknown');
    expect(normalizeScanStatus('')).toBe('unknown');
    expect(normalizeScanStatus('CLEAN')).toBe('unknown');
    expect(normalizeScanStatus('safe')).toBe('unknown');
    expect(normalizeScanStatus('clean')).toBe('clean');
    expect(normalizeScanStatus('quarantined')).toBe('quarantined');
    expect(normalizeScanStatus('pending')).toBe('pending');
    expect(normalizeScanStatus('scanning')).toBe('scanning');
  });

  it('isQuarantined only matches quarantined', () => {
    expect(isQuarantined('quarantined')).toBe(true);
    expect(isQuarantined('clean')).toBe(false);
    expect(isQuarantined('unknown')).toBe(false);
    expect(isQuarantined(null)).toBe(false);
  });

  it('quarantineBlockedMessage is an instruction, not a generic error', () => {
    const msg = quarantineBlockedMessage('download');
    expect(msg).toMatch(/quarantined/i);
    expect(msg).toMatch(/cannot be downloaded/i);
    expect(msg).toMatch(/administrator|security review/i);
    expect(msg).not.toBe('Download failed');
  });

  it('quarantineFile persists the quarantine state', async () => {
    const prisma = fakePrisma('unknown') as any;
    await quarantineFile(prisma, 'file-1', 'EICAR test signature');
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: expect.objectContaining({
        scanStatus: 'quarantined',
        scanReason: 'EICAR test signature',
      }),
    });
    expect((prisma.file.update.mock.calls[0][0].data as any).scannedAt).toBeInstanceOf(Date);
  });
});

describe('Drive scan-state routes', () => {
  it('file DTOs carry scanStatus, defaulting honestly to unknown', async () => {
    const app = await buildApp(fakePrisma('unknown'));
    const res = await app.inject({ method: 'GET', url: '/drive/files' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toMatchObject({ scanStatus: 'unknown', scanReason: null });
    await app.close();
  });

  it('passes through real scan states (clean/quarantined) untouched', async () => {
    const app = await buildApp(fakePrisma('clean'));
    const res = await app.inject({ method: 'GET', url: '/drive/files' });
    expect(res.json().files[0].scanStatus).toBe('clean');
    await app.close();
  });

  it('blocks quarantined downloads with 403 + instruction, not a generic error', async () => {
    const app = await buildApp(fakePrisma('quarantined'));
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/download' });
    expect(res.statusCode).toBe(403);
    const err = res.json().error;
    expect(err.code).toBe('FILE_QUARANTINED');
    expect(err.message).toMatch(/quarantined/i);
    expect(err.message).toMatch(/administrator|security review/i);
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('blocks quarantined thumbnails the same way', async () => {
    const app = await buildApp(fakePrisma('quarantined'));
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/thumbnail' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FILE_QUARANTINED');
    await app.close();
  });

  it('blocks copying a quarantined file (no laundering into a clean copy)', async () => {
    const app = await buildApp(fakePrisma('quarantined'));
    const res = await app.inject({ method: 'POST', url: '/drive/files/file-1/copy', payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FILE_QUARANTINED');
    await app.close();
  });

  it('allows downloads for unknown files (honest state, not a block)', async () => {
    const app = await buildApp(fakePrisma('unknown'));
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1/download' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('new uploads honestly start at unknown — never clean', async () => {
    const prisma = fakePrisma('unknown');
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/drive/upload',
      payload: { name: 'new.txt', contentBase64: Buffer.from('hello').toString('base64') },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().file).toMatchObject({ scanStatus: 'unknown' });
    expect(prisma.file.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scanStatus: 'unknown' }),
    });
    await app.close();
  });
});

describe('QM-M39-003 single-file status read (upload center scan polling)', () => {
  it('returns the file DTO with the real scanStatus for the owner', async () => {
    const app = await buildApp(fakePrisma('scanning'));
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().file).toMatchObject({
      id: 'file-1',
      name: 'a.txt',
      scanStatus: 'scanning',
    });
    await app.close();
  });

  it('answers 404 for a missing file', async () => {
    const prisma = fakePrisma('unknown') as any;
    prisma.file.findUnique = vi.fn().mockResolvedValue(null);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/drive/files/nope' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('answers 403 for another user without an accepted share', async () => {
    const prisma = fakePrisma('unknown') as any;
    prisma.file.findUnique = vi.fn().mockResolvedValue({
      id: 'file-1',
      userId: 'user-2',
      isDeleted: false,
      scanStatus: 'unknown',
      scanReason: null,
      scannedAt: null,
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/drive/files/file-1' });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
