import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryService, buildMemoryWhere, type MemoryRecord } from '../services/memory.service';

function makeMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 'mem-1',
    userId: 'user-1',
    mediaUrl: 'https://cdn/quantchat/mem-1.jpg',
    mediaType: 'PHOTO',
    caption: 'sunset',
    location: 'Tokyo',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    memory: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('buildMemoryWhere (Task 13.3)', () => {
  it('always scopes to the user and excludes soft-deleted rows', () => {
    expect(buildMemoryWhere('user-1')).toEqual({ userId: 'user-1', deletedAt: null });
  });

  it('adds a date range filter when from/to are provided', () => {
    const from = new Date('2024-01-01T00:00:00.000Z');
    const to = new Date('2024-02-01T00:00:00.000Z');
    const where = buildMemoryWhere('user-1', { from, to });
    expect(where['createdAt']).toEqual({ gte: from, lte: to });
  });

  it('adds case-insensitive location and caption filters', () => {
    const where = buildMemoryWhere('user-1', { location: 'tokyo', q: 'sunset' });
    expect(where['location']).toEqual({ contains: 'tokyo', mode: 'insensitive' });
    expect(where['caption']).toEqual({ contains: 'sunset', mode: 'insensitive' });
  });

  it('ignores blank location/caption filters', () => {
    const where = buildMemoryWhere('user-1', { location: '   ', q: '' });
    expect(where['location']).toBeUndefined();
    expect(where['caption']).toBeUndefined();
  });
});

describe('MemoryService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: MemoryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MemoryService(prisma);
  });

  it('create persists a memory with normalized null fields (Task 13.2)', async () => {
    const record = makeMemory();
    prisma.memory.create.mockResolvedValue(record);

    const result = await service.create({
      userId: 'user-1',
      mediaUrl: record.mediaUrl,
      mediaType: 'PHOTO',
    });

    expect(result).toBe(record);
    expect(prisma.memory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        mediaUrl: record.mediaUrl,
        mediaType: 'PHOTO',
        caption: null,
        location: null,
      },
    });
  });

  it('list returns memories ordered by createdAt desc (Task 13.1)', async () => {
    const records = [makeMemory({ id: 'mem-2' }), makeMemory({ id: 'mem-1' })];
    prisma.memory.findMany.mockResolvedValue(records);

    const result = await service.list('user-1', { q: 'sunset' });

    expect(result).toBe(records);
    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: buildMemoryWhere('user-1', { q: 'sunset' }),
      orderBy: { createdAt: 'desc' },
    });
  });

  it('softDelete sets deletedAt for an owned, non-deleted memory (Task 13.4)', async () => {
    prisma.memory.findFirst.mockResolvedValue(makeMemory());
    prisma.memory.update.mockResolvedValue(makeMemory({ deletedAt: new Date() }));

    await service.softDelete('user-1', 'mem-1');

    expect(prisma.memory.update).toHaveBeenCalledWith({
      where: { id: 'mem-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('softDelete throws when the memory is missing', async () => {
    prisma.memory.findFirst.mockResolvedValue(null);
    await expect(service.softDelete('user-1', 'missing')).rejects.toThrow('Memory not found');
  });

  it('restore clears deletedAt for a soft-deleted memory (Task 13.4)', async () => {
    prisma.memory.findFirst.mockResolvedValue(makeMemory({ deletedAt: new Date() }));
    prisma.memory.update.mockResolvedValue(makeMemory({ deletedAt: null }));

    await service.restore('user-1', 'mem-1');

    expect(prisma.memory.update).toHaveBeenCalledWith({
      where: { id: 'mem-1' },
      data: { deletedAt: null },
    });
  });

  it('restore throws when there is nothing soft-deleted to restore', async () => {
    prisma.memory.findFirst.mockResolvedValue(null);
    await expect(service.restore('user-1', 'mem-1')).rejects.toThrow(
      'Memory not available to restore',
    );
  });

  it('permanentDelete purges a still-soft-deleted memory (Task 13.4)', async () => {
    prisma.memory.findFirst.mockResolvedValue(makeMemory({ deletedAt: new Date() }));
    prisma.memory.delete.mockResolvedValue(makeMemory());

    await service.permanentDelete('user-1', 'mem-1');

    expect(prisma.memory.delete).toHaveBeenCalledWith({ where: { id: 'mem-1' } });
  });

  it('permanentDelete is a no-op when the row was restored (no longer soft-deleted)', async () => {
    prisma.memory.findFirst.mockResolvedValue(null);

    await service.permanentDelete('user-1', 'mem-1');

    expect(prisma.memory.delete).not.toHaveBeenCalled();
  });
});
