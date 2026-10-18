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
    isPrivate: false,
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
  // QC-F-450: the default where now also pins isPrivate:false — the public
  // listing can never match a private row. (Negative control: the pre-fix
  // builder returned exactly { userId, deletedAt: null } and fails this.)
  it('always scopes to the user and excludes soft-deleted rows', () => {
    expect(buildMemoryWhere('user-1')).toEqual({ userId: 'user-1', deletedAt: null, isPrivate: false });
  });

  it('QC-F-450: the private section matches ONLY private rows, filters still AND-combine', () => {
    const where = buildMemoryWhere('user-1', { q: 'sunset' }, 'private');
    expect(where).toEqual({
      userId: 'user-1',
      deletedAt: null,
      isPrivate: true,
      caption: { contains: 'sunset', mode: 'insensitive' },
    });
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
        isPrivate: false,
      },
    });
  });

  it('QC-F-450: create persists isPrivate when asked (route gates this on an unlock)', async () => {
    const record = makeMemory({ isPrivate: true });
    prisma.memory.create.mockResolvedValue(record);

    await service.create({
      userId: 'user-1',
      mediaUrl: record.mediaUrl,
      mediaType: 'PHOTO',
      isPrivate: true,
    });

    expect(prisma.memory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isPrivate: true }),
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

  it('QC-F-450: list with the private section queries isPrivate:true only', async () => {
    prisma.memory.findMany.mockResolvedValue([makeMemory({ id: 'mem-priv', isPrivate: true })]);

    await service.list('user-1', {}, 'private');

    expect(prisma.memory.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null, isPrivate: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('QC-F-450: setPrivate flips the flag for an owned memory', async () => {
    prisma.memory.findFirst.mockResolvedValue(makeMemory());
    prisma.memory.update.mockResolvedValue(makeMemory({ isPrivate: true }));

    const result = await service.setPrivate('user-1', 'mem-1', true);

    expect(result.isPrivate).toBe(true);
    expect(prisma.memory.update).toHaveBeenCalledWith({
      where: { id: 'mem-1' },
      data: { isPrivate: true },
    });
  });

  it('QC-F-450: setPrivate is idempotent — already on the target side returns unchanged, no update', async () => {
    prisma.memory.findFirst.mockResolvedValue(makeMemory({ isPrivate: true }));

    const result = await service.setPrivate('user-1', 'mem-1', true);

    expect(result.isPrivate).toBe(true);
    expect(prisma.memory.update).not.toHaveBeenCalled();
  });

  it('QC-F-450: setPrivate 404s for a missing or foreign memory', async () => {
    prisma.memory.findFirst.mockResolvedValue(null);
    await expect(service.setPrivate('user-1', 'nope', true)).rejects.toThrow('Memory not found');
  });

  it('QC-F-450: softDelete with a public scope cannot see a private row (the lookup carries isPrivate:false)', async () => {
    prisma.memory.findFirst.mockResolvedValue(null);

    await expect(service.softDelete('user-1', 'mem-priv', { isPrivate: false })).rejects.toThrow(
      'Memory not found',
    );
    expect(prisma.memory.findFirst).toHaveBeenCalledWith({
      where: { id: 'mem-priv', userId: 'user-1', deletedAt: null, isPrivate: false },
    });
    expect(prisma.memory.update).not.toHaveBeenCalled();
  });

  it('QC-F-450: restore with a public scope cannot see a soft-deleted private row', async () => {
    prisma.memory.findFirst.mockResolvedValue(null);

    await expect(service.restore('user-1', 'mem-priv', { isPrivate: false })).rejects.toThrow(
      'Memory not available to restore',
    );
    expect(prisma.memory.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'mem-priv',
        userId: 'user-1',
        deletedAt: { not: null },
        isPrivate: false,
      },
    });
  });
});
