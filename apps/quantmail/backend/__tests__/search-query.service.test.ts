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

  it('parses filename: and attachment-size operators', () => {
    const p = service.parse('filename:invoice.pdf larger:10M smaller:1G size:512K');
    expect(p.filename).toEqual(['invoice.pdf']);
    expect(p.largerBytes).toBe(10 * 1024 ** 2);
    expect(p.smallerBytes).toBe(1 * 1024 ** 3);
    expect(p.sizeBytes).toBe(512 * 1024);
  });

  it('parses byte sizes with bare bytes and KB/MB/GB suffixes', () => {
    expect(service.parse('larger:2048').largerBytes).toBe(2048);
    expect(service.parse('larger:2KB').largerBytes).toBe(2 * 1024);
    expect(service.parse('larger:1.5M').largerBytes).toBe(Math.floor(1.5 * 1024 ** 2));
    expect(service.parse('larger:2g').largerBytes).toBe(2 * 1024 ** 3);
  });

  it('keeps quoted filename values together', () => {
    expect(service.parse('filename:"year end report.pdf"').filename).toEqual([
      'year end report.pdf',
    ]);
  });

  it('ignores unparseable size values instead of failing the parse', () => {
    const p = service.parse('larger:banana smaller:10X');
    expect(p.largerBytes).toBeUndefined();
    expect(p.smallerBytes).toBeUndefined();
    expect(p.terms).toEqual([]);
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

  it('parses in:<knownType> case-insensitively into inFolderTypes', () => {
    const p = service.parse('in:inbox in:SENT in:Drafts in:SPAM in:trash in:Archive');
    expect(p.inFolderTypes).toEqual(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']);
    expect(p.folderIds).toEqual([]);
  });

  it('maps unknown in: values to folderIds (never silently dropped)', () => {
    const p = service.parse('in:custom-folder-1 in:work');
    expect(p.inFolderTypes).toEqual([]);
    expect(p.folderIds).toEqual(['custom-folder-1', 'work']);
  });

  it('parses combined operators with in: (from:x in:inbox)', () => {
    const p = service.parse('from:alice in:inbox invoice');
    expect(p.from).toEqual(['alice']);
    expect(p.inFolderTypes).toEqual(['inbox']);
    expect(p.terms).toEqual(['invoice']);
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

  it('maps quoted phrase to an OR over subject/snippet/body/attachments', () => {
    const where = service.buildEmailWhere('user-1', '"quarterly results"');
    const and = where.AND as Record<string, unknown>[];
    const textCond = and.find((c) => 'OR' in c) as { OR: Record<string, unknown>[] };
    expect(textCond.OR).toHaveLength(4);
    expect(textCond.OR[0]).toEqual({
      subject: { contains: 'quarterly results', mode: 'insensitive' },
    });
    expect(textCond.OR).toContainEqual({
      attachments: { string_contains: 'quarterly results', mode: 'insensitive' },
    });
  });

  it('maps a bare term to an attachments branch so invoice.pdf finds its file', () => {
    const where = service.buildEmailWhere('user-1', 'invoice.pdf');
    const and = where.AND as Record<string, unknown>[];
    const textCond = and.find((c) => 'OR' in c) as { OR: Record<string, unknown>[] };
    expect(textCond.OR).toContainEqual({
      attachments: { string_contains: 'invoice.pdf', mode: 'insensitive' },
    });
  });

  it('maps filename: to an attachments string_contains condition', () => {
    const where = service.buildEmailWhere('user-1', 'filename:invoice.pdf');
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({
      attachments: { string_contains: 'invoice.pdf', mode: 'insensitive' },
    });
  });

  it('emits no Prisma clause for size operators (raw-SQL path only, never approximated)', () => {
    const where = service.buildEmailWhere('user-1', 'larger:10M smaller:1M size:5M');
    expect(where.AND).toBeUndefined();
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

  it('maps in:sent to the sent condition (mirrors GET /emails folderType=SENT)', () => {
    const where = service.buildEmailWhere('user-1', 'in:sent');
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ isSent: true, isTrash: false });
  });

  it('maps in:trash to the trash condition', () => {
    const where = service.buildEmailWhere('user-1', 'in:trash');
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ isTrash: true });
  });

  it('maps in:archive to the archive-folder relation condition', () => {
    const where = service.buildEmailWhere('user-1', 'in:archive');
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({
      isTrash: false,
      folder: { is: { type: 'ARCHIVE' } },
    });
  });

  it('maps in:inbox to the default-inbox condition (unfiled, INBOX folder, or sent)', () => {
    const where = service.buildEmailWhere('user-1', 'in:inbox');
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({
      isDraft: false,
      isSpam: false,
      isTrash: false,
      AND: [
        {
          OR: [
            { folderId: null },
            { folder: { is: { type: 'INBOX' } } },
            { isSent: true },
          ],
        },
      ],
    });
  });

  it('ORs multiple in: types instead of ANDing contradictory flags', () => {
    const where = service.buildEmailWhere('user-1', 'in:trash in:spam');
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({
      OR: [{ isTrash: true }, { isSpam: true, isTrash: false }],
    });
  });

  it('combines in: with other operators and explicit folder ids', () => {
    const where = service.buildEmailWhere('user-1', 'from:alice in:inbox folder:fid-1');
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ fromAddress: { contains: 'alice', mode: 'insensitive' } });
    expect(and).toContainEqual({ folderId: { in: ['fid-1'] } });
    expect(and.some((c) => 'isDraft' in c && 'isTrash' in c)).toBe(true);
  });

  it('adds no folder condition when no in: operator is present', () => {
    const where = service.buildEmailWhere('user-1', 'from:alice');
    const and = where.AND as Record<string, unknown>[];
    expect(and.some((c) => 'isSent' in c || 'isTrash' in c || 'folder' in c)).toBe(false);
  });

  it('excludes trash and spam by default (Gmail parity with the literal search path)', () => {
    const where = service.buildEmailWhere('user-1', 'from:alice');
    expect(where.isTrash).toBe(false);
    expect(where.isSpam).toBe(false);
  });

  it('excludes trash and spam by default for free-text queries too', () => {
    const where = service.buildEmailWhere('user-1', 'invoice');
    expect(where.isTrash).toBe(false);
    expect(where.isSpam).toBe(false);
  });

  it('in:trash is the escape hatch: drops only the trash exclusion', () => {
    const where = service.buildEmailWhere('user-1', 'in:trash');
    expect(where.isTrash).toBeUndefined();
    expect(where.isSpam).toBe(false);
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ isTrash: true });
  });

  it('in:spam is the escape hatch: drops only the spam exclusion', () => {
    const where = service.buildEmailWhere('user-1', 'in:spam');
    expect(where.isSpam).toBeUndefined();
    expect(where.isTrash).toBe(false);
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ isSpam: true, isTrash: false });
  });

  it('is:spam is the escape hatch: drops only the spam exclusion', () => {
    const where = service.buildEmailWhere('user-1', 'is:spam invoice');
    expect(where.isSpam).toBeUndefined();
    expect(where.isTrash).toBe(false);
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ isSpam: true });
  });

  it('explicit in:trash in:spam drops both default exclusions', () => {
    const where = service.buildEmailWhere('user-1', 'in:trash in:spam');
    expect(where.isTrash).toBeUndefined();
    expect(where.isSpam).toBeUndefined();
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

  it('takes the raw-SQL path for a filename:-only query and matches filename/name fields', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return [{ total: 1 }];
      }
      return [{ id: 'email-att-1', attachments: [{ filename: 'invoice.pdf', size: 1234 }] }];
    });

    const result = await service.search('user-1', 'filename:invoice.pdf', { page: 1, limit: 10 });

    expect(result.total).toBe(1);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    const countCall = prisma.$queryRawUnsafe.mock.calls.find((c: any[]) =>
      String(c[0]).includes('COUNT(*)'),
    )!;
    expect(countCall[0]).toContain('jsonb_array_elements');
    expect(countCall[0]).toContain("(elem ->> 'filename') ILIKE $");
    expect(countCall[0]).toContain("(elem ->> 'name') ILIKE $");
    expect(countCall).toContain('%invoice.pdf%');
    // No full-text vector clause when there are no free-text terms.
    expect(countCall[0]).not.toContain('plainto_tsquery');
  });

  it('expresses larger:/smaller:/size: against summed/single attachment bytes in raw SQL', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return [{ total: 1 }];
      }
      return [{ id: 'email-big-1' }];
    });

    const result = await service.search('user-1', 'larger:10M smaller:1G size:5M', {
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(1);
    const countCall = prisma.$queryRawUnsafe.mock.calls.find((c: any[]) =>
      String(c[0]).includes('COUNT(*)'),
    )!;
    const sql = String(countCall[0]);
    expect(sql).toContain('COALESCE(SUM(');
    expect(sql).toContain("(elem->>'size')");
    expect(sql).toContain('> $');
    expect(sql).toContain('< $');
    expect(countCall).toContain(10 * 1024 ** 2);
    expect(countCall).toContain(1 * 1024 ** 3);
    expect(countCall).toContain(5 * 1024 ** 2);
  });

  it('folds the attachments JSON text into the full-text vector for free-text terms', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return [{ total: 1 }];
      }
      return [{ id: 'email-fts-att-1' }];
    });

    await service.search('user-1', 'invoice.pdf', { page: 1, limit: 10 });

    const countCall = prisma.$queryRawUnsafe.mock.calls.find((c: any[]) =>
      String(c[0]).includes('COUNT(*)'),
    )!;
    expect(String(countCall[0])).toContain(`coalesce("attachments"::text, '')`);
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

  it('wires in: types into the raw full-text search SQL branch (in:inbox)', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 2 }];
      }
      return [{ id: 'email-inbox-1' }, { id: 'email-inbox-2' }];
    });

    const result = await service.search('user-1', 'in:inbox invoice', { page: 1, limit: 10 });

    expect(result.total).toBe(2);
    const calls = prisma.$queryRawUnsafe.mock.calls;
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, "userId"'));
    expect(dataCall).toBeDefined();

    const sql = String(dataCall![0]);
    // Mirrors folderTypeCondition('inbox'): not draft/spam/trash, and
    // unfiled OR in the INBOX folder OR sent in an active thread.
    expect(sql).toContain('"isDraft" = $');
    expect(sql).toContain('"isSpam" = $');
    expect(sql).toContain('"isTrash" = $');
    expect(sql).toContain('"folderId" IS NULL');
    expect(sql).toContain('email_folders');
    expect(sql).toContain("type = 'INBOX'");
    expect(sql).toContain('"isSent" = $');
    // Bind values: three falses for draft/spam/trash, true for the isSent arm.
    expect(dataCall!.filter((p) => p === false).length).toBeGreaterThanOrEqual(3);
    expect(dataCall!).toContain(true);
  });

  it('wires in:sent into the raw full-text search SQL branch', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 1 }];
      }
      return [{ id: 'email-sent-1' }];
    });

    const result = await service.search('user-1', 'in:sent invoice', { page: 1, limit: 10 });

    expect(result.total).toBe(1);
    const calls = prisma.$queryRawUnsafe.mock.calls;
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, "userId"'));
    expect(dataCall).toBeDefined();

    const sql = String(dataCall![0]);
    expect(sql).toContain('"isSent" = $');
    expect(sql).toContain('"isTrash" = $');
    // No folder-table subquery needed for the flag-based sent condition.
    expect(sql).not.toContain('email_folders');
  });

  it('wires multiple in: types into the raw SQL branch as an OR', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 1 }];
      }
      return [{ id: 'email-1' }];
    });

    await service.search('user-1', 'in:trash in:spam invoice', { page: 1, limit: 10 });

    const calls = prisma.$queryRawUnsafe.mock.calls;
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, "userId"'));
    const sql = String(dataCall![0]);
    expect(sql).toContain('"isTrash" = $');
    expect(sql).toContain('"isSpam" = $');
    expect(sql).toContain(' OR ');
    // Both defaults dropped (explicit trash + spam requested): the one
    // remaining false bind is the spam folder clause's own
    // `"isTrash" = false` — spam-folder semantics exclude trash by design.
    expect(dataCall!.filter((p) => p === false)).toHaveLength(1);
    expect(dataCall!.filter((p) => p === true)).toHaveLength(2);
  });

  it('excludes trash and spam by default on the raw full-text search SQL branch', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 1 }];
      }
      return [{ id: 'email-1' }];
    });

    await service.search('user-1', 'from:alice invoice', { page: 1, limit: 10 });

    const calls = prisma.$queryRawUnsafe.mock.calls;
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, "userId"'));
    const sql = String(dataCall![0]);
    expect(sql).toContain('"isTrash" = $');
    expect(sql).toContain('"isSpam" = $');
    // Exactly the two default-exclusion binds (no operator requested trash/spam).
    expect(dataCall!.filter((p) => p === false)).toHaveLength(2);
  });

  it('in:trash on the raw branch drops only the default trash exclusion', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 1 }];
      }
      return [{ id: 'email-1' }];
    });

    await service.search('user-1', 'in:trash invoice', { page: 1, limit: 10 });

    const calls = prisma.$queryRawUnsafe.mock.calls;
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, "userId"'));
    const sql = String(dataCall![0]);
    // isTrash=true comes from the trash folder clause; the isSpam=false
    // default stays (one false bind left).
    expect(sql).toContain('"isTrash" = $');
    expect(sql).toContain('"isSpam" = $');
    expect(dataCall!.filter((p) => p === false)).toHaveLength(1);
    expect(dataCall!).toContain(true);
  });

  it('is:spam on the raw branch drops only the default spam exclusion', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 1 }];
      }
      return [{ id: 'email-1' }];
    });

    await service.search('user-1', 'is:spam invoice', { page: 1, limit: 10 });

    const calls = prisma.$queryRawUnsafe.mock.calls;
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, "userId"'));
    const sql = String(dataCall![0]);
    // isSpam=true comes from the is:spam operator; the isTrash=false
    // default stays (one false bind left).
    expect(sql).toContain('"isSpam" = $');
    expect(sql).toContain('"isTrash" = $');
    expect(dataCall!.filter((p) => p === false)).toHaveLength(1);
    expect(dataCall!).toContain(true);
  });

  it('wires in: types into the Prisma fallback path when $queryRawUnsafe throws', async () => {
    prisma.$queryRawUnsafe.mockRejectedValue(new Error('raw query failed'));
    prisma.email.findMany.mockResolvedValue([{ id: 'email-prisma-1' }]);
    prisma.email.count.mockResolvedValue(1);

    const result = await service.search('user-1', 'in:trash invoice', { page: 1, limit: 10 });

    expect(result.data).toEqual([{ id: 'email-prisma-1' }]);
    const callArg = prisma.email.findMany.mock.calls[0]?.[0] as { where: { AND: unknown[] } };
    expect(callArg.where.AND).toContainEqual({ isTrash: true });
  });
});

describe('SearchQueryService.parse in:anywhere', () => {
  const service = new SearchQueryService();

  it('recognizes in:anywhere as a scope modifier, not a folder id', () => {
    const p = service.parse('in:anywhere');
    expect(p.inAnywhere).toBe(true);
    expect(p.inFolderTypes).toEqual([]);
    expect(p.folderIds).toEqual([]);
    expect(p.terms).toEqual([]);
  });

  it('keeps in:anywhere alongside free text and other operators', () => {
    const p = service.parse('in:anywhere invoice from:alice');
    expect(p.inAnywhere).toBe(true);
    expect(p.terms).toEqual(['invoice']);
    expect(p.from).toEqual(['alice']);
    expect(p.folderIds).toEqual([]);
  });

  it('matches in:ANYWHERE case-insensitively', () => {
    expect(service.parse('in:ANYWHERE').inAnywhere).toBe(true);
  });

  it('does not treat folder:anywhere as the scope modifier', () => {
    const p = service.parse('folder:anywhere');
    expect(p.inAnywhere).toBeUndefined();
    expect(p.folderIds).toEqual(['anywhere']);
  });
});

describe('SearchQueryService.buildEmailWhere in:anywhere', () => {
  const service = new SearchQueryService();

  it('drops the default trash/spam exclusions and adds no folder predicate', () => {
    const where = service.buildEmailWhere('user-1', 'in:anywhere');
    expect(where.userId).toBe('user-1');
    expect(where.deletedAt).toBeNull();
    expect(where.isTrash).toBeUndefined();
    expect(where.isSpam).toBeUndefined();
    expect(where.AND).toBeUndefined();
  });

  it('combines in:anywhere with free-text terms (no isTrash/isSpam defaults)', () => {
    const where = service.buildEmailWhere('user-1', 'in:anywhere invoice');
    expect(where.isTrash).toBeUndefined();
    expect(where.isSpam).toBeUndefined();
    const and = where.AND as Record<string, unknown>[];
    expect(and).toHaveLength(1);
    expect(and[0]).toHaveProperty('OR');
  });
});

describe('SearchQueryService in:anywhere acceptance (CODEX-REVIEW follow-up for #1132)', () => {
  const service = new SearchQueryService();

  /** Minimal in-memory evaluator for the Prisma `where` shapes this service
   *  emits for the tested queries: field equality, AND/OR nesting, and
   *  contains (case-insensitive). */
  function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (key === 'AND') {
        if (!(value as Record<string, unknown>[]).every((c) => matchesWhere(row, c))) return false;
      } else if (key === 'OR') {
        if (!(value as Record<string, unknown>[]).some((c) => matchesWhere(row, c))) return false;
      } else if (value !== null && typeof value === 'object' && 'contains' in value) {
        const hay = String(row[key] ?? '');
        const needle = String((value as { contains: unknown }).contains);
        const insensitive = (value as { mode?: string }).mode === 'insensitive';
        const h = insensitive ? hay.toLowerCase() : hay;
        const n = insensitive ? needle.toLowerCase() : needle;
        if (!h.includes(n)) return false;
      } else {
        if (row[key] !== value) return false;
      }
    }
    return true;
  }

  const rows: Record<string, unknown>[] = [
    { id: 'inbox', userId: 'u1', deletedAt: null, isTrash: false, isSpam: false, subject: 'invoice Q3', snippet: '', bodyPlain: '' },
    { id: 'spam', userId: 'u1', deletedAt: null, isTrash: false, isSpam: true, subject: 'invoice lottery', snippet: '', bodyPlain: '' },
    { id: 'trash', userId: 'u1', deletedAt: null, isTrash: true, isSpam: false, subject: 'invoice old', snippet: '', bodyPlain: '' },
    { id: 'deleted', userId: 'u1', deletedAt: new Date('2026-09-01T00:00:00.000Z'), isTrash: false, isSpam: false, subject: 'invoice gone', snippet: '', bodyPlain: '' },
    { id: 'other-user', userId: 'u2', deletedAt: null, isTrash: false, isSpam: false, subject: 'invoice theirs', snippet: '', bodyPlain: '' },
  ];

  const matchedIds = (query: string) =>
    rows.filter((r) => matchesWhere(r, service.buildEmailWhere('u1', query))).map((r) => r.id);

  it('in:anywhere includes inbox + spam + trash, excludes soft-deleted and other-user rows', () => {
    expect(matchedIds('in:anywhere').sort()).toEqual(['inbox', 'spam', 'trash']);
  });

  it('in:anywhere invoice includes inbox + spam + trash matches, excludes soft-deleted and other-user rows', () => {
    expect(matchedIds('in:anywhere invoice').sort()).toEqual(['inbox', 'spam', 'trash']);
  });

  it('control: a plain invoice search still excludes trash and spam by default', () => {
    expect(matchedIds('invoice').sort()).toEqual(['inbox']);
  });
});

describe('SearchQueryService.search in:anywhere', () => {
  function createMockPrisma() {
    return {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('raw query disabled in base mock')),
      email: { findMany: vi.fn(), count: vi.fn() },
    };
  }

  let prisma: ReturnType<typeof createMockPrisma>;
  let service: SearchQueryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new SearchQueryService(prisma as never);
  });

  it('Prisma path: in:anywhere carries no isTrash/isSpam exclusions, keeps userId + deletedAt:null', async () => {
    prisma.email.findMany.mockResolvedValue([{ id: 'e1' }]);
    prisma.email.count.mockResolvedValue(1);

    await service.search('user-1', 'in:anywhere', { limit: 10 });

    const callArg = prisma.email.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where.userId).toBe('user-1');
    expect(callArg.where.deletedAt).toBeNull();
    expect(callArg.where.isTrash).toBeUndefined();
    expect(callArg.where.isSpam).toBeUndefined();
  });

  it('raw FTS path: in:anywhere invoice drops trash/spam exclusions, keeps user/deleted/terms clauses', async () => {
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 3 }];
      }
      return [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }];
    });

    const result = await service.search('user-1', 'in:anywhere invoice', { page: 1, limit: 10 });

    expect(result.total).toBe(3);
    const calls = prisma.$queryRawUnsafe.mock.calls;
    const dataCall = calls.find((c: any[]) => String(c[0]).includes('SELECT id, "userId"'));
    expect(dataCall).toBeDefined();
    const sql = String(dataCall![0]);
    // Core scope preserved: user, soft-delete, and the full-text term match.
    expect(sql).toContain('"userId" = $1');
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain("plainto_tsquery('english', $2)");
    expect(dataCall![1]).toBe('user-1');
    expect(dataCall![2]).toBe('invoice');
    // Both default exclusions dropped: no isTrash/isSpam predicates at all.
    expect(sql).not.toContain('"isTrash" = $');
    expect(sql).not.toContain('"isSpam" = $');
    expect(dataCall!.filter((p) => p === false)).toHaveLength(0);
  });
});
