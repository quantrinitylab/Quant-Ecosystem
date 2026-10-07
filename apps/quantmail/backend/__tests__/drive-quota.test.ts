// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import { STORAGE_TIERS, StorageQuotaService } from '../services/storage-quota.service';

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
const FREE_LIMIT = 15 * 1024 * 1024 * 1024;

function fakePrisma(usedBytes = 0, tier: string | null = null) {
  const file = {
    aggregate: vi.fn().mockResolvedValue({ _sum: { size: usedBytes } }),
    findUnique: vi.fn().mockResolvedValue({
      id: 'file-1', userId: USER_ID, name: 'a.txt', mimeType: 'text/plain', size: 0,
      folderId: null, isDeleted: false, encryptedContent: 'key', encryptionIV: 'iv',
      encryptionAuthTag: 'tag', encryptionKey: 'wrapped', contentHash: 'hash',
    }),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn().mockResolvedValue([]),
  };
  return {
    file,
    userSubscription: {
      findUnique: vi.fn().mockResolvedValue(tier ? { tier } : null),
      create: vi.fn(), update: vi.fn(),
    },
    share: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    fileVersion: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    folder: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    user: { findUnique: vi.fn().mockResolvedValue({ displayName: 'User', email: 'u@example.com' }), findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
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

describe('StorageQuotaService', () => {
  it('sums active files in the database', async () => {
    const prisma = fakePrisma(1234);
    await expect(new StorageQuotaService(prisma).getUsage(USER_ID)).resolves.toBe(1234);
    expect(prisma.file.aggregate).toHaveBeenCalledWith({
      where: { userId: USER_ID, isDeleted: false }, _sum: { size: true },
    });
  });

  it('falls back to the 15 GB FREE tier when no subscription exists', async () => {
    const quota = await new StorageQuotaService(fakePrisma()).getQuota(USER_ID);
    expect(STORAGE_TIERS.FREE.limit).toBe(FREE_LIMIT);
    expect(quota).toMatchObject({ tier: 'FREE', limitBytes: FREE_LIMIT });
  });

  it('allows usage exactly at the limit', async () => {
    await expect(new StorageQuotaService(fakePrisma(FREE_LIMIT - 1)).checkQuota(USER_ID, 1)).resolves.toBeUndefined();
  });

  it('throws HTTP 507 QUOTA_EXCEEDED above the limit', async () => {
    await expect(new StorageQuotaService(fakePrisma(FREE_LIMIT)).checkQuota(USER_ID, 1))
      .rejects.toMatchObject({ statusCode: 507, code: 'QUOTA_EXCEEDED' });
  });
});

describe('Drive quota routes', () => {
  it('reports quota and checks available capacity', async () => {
    const app = await buildApp(fakePrisma(1024));
    const quota = await app.inject({ method: 'GET', url: '/drive/quota' });
    expect(quota.statusCode).toBe(200);
    expect(quota.json()).toMatchObject({ used: 1024, total: FREE_LIMIT, tier: 'FREE' });

    const check = await app.inject({ method: 'POST', url: '/drive/quota/check', payload: { additionalBytes: 2048 } });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({ allowed: true, used: 1024, total: FREE_LIMIT, remaining: FREE_LIMIT - 1024 });
    await app.close();
  });

  it.each([
    ['upload', '/drive/upload', { name: 'x.txt', contentBase64: Buffer.from('x').toString('base64') }],
    ['version creation', '/drive/files/file-1/versions', { contentBase64: Buffer.from('x').toString('base64') }],
    ['copy', '/drive/files/file-1/copy', {}],
  ])('returns 507 when %s would overflow quota', async (_name, url, payload) => {
    const app = await buildApp(fakePrisma(FREE_LIMIT));
    const response = await app.inject({ method: 'POST', url, payload });
    expect(response.statusCode).toBe(507);
    expect(response.json().error.code).toBe('QUOTA_EXCEEDED');
    await app.close();
  });
});
