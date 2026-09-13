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
      email: {
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

  it('throws when no PrismaClient is configured', async () => {
    const bare = new SearchQueryService();
    await expect(bare.search('user-1', 'x')).rejects.toThrow('requires a PrismaClient');
  });
});
