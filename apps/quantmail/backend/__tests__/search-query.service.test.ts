import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchQueryService } from '../services/search-query.service';

describe('SearchQueryService.parse', () => {
  const service = new SearchQueryService();
  const NOW = new Date('2026-06-20T00:00:00.000Z');

  it('parses operators and free text', () => {
    const p = service.parse('from:alice subject:invoice hello world');
    expect(p.from).toEqual(['alice']);
    expect(p.subject).toEqual(['invoice']);
    expect(p.terms).toEqual(['hello', 'world']);
  });

  it('keeps quoted phrases together', () => {
    const p = service.parse('"quarterly report" from:bob');
    expect(p.terms).toEqual(['quarterly report']);
    expect(p.from).toEqual(['bob']);
  });

  it('supports operator values in quotes', () => {
    const p = service.parse('subject:"year end review"');
    expect(p.subject).toEqual(['year end review']);
  });

  it('parses is: flags including read=>isUnread false', () => {
    expect(service.parse('is:unread').isUnread).toBe(true);
    expect(service.parse('is:read').isUnread).toBe(false);
    expect(service.parse('is:starred').isStarred).toBe(true);
    expect(service.parse('is:important').isImportant).toBe(true);
    expect(service.parse('is:spam').isSpam).toBe(true);
  });

  it('parses has:attachment', () => {
    expect(service.parse('has:attachment').hasAttachment).toBe(true);
    expect(service.parse('has:attachments').hasAttachment).toBe(true);
  });

  it('distinguishes in:<knownType> from folder ids', () => {
    const p = service.parse('in:inbox in:CUSTOMID folder:fid-1');
    expect(p.inFolderTypes).toEqual(['inbox']);
    expect(p.folderIds).toEqual(['CUSTOMID', 'fid-1']);
  });

  it('parses absolute before/after dates', () => {
    const p = service.parse('after:2026-01-01 before:2026-02-01');
    expect(p.after?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(p.before?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('parses relative newer_than/older_than against now', () => {
    const p = service.parse('newer_than:7d older_than:2w', NOW);
    expect(p.after?.toISOString()).toBe('2026-06-13T00:00:00.000Z'); // 7 days before
    expect(p.before?.toISOString()).toBe('2026-06-06T00:00:00.000Z'); // 14 days before
  });

  it('collects multiple of the same operator', () => {
    const p = service.parse('label:work label:urgent to:a@x.com to:b@x.com');
    expect(p.labels).toEqual(['work', 'urgent']);
    expect(p.to).toEqual(['a@x.com', 'b@x.com']);
  });

  it('treats unknown operators as free text', () => {
    const p = service.parse('priority:high');
    expect(p.terms).toEqual(['priority:high']);
  });
});

describe('SearchQueryService.buildEmailWhere', () => {
  const service = new SearchQueryService();

  it('always scopes to user and excludes deleted', () => {
    const where = service.buildEmailWhere('user-1', '');
    expect(where.userId).toBe('user-1');
    expect(where.deletedAt).toBeNull();
    expect(where.AND).toBeUndefined();
  });

  it('maps scalar operators to Prisma conditions', () => {
    const where = service.buildEmailWhere('user-1', 'from:alice is:unread has:attachment');
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ fromAddress: { contains: 'alice', mode: 'insensitive' } });
    expect(and).toContainEqual({ isRead: false });
    expect(and).toContainEqual({ hasAttachments: true });
  });

  it('maps date range to receivedAt gte/lte', () => {
    const where = service.buildEmailWhere('user-1', 'after:2026-01-01 before:2026-02-01');
    const and = where.AND as Record<string, unknown>[];
    const dateCond = and.find((c) => 'receivedAt' in c) as { receivedAt: Record<string, Date> };
    expect(dateCond.receivedAt.gte?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(dateCond.receivedAt.lte?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('maps quoted phrase to an OR over subject/snippet/body', () => {
    const where = service.buildEmailWhere('user-1', '"quarterly results"');
    const and = where.AND as Record<string, unknown>[];
    const textCond = and.find((c) => 'OR' in c) as { OR: Record<string, unknown>[] };
    expect(textCond.OR).toHaveLength(3);
    expect(textCond.OR[0]).toEqual({
      subject: { contains: 'quarterly results', mode: 'insensitive' },
    });
  });

  it('maps multiple terms to separate AND conditions matching in any order', () => {
    const where = service.buildEmailWhere('user-1', 'invoice acme');
    const and = where.AND as { OR: Record<string, unknown>[] }[];
    expect(and).toHaveLength(2);
    expect(and[0]?.OR[0]).toEqual({
      subject: { contains: 'invoice', mode: 'insensitive' },
    });
    expect(and[1]?.OR[0]).toEqual({
      subject: { contains: 'acme', mode: 'insensitive' },
    });
  });

  it('maps to:/label: to array_contains', () => {
    const where = service.buildEmailWhere('user-1', 'to:bob@x.com label:work');
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ toAddresses: { array_contains: 'bob@x.com' } });
    expect(and).toContainEqual({ labels: { array_contains: 'work' } });
  });
});

describe('SearchQueryService.search', () => {
  function createMockPrisma() {
    return {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('raw query disabled in base mock')),
      email: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      file: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      document: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
  }

  let prisma: ReturnType<typeof createMockPrisma>;
  let service: SearchQueryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new SearchQueryService(prisma as never);
  });

  it('paginates and orders by receivedAt desc', async () => {
    prisma.email.findMany.mockResolvedValue([{ id: 'e1' }]);
    prisma.email.count.mockResolvedValue(1);

    const result = await service.search('user-1', 'from:alice', { page: 2, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(1);
    const callArg = prisma.email.findMany.mock.calls[0]?.[0] as {
      skip: number;
      take: number;
      orderBy: unknown;
    };
    expect(callArg.skip).toBe(10);
    expect(callArg.take).toBe(10);
    expect(callArg.orderBy).toEqual({ receivedAt: 'desc' });
  });

  it('supports cursor-based pagination with limit and nextCursor', async () => {
    prisma.email.findMany.mockResolvedValue([
      { id: 'e2' },
      { id: 'e3' },
      { id: 'e4' }, // 3 items returned for limit 2 -> hasMore = true
    ]);
    prisma.email.count.mockResolvedValue(10);

    const result = await service.search('user-1', 'from:alice', {
      cursor: 'e1',
      limit: 2,
    });

    expect(result.data).toEqual([{ id: 'e2' }, { id: 'e3' }]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('e3');
    expect(result.pageSize).toBe(2);

    const callArg = prisma.email.findMany.mock.calls[0]?.[0] as {
      cursor: { id: string };
      skip: number;
      take: number;
    };
    expect(callArg.cursor).toEqual({ id: 'e1' });
    expect(callArg.skip).toBe(1);
    expect(callArg.take).toBe(3);
  });

  it('supports initial page with limit and no cursor', async () => {
    prisma.email.findMany.mockResolvedValue([{ id: 'e1' }]);
    prisma.email.count.mockResolvedValue(1);

    const result = await service.search('user-1', 'test', { limit: 5 });

    expect(result.data).toEqual([{ id: 'e1' }]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('throws when no PrismaClient is configured', async () => {
    const bare = new SearchQueryService();
    await expect(bare.search('user-1', 'x')).rejects.toThrow('requires a PrismaClient');
  });

  it('searches drive files by name and paginates', async () => {
    prisma.file.findMany.mockResolvedValue([{ id: 'f1', name: 'financial_report_2026.pdf' }]);
    prisma.file.count.mockResolvedValue(1);

    const res = await service.searchFiles('user-1', 'report', { limit: 10 });
    expect(res.data).toEqual([{ id: 'f1', name: 'financial_report_2026.pdf' }]);
    expect(res.total).toBe(1);
    expect(prisma.file.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          isDeleted: false,
          name: { contains: 'report', mode: 'insensitive' },
        },
      }),
    );
  });

  it('searches collaborative documents by title and content and paginates', async () => {
    prisma.document.findMany.mockResolvedValue([{ id: 'd1', title: 'Architecture RFC' }]);
    prisma.document.count.mockResolvedValue(1);

    const res = await service.searchDocuments('user-1', 'RFC', { limit: 10 });
    expect(res.data).toEqual([{ id: 'd1', title: 'Architecture RFC' }]);
    expect(res.total).toBe(1);
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          isDeleted: false,
          OR: [
            { title: { contains: 'RFC', mode: 'insensitive' } },
            { content: { contains: 'RFC', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('searchAll aggregates emails, drive files, and documents in parallel', async () => {
    prisma.email.findMany.mockResolvedValue([{ id: 'e1' }]);
    prisma.email.count.mockResolvedValue(1);
    prisma.file.findMany.mockResolvedValue([{ id: 'f1' }]);
    prisma.file.count.mockResolvedValue(1);
    prisma.document.findMany.mockResolvedValue([{ id: 'd1' }]);
    prisma.document.count.mockResolvedValue(1);

    const res = await service.searchAll('user-1', 'test', { limit: 5 });
    expect(res.query).toBe('test');
    expect(res.emails).toHaveLength(1);
    expect(res.files).toHaveLength(1);
    expect(res.documents).toHaveLength(1);
  });

  it('executes parameterized raw full-text search with LIMIT and OFFSET against emails_fts_idx when terms present (G3-10 & G3-11)', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return [{ total: 1 }];
      }
      return [
        {
          id: 'email-fts-1',
          userId: 'user-1',
          subject: 'Project Alpha Q3 Report',
          bodyPlain: 'Detailed revenue report for Q3',
          receivedAt: new Date('2026-09-18T10:00:00.000Z'),
        },
      ];
    });

    const result = await service.search('user-1', 'Alpha Q3 from:bob is:unread', {
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as any).id).toBe('email-fts-1');
    expect(result.total).toBe(1);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);

    const calls = prisma.$queryRawUnsafe.mock.calls;
    const countCall = calls.find((c: any[]) => String(c[0]).includes('COUNT(*)'));
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, "userId"'));

    expect(countCall).toBeDefined();
    expect(dataCall).toBeDefined();

    expect(countCall![0]).toContain('COUNT(*)::int AS total FROM emails');
    expect(countCall![0]).toContain("to_tsvector('english'");
    expect(countCall![0]).toContain("plainto_tsquery('english', $2)");
    expect(countCall!).toContain('user-1');
    expect(countCall!).toContain('Alpha Q3');

    expect(dataCall![0]).toContain('LIMIT $');
    expect(dataCall![0]).toContain('OFFSET $');
    expect(dataCall!).toContain(10);
    expect(dataCall!).toContain(0);
  });

  it('gracefully falls back to Prisma email.findMany when $queryRawUnsafe throws (G3-11)', async () => {
    prisma.$queryRawUnsafe.mockRejectedValue(new Error('raw query failed'));
    prisma.email.findMany.mockResolvedValue([{ id: 'email-fallback-1' }]);
    prisma.email.count.mockResolvedValue(1);

    const result = await service.search('user-1', 'quarterly report', { page: 1, limit: 10 });

    expect(result.data).toEqual([{ id: 'email-fallback-1' }]);
    expect(prisma.email.findMany).toHaveBeenCalled();
  });

  it('executes parameterized raw full-text search with LIMIT and OFFSET against documents_fts_idx (G3-11)', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('count(*)')) {
        return [{ total: 1 }];
      }
      return [
        {
          id: 'doc-fts-1',
          title: 'Quantum Computing Specs',
          userId: 'user-1',
          snapshotStorageKey: 'documents/doc-fts-1/snapshots/1.yjs',
        },
      ];
    });

    const result = await service.searchDocuments('user-1', 'Quantum Computing', {
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as any).id).toBe('doc-fts-1');
    expect(result.total).toBe(1);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);

    const calls = prisma.$queryRawUnsafe.mock.calls;
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, title'));
    const countCall = calls.find((c: any[]) => String(c[0]).includes('count(*)'));

    expect(dataCall).toBeDefined();
    expect(countCall).toBeDefined();
    expect(dataCall![0]).toContain("to_tsvector('english'");
    expect(dataCall![0]).toContain("plainto_tsquery('english', $2)");
    expect(dataCall![0]).toContain('LIMIT $3 OFFSET $4');
    expect(dataCall![1]).toBe('user-1');
    expect(dataCall![2]).toBe('Quantum Computing');
    expect(dataCall![3]).toBe(10);
    expect(dataCall![4]).toBe(0);
  });

  it('falls back to Prisma document.findMany when $queryRawUnsafe throws (G3-11)', async () => {
    prisma.$queryRawUnsafe.mockRejectedValue(new Error('raw query failed'));
    prisma.document.findMany.mockResolvedValue([{ id: 'doc-fb-1', title: 'Fallback Doc' }]);
    prisma.document.count.mockResolvedValue(1);

    const result = await service.searchDocuments('user-1', 'Fallback', { page: 1, limit: 10 });

    expect(result.data).toEqual([{ id: 'doc-fb-1', title: 'Fallback Doc' }]);
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          isDeleted: false,
        }),
      }),
    );
  });

  it('falls back to Prisma document.findMany when $queryRawUnsafe is not defined (G3-11)', async () => {
    const noRawPrisma = {
      document: {
        findMany: vi.fn().mockResolvedValue([{ id: 'doc-no-raw', title: 'No Raw' }]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const s = new SearchQueryService(noRawPrisma as any);
    const result = await s.searchDocuments('user-1', 'No Raw', { page: 1, limit: 10 });

    expect(result.data).toEqual([{ id: 'doc-no-raw', title: 'No Raw' }]);
    expect(noRawPrisma.document.findMany).toHaveBeenCalled();
  });

  it('preserves to:, label:, and is:important operators in the raw full-text search SQL branch (G3-12)', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 1 }];
      }
      return [
        {
          id: 'email-filtered-1',
          subject: 'Alpha invoice',
          fromAddress: 'alice@example.com',
          toAddresses: ['bob@example.com'],
          labels: ['finance', 'urgent'],
          isImportant: true,
        },
      ];
    });

    const result = await service.search(
      'user-1',
      'invoice to:bob@example.com label:finance is:important',
      { page: 1, limit: 10 },
    );

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as any).id).toBe('email-filtered-1');
    expect(result.total).toBe(1);

    const calls = prisma.$queryRawUnsafe.mock.calls;
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, "userId"'));
    const countCall = calls.find((c: any[]) => String(c[0]).includes('COUNT(*)::int'));

    expect(dataCall).toBeDefined();
    expect(countCall).toBeDefined();

    // Verify SQL contains operators
    expect(dataCall![0]).toContain('"toAddresses"::text ILIKE $');
    expect(dataCall![0]).toContain('"labels"::text ILIKE $');
    expect(dataCall![0]).toContain('"isImportant" = $');

    // Verify params contain the operator values
    expect(dataCall!).toContain('%bob@example.com%');
    expect(dataCall!).toContain('%finance%');
    expect(dataCall!).toContain(true);
  });
});
