// ============================================================================
// QuantAI — QuantyArtifactsService tests (artifacts library backend, Muse S6)
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  QuantyArtifactsService,
  resolveArtifactSort,
  type QuantyArtifactRecord,
} from '../services/quanty-artifacts.service';

function record(over: Partial<QuantyArtifactRecord> = {}): QuantyArtifactRecord {
  return {
    id: 'a-1',
    userId: 'user-1',
    title: 'Test Artifact',
    kind: 'artifact',
    type: 'code',
    language: 'typescript',
    code: 'const x = 1;',
    markdown: null,
    previewHtml: null,
    contentRef: null,
    systemFile: false,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    openedAt: null,
    ...over,
  };
}

function createMockPrisma() {
  return {
    quantyArtifact: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('resolveArtifactSort', () => {
  it('maps modified/opened/name, defaults to modified', () => {
    expect(resolveArtifactSort('modified')).toEqual({ field: 'updatedAt', order: 'desc' });
    expect(resolveArtifactSort('opened')).toEqual({ field: 'openedAt', order: 'desc' });
    expect(resolveArtifactSort('name')).toEqual({ field: 'title', order: 'asc' });
    expect(resolveArtifactSort(undefined)).toEqual({ field: 'updatedAt', order: 'desc' });
    expect(resolveArtifactSort('bogus')).toEqual({ field: 'updatedAt', order: 'desc' });
  });
});

describe('QuantyArtifactsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: QuantyArtifactsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new QuantyArtifactsService(prisma as never);
    vi.clearAllMocks();
  });

  describe('listArtifacts', () => {
    it('scopes to the user and applies modified sort by default', async () => {
      prisma.quantyArtifact.findMany.mockResolvedValue([record()]);
      prisma.quantyArtifact.count.mockResolvedValue(1);

      const result = await service.listArtifacts('user-1');

      expect(result).toEqual({ items: [record()], total: 1 });
      const findManyArgs = prisma.quantyArtifact.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toMatchObject({ userId: 'user-1' });
      expect(findManyArgs.orderBy[0]).toEqual({ updatedAt: 'desc' });
    });

    it('filters by tab kind and name sort', async () => {
      prisma.quantyArtifact.findMany.mockResolvedValue([]);
      prisma.quantyArtifact.count.mockResolvedValue(0);

      await service.listArtifacts('user-1', { tab: 'media', sort: 'name' });

      const findManyArgs = prisma.quantyArtifact.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toMatchObject({ userId: 'user-1', kind: 'media' });
      expect(findManyArgs.orderBy[0]).toEqual({ title: 'asc' });
    });

    it('sorts by openedAt when sort=opened', async () => {
      prisma.quantyArtifact.findMany.mockResolvedValue([]);
      prisma.quantyArtifact.count.mockResolvedValue(0);

      await service.listArtifacts('user-1', { sort: 'opened' });

      const findManyArgs = prisma.quantyArtifact.findMany.mock.calls[0][0];
      expect(findManyArgs.orderBy[0]).toEqual({ openedAt: 'desc' });
    });

    it('applies case-insensitive title search', async () => {
      prisma.quantyArtifact.findMany.mockResolvedValue([]);
      prisma.quantyArtifact.count.mockResolvedValue(0);

      await service.listArtifacts('user-1', { search: 'ledger' });

      const findManyArgs = prisma.quantyArtifact.findMany.mock.calls[0][0];
      expect(findManyArgs.where.title).toEqual({ contains: 'ledger', mode: 'insensitive' });
    });

    it('filters system files when systemOnly', async () => {
      prisma.quantyArtifact.findMany.mockResolvedValue([]);
      prisma.quantyArtifact.count.mockResolvedValue(0);

      await service.listArtifacts('user-1', { systemOnly: true });

      const findManyArgs = prisma.quantyArtifact.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toMatchObject({ userId: 'user-1', systemFile: true });
    });

    it('paginates with clamped pageSize', async () => {
      prisma.quantyArtifact.findMany.mockResolvedValue([]);
      prisma.quantyArtifact.count.mockResolvedValue(0);

      await service.listArtifacts('user-1', { page: 2, pageSize: 500 });

      const findManyArgs = prisma.quantyArtifact.findMany.mock.calls[0][0];
      expect(findManyArgs.take).toBe(100);
      expect(findManyArgs.skip).toBe(100);
    });

    it('never leaks another user\'s rows (userId always in where)', async () => {
      prisma.quantyArtifact.findMany.mockResolvedValue([]);
      prisma.quantyArtifact.count.mockResolvedValue(0);

      await service.listArtifacts('user-2', { tab: 'artifact', search: 'x' });

      expect(prisma.quantyArtifact.findMany.mock.calls[0][0].where.userId).toBe('user-2');
      expect(prisma.quantyArtifact.count.mock.calls[0][0].where.userId).toBe('user-2');
    });
  });

  describe('getArtifact', () => {
    it('returns null for another user\'s artifact', async () => {
      prisma.quantyArtifact.findFirst.mockResolvedValue(null);
      const result = await service.getArtifact('user-2', 'a-1');
      expect(result).toBeNull();
      expect(prisma.quantyArtifact.findFirst).toHaveBeenCalledWith({
        where: { id: 'a-1', userId: 'user-2' },
      });
    });
  });

  describe('createArtifact', () => {
    it('trims the title and defaults kind to artifact', async () => {
      const created = record({ title: 'Clean' });
      prisma.quantyArtifact.create.mockResolvedValue(created);

      const result = await service.createArtifact('user-1', { title: '  Clean  ' });

      expect(result).toBe(created);
      const data = prisma.quantyArtifact.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ userId: 'user-1', title: 'Clean', kind: 'artifact' });
    });

    it('accepts media kind with contentRef', async () => {
      prisma.quantyArtifact.create.mockResolvedValue(record({ kind: 'media' }));

      await service.createArtifact('user-1', {
        title: 'Photo',
        kind: 'media',
        contentRef: 'https://cdn.example/x.png',
      });

      const data = prisma.quantyArtifact.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ kind: 'media', contentRef: 'https://cdn.example/x.png' });
    });
  });

  describe('touchOpened', () => {
    it('updates openedAt for the owner\'s artifact', async () => {
      prisma.quantyArtifact.findFirst.mockResolvedValue(record());
      prisma.quantyArtifact.update.mockResolvedValue(record({ openedAt: new Date() }));

      const result = await service.touchOpened('user-1', 'a-1');

      expect(result).not.toBeNull();
      expect(prisma.quantyArtifact.update).toHaveBeenCalledWith({
        where: { id: 'a-1' },
        data: { openedAt: expect.any(Date) },
      });
    });

    it('returns null when the artifact does not belong to the user', async () => {
      prisma.quantyArtifact.findFirst.mockResolvedValue(null);
      const result = await service.touchOpened('user-2', 'a-1');
      expect(result).toBeNull();
      expect(prisma.quantyArtifact.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteArtifact', () => {
    it('deletes the owner\'s artifact and returns true', async () => {
      prisma.quantyArtifact.findFirst.mockResolvedValue(record());
      prisma.quantyArtifact.delete.mockResolvedValue(record());

      const result = await service.deleteArtifact('user-1', 'a-1');

      expect(result).toBe(true);
      expect(prisma.quantyArtifact.delete).toHaveBeenCalledWith({ where: { id: 'a-1' } });
    });

    it('returns false when the artifact does not belong to the user', async () => {
      prisma.quantyArtifact.findFirst.mockResolvedValue(null);

      const result = await service.deleteArtifact('user-2', 'a-1');

      expect(result).toBe(false);
      expect(prisma.quantyArtifact.delete).not.toHaveBeenCalled();
    });
  });
});
