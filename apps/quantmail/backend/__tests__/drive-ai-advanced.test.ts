// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import { AISearchContentService } from '../services/ai-search-content.service';
import { AIDuplicateService } from '../services/ai-duplicate.service';
import { AIOrganizeService, CATEGORIES } from '../services/ai-organize.service';

const { inferMock, checkedPlaintextMock } = vi.hoisted(() => ({
  inferMock: vi.fn(),
  checkedPlaintextMock: vi.fn(),
}));

vi.mock('@quant/ai', () => ({
  AIEngine: class {
    infer = inferMock;
  },
}));

vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 1024,
  DRIVE_MAX_FILE_BYTES: 1024,
  checkedPlaintext: checkedPlaintextMock,
  deleteDriveObject: vi.fn(),
  driveObjectKey: vi.fn((userId: string, fileId: string) => `drive/${userId}/${fileId}`),
  driveStorageReady: vi.fn(() => true),
  driveStorageUnavailableReason: vi.fn(() => ''),
  encryptForDrive: vi.fn(() => ({
    ciphertext: Buffer.from('ciphertext'),
    iv: 'iv',
    authTag: 'tag',
    wrappedKey: 'key',
    contentHash: 'a'.repeat(64),
  })),
  hashFromVersionKey: vi.fn(() => null),
  putDriveObject: vi.fn(),
  safeFileName: vi.fn((name: string) => name),
}));

const USER_ID = 'user-1';

beforeEach(() => {
  inferMock.mockReset();
  checkedPlaintextMock.mockReset();
  checkedPlaintextMock.mockResolvedValue(Buffer.from('alpha roadmap and release notes'));
  inferMock.mockResolvedValue({
    content: JSON.stringify({ category: 'Documents', confidence: 0.93 }),
  });
});

describe('AISearchContentService', () => {
  it('updates the newest index row for a file and removes historical duplicates', async () => {
    const existing = {
      id: 'index-1',
      fileId: 'file-1',
      userId: USER_ID,
      content: 'old content',
      mimeType: 'text/plain',
      indexedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...existing,
      ...data,
    }));
    const create = vi.fn();
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const transactionClient = {
      fileIndex: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update,
        create,
        deleteMany,
      },
    };
    const prisma = {
      file: { findFirst: vi.fn().mockResolvedValue({ id: 'file-1' }) },
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
      ),
    };
    const service = new AISearchContentService(prisma);

    const result = await service.indexFile(
      'file-1',
      'roadmap.txt',
      'new searchable content',
      'text/plain',
      USER_ID,
    );

    expect(prisma.file.findFirst).toHaveBeenCalledWith({
      where: { id: 'file-1', userId: USER_ID, isDeleted: false },
      select: { id: true },
    });
    expect(transactionClient.fileIndex.findFirst).toHaveBeenCalledWith({
      where: { fileId: 'file-1', userId: USER_ID },
      orderBy: { indexedAt: 'desc' },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'index-1' },
      data: expect.objectContaining({
        fileId: 'file-1',
        userId: USER_ID,
        content: 'new searchable content',
        mimeType: 'text/plain',
      }),
    });
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { fileId: 'file-1', userId: USER_ID, id: { not: 'index-1' } },
    });
    expect(result.content).toBe('new searchable content');
  });

  it('strictly filters active files and preserves fileName and matching snippets', async () => {
    const records = [
      {
        id: 'index-active',
        fileId: 'file-active',
        userId: USER_ID,
        content: 'The quarterly roadmap contains the launch plan.',
        mimeType: 'text/plain',
        indexedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        id: 'index-deleted',
        fileId: 'file-deleted',
        userId: USER_ID,
        content: 'A deleted quarterly roadmap.',
        mimeType: 'text/plain',
        indexedAt: new Date('2026-09-02T00:00:00.000Z'),
      },
    ];
    const fileFindMany = vi.fn().mockResolvedValue([
      { id: 'file-active', name: 'Q4-roadmap.md' },
    ]);
    const prisma = {
      fileIndex: { findMany: vi.fn().mockResolvedValue(records) },
      file: { findMany: fileFindMany },
    };
    const service = new AISearchContentService(prisma);

    const results = await service.searchContent('quarterly roadmap', USER_ID);

    expect(fileFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['file-active', 'file-deleted'] },
        userId: USER_ID,
        isDeleted: false,
      },
      select: { id: true, name: true },
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      fileId: 'file-active',
      fileName: 'Q4-roadmap.md',
      name: 'Q4-roadmap.md',
    });
    expect(results[0]?.snippet.toLowerCase()).toContain('quarterly roadmap');
  });
});

describe('AIDuplicateService', () => {
  it('requests only files of at least 64 bytes and defensively skips smaller rows', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'tiny', name: 'tiny.txt', size: 63, contentHash: 'same' },
      { id: 'a', name: 'a.bin', size: 128, contentHash: 'same' },
      { id: 'b', name: 'b.bin', size: 128, contentHash: 'same' },
    ]);
    const service = new AIDuplicateService({ file: { findMany } });

    const result = await service.findDuplicates(USER_ID);

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, isDeleted: false, size: { gte: 64 } },
      select: { id: true, name: true, size: true, contentHash: true },
    });
    expect(result.groups).toEqual([
      {
        hash: 'same',
        files: [
          { id: 'a', name: 'a.bin', size: 128 },
          { id: 'b', name: 'b.bin', size: 128 },
        ],
      },
    ]);
  });

  it('groups matching hashes and leaves unique hashes out of duplicate results', async () => {
    const service = new AIDuplicateService({
      file: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'a', name: 'one.dat', size: 256, contentHash: 'hash-a' },
          { id: 'b', name: 'two.dat', size: 256, contentHash: 'hash-a' },
          { id: 'c', name: 'unique.dat', size: 256, contentHash: 'hash-b' },
        ]),
      },
    });

    await expect(service.findDuplicates(USER_ID)).resolves.toEqual({
      groups: [
        {
          hash: 'hash-a',
          files: [
            { id: 'a', name: 'one.dat', size: 256 },
            { id: 'b', name: 'two.dat', size: 256 },
          ],
        },
      ],
    });
  });
});

describe('AIOrganizeService', () => {
  it('only returns categories from the exported CATEGORIES enum', async () => {
    const ai = {
      infer: vi.fn()
        .mockResolvedValueOnce({ content: '{"category":"Documents","confidence":0.9}' })
        .mockResolvedValueOnce({ content: '{"category":"Images","confidence":0.8}' })
        .mockResolvedValueOnce({ content: '{"category":"Code","confidence":0.7}' })
        .mockResolvedValueOnce({ content: '{"category":"not-an-enum-value","confidence":1}' }),
    };
    const service = new AIOrganizeService(ai as never, {});
    const results = await Promise.all([
      service.categorizeFile('report.txt', 'application/octet-stream', 'report', USER_ID),
      service.categorizeFile('photo.bin', 'application/octet-stream', 'photo', USER_ID),
      service.categorizeFile('source.bin', 'application/octet-stream', 'source', USER_ID),
      service.categorizeFile('unknown.bin', 'application/octet-stream', 'unknown', USER_ID),
    ]);

    for (const result of results) {
      expect(CATEGORIES).toContain(result.category);
      expect(result.suggestedFolder).toBe(`/${result.category}`);
    }
    expect(results[3]).toMatchObject({ category: 'Other', suggestedFolder: '/Other' });
  });

  it('never allows traversal sequences into a suggested folder path', async () => {
    const ai = {
      infer: vi.fn().mockResolvedValue({
        content: JSON.stringify({ category: '../escape', confidence: 1 }),
      }),
    };
    const service = new AIOrganizeService(ai as never, {});

    const result = await service.categorizeFile(
      '../..\\payload.ts',
      'application/octet-stream',
      'malicious input',
      USER_ID,
    );

    expect(result).toMatchObject({ category: 'Code', suggestedFolder: '/Code' });
    expect(result.suggestedFolder).not.toContain('..');
    expect(result.suggestedFolder).not.toContain('\\');
  });
});

function driveFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    userId: USER_ID,
    name: 'roadmap.txt',
    mimeType: 'text/plain',
    size: 256,
    folderId: null,
    isStarred: false,
    isDeleted: false,
    deletedAt: null,
    trashRootId: null,
    encryptedContent: 'key',
    encryptionIV: 'iv',
    encryptionAuthTag: 'tag',
    encryptionKey: 'wrapped',
    contentHash: 'hash-a',
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

function routePrisma(row = driveFile()) {
  const indexRecord = {
    id: 'index-1',
    fileId: 'file-1',
    userId: USER_ID,
    content: 'alpha roadmap and release notes',
    mimeType: 'text/plain',
    indexedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
  const prisma: any = {
    file: {
      findUnique: vi.fn().mockResolvedValue(row),
      findFirst: vi.fn().mockResolvedValue({ id: row.id }),
      findMany: vi.fn(async (args: any) => {
        if (args?.where?.size?.gte === 64) {
          return [
            { id: 'dup-a', name: 'copy-a.bin', size: 256, contentHash: 'duplicate' },
            { id: 'dup-b', name: 'copy-b.bin', size: 256, contentHash: 'duplicate' },
          ];
        }
        if (args?.where?.id?.in) return [{ id: 'file-1', name: 'roadmap.txt' }];
        return [];
      }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    fileIndex: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: any) => ({ ...indexRecord, ...data })),
      update: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([indexRecord]),
    },
    folder: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    share: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    fileVersion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    userSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
    user: {
      findUnique: vi.fn().mockResolvedValue({ displayName: 'User', email: 'u@example.com' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  prisma.$transaction = vi.fn(async (input: any) =>
    typeof input === 'function' ? input(prisma) : Promise.all(input),
  );
  return prisma;
}

async function buildDriveApp(prisma: ReturnType<typeof routePrisma>) {
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

describe('Drive AI advanced routes', () => {
  it('POST /drive/ai/search indexes content and returns matching files', async () => {
    const prisma = routePrisma();
    const app = await buildDriveApp(prisma);
    const response = await app.inject({
      method: 'POST',
      url: '/drive/ai/search',
      payload: { fileId: 'file-1', query: 'alpha roadmap' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results).toEqual([
      expect.objectContaining({
        fileId: 'file-1',
        fileName: 'roadmap.txt',
        snippet: expect.stringContaining('alpha roadmap'),
      }),
    ]);
    expect(prisma.fileIndex.create).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('POST /drive/ai/duplicates returns duplicate groups', async () => {
    const app = await buildDriveApp(routePrisma());
    const response = await app.inject({ method: 'POST', url: '/drive/ai/duplicates' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      groups: [
        {
          hash: 'duplicate',
          files: [
            { id: 'dup-a', name: 'copy-a.bin', size: 256 },
            { id: 'dup-b', name: 'copy-b.bin', size: 256 },
          ],
        },
      ],
    });
    await app.close();
  });

  it('POST /drive/ai/organize returns a canonical category suggestion', async () => {
    const app = await buildDriveApp(routePrisma());
    const response = await app.inject({
      method: 'POST',
      url: '/drive/ai/organize',
      payload: { fileId: 'file-1', apply: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      fileId: 'file-1',
      category: 'Documents',
      suggestedFolder: '/Documents',
      applied: false,
    });
    expect(CATEGORIES).toContain(response.json().category);
    await app.close();
  });

  it('returns 403 when a non-owner attempts content-dependent Drive AI', async () => {
    const app = await buildDriveApp(routePrisma(driveFile({ userId: 'user-2' })));
    const response = await app.inject({
      method: 'POST',
      url: '/drive/ai/search',
      payload: { fileId: 'file-1', query: 'roadmap' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 415 for an unindexable non-text MIME type', async () => {
    const app = await buildDriveApp(routePrisma(driveFile({ mimeType: 'image/png' })));
    const response = await app.inject({
      method: 'POST',
      url: '/drive/ai/search',
      payload: { fileId: 'file-1', query: 'pixels' },
    });

    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    await app.close();
  });
});
