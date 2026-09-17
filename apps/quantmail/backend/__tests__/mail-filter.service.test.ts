import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MailFilterService } from '../services/mail-filter.service';
import type {
  EvaluatedEmail,
  FilterCondition,
  FilterAction,
} from '../services/mail-filter.service';

function createMockPrisma() {
  return {
    mailFilter: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    email: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
}

interface MockFilter {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchAll: boolean;
  conditions: FilterCondition[];
  actions: FilterAction[];
  createdAt: Date;
  updatedAt: Date;
}

function makeFilter(overrides: Partial<MockFilter> = {}): MockFilter {
  return {
    id: 'filter-1',
    userId: 'user-1',
    name: 'My Filter',
    enabled: true,
    priority: 0,
    matchAll: true,
    conditions: [],
    actions: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeEmail(overrides: Partial<EvaluatedEmail> = {}): EvaluatedEmail {
  return {
    fromAddress: 'alice@example.com',
    toAddresses: ['me@quantmail.io'],
    subject: 'Hello World',
    bodyPlain: 'This is the body',
    bodyHtml: '<p>This is the body</p>',
    hasAttachments: false,
    ...overrides,
  };
}

describe('MailFilterService', () => {
  let service: MailFilterService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MailFilterService(prisma as never);
  });

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  describe('createFilter', () => {
    it('creates a filter with defaults applied', async () => {
      const created = makeFilter({ id: 'new-filter' });
      prisma.mailFilter.create.mockResolvedValue(created);

      const result = await service.createFilter({
        userId: 'user-1',
        name: 'My Filter',
        conditions: [{ subjectContains: 'invoice' }],
        actions: [{ markRead: true }],
      });

      expect(result).toEqual(created);
      expect(prisma.mailFilter.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'My Filter',
          enabled: true,
          priority: 0,
          matchAll: true,
          conditions: [{ subjectContains: 'invoice' }],
          actions: [{ markRead: true }],
        },
      });
    });

    it('rejects an invalid forwardTo email address', async () => {
      await expect(
        service.createFilter({
          userId: 'user-1',
          name: 'Bad Forward',
          conditions: [{ from: 'x@y.com' }],
          actions: [{ forwardTo: 'not-an-email' }],
        }),
      ).rejects.toThrow('Invalid forwardTo email address');
      expect(prisma.mailFilter.create).not.toHaveBeenCalled();
    });

    it('accepts a valid forwardTo email address', async () => {
      const created = makeFilter({ id: 'fwd' });
      prisma.mailFilter.create.mockResolvedValue(created);

      const result = await service.createFilter({
        userId: 'user-1',
        name: 'Good Forward',
        conditions: [{ from: 'x@y.com' }],
        actions: [{ forwardTo: 'team@quantmail.io' }],
      });

      expect(result.id).toBe('fwd');
    });
  });

  describe('listFilters', () => {
    it('orders filters by priority asc then createdAt asc', async () => {
      const filters = [makeFilter({ id: 'f-1', priority: 1 })];
      prisma.mailFilter.findMany.mockResolvedValue(filters);

      const result = await service.listFilters('user-1');

      expect(result).toHaveLength(1);
      expect(prisma.mailFilter.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  describe('getFilter', () => {
    it('throws MAIL_FILTER_NOT_FOUND when missing', async () => {
      prisma.mailFilter.findUnique.mockResolvedValue(null);

      await expect(service.getFilter('missing', 'user-1')).rejects.toThrow('Mail filter not found');
    });

    it('throws FORBIDDEN when the filter belongs to another user', async () => {
      prisma.mailFilter.findUnique.mockResolvedValue(makeFilter({ userId: 'other-user' }));

      await expect(service.getFilter('filter-1', 'user-1')).rejects.toThrow('Not authorized');
    });

    it('returns the filter for the owner', async () => {
      const filter = makeFilter();
      prisma.mailFilter.findUnique.mockResolvedValue(filter);

      const result = await service.getFilter('filter-1', 'user-1');

      expect(result).toEqual(filter);
    });
  });

  describe('updateFilter', () => {
    it('enforces ownership before updating (403)', async () => {
      prisma.mailFilter.findUnique.mockResolvedValue(makeFilter({ userId: 'other-user' }));

      await expect(service.updateFilter('filter-1', 'user-1', { name: 'Renamed' })).rejects.toThrow(
        'Not authorized',
      );
      expect(prisma.mailFilter.update).not.toHaveBeenCalled();
    });

    it('updates only provided fields', async () => {
      prisma.mailFilter.findUnique.mockResolvedValue(makeFilter());
      prisma.mailFilter.update.mockResolvedValue(makeFilter({ name: 'Renamed', priority: 5 }));

      const result = await service.updateFilter('filter-1', 'user-1', {
        name: 'Renamed',
        priority: 5,
      });

      expect(result.name).toBe('Renamed');
      expect(prisma.mailFilter.update).toHaveBeenCalledWith({
        where: { id: 'filter-1' },
        data: { name: 'Renamed', priority: 5 },
      });
    });
  });

  describe('deleteFilter', () => {
    it('enforces ownership and deletes', async () => {
      prisma.mailFilter.findUnique.mockResolvedValue(makeFilter());
      prisma.mailFilter.delete.mockResolvedValue(makeFilter());

      const result = await service.deleteFilter('filter-1', 'user-1');

      expect(result.id).toBe('filter-1');
      expect(prisma.mailFilter.delete).toHaveBeenCalledWith({ where: { id: 'filter-1' } });
    });
  });

  // ---------------------------------------------------------------------------
  // evaluate()
  // ---------------------------------------------------------------------------

  describe('evaluate', () => {
    it('returns false when there are no conditions', () => {
      expect(service.evaluate(makeFilter({ conditions: [] }), makeEmail())).toBe(false);
    });

    it('matchAll=true (AND): all conditions must match -> true', () => {
      const filter = makeFilter({
        matchAll: true,
        conditions: [{ from: 'alice' }, { subjectContains: 'hello' }],
      });
      expect(service.evaluate(filter, makeEmail())).toBe(true);
    });

    it('matchAll=true (AND): one condition fails -> false', () => {
      const filter = makeFilter({
        matchAll: true,
        conditions: [{ from: 'alice' }, { subjectContains: 'nope' }],
      });
      expect(service.evaluate(filter, makeEmail())).toBe(false);
    });

    it('matchAll=false (OR): at least one matches -> true', () => {
      const filter = makeFilter({
        matchAll: false,
        conditions: [{ from: 'nobody' }, { subjectContains: 'world' }],
      });
      expect(service.evaluate(filter, makeEmail())).toBe(true);
    });

    it('matchAll=false (OR): none match -> false', () => {
      const filter = makeFilter({
        matchAll: false,
        conditions: [{ from: 'nobody' }, { subjectContains: 'nope' }],
      });
      expect(service.evaluate(filter, makeEmail())).toBe(false);
    });

    it('string matches are case-insensitive', () => {
      const filter = makeFilter({ conditions: [{ subjectContains: 'HELLO WORLD' }] });
      expect(service.evaluate(filter, makeEmail())).toBe(true);
    });

    it('matches the "to" address as a substring', () => {
      const filter = makeFilter({ conditions: [{ to: 'me@quantmail.io' }] });
      expect(service.evaluate(filter, makeEmail())).toBe(true);
    });

    it('matches bodyContains across plain and html body', () => {
      const filter = makeFilter({ conditions: [{ bodyContains: 'the body' }] });
      expect(service.evaluate(filter, makeEmail())).toBe(true);
    });

    it('hasAttachment condition matches when attachments present', () => {
      const filter = makeFilter({ conditions: [{ hasAttachment: true }] });
      expect(service.evaluate(filter, makeEmail({ hasAttachments: true }))).toBe(true);
      expect(service.evaluate(filter, makeEmail({ hasAttachments: false }))).toBe(false);
    });

    it('domain condition matches against the fromAddress', () => {
      const filter = makeFilter({ conditions: [{ domain: 'example.com' }] });
      expect(service.evaluate(filter, makeEmail({ fromAddress: 'bob@example.com' }))).toBe(true);
      expect(service.evaluate(filter, makeEmail({ fromAddress: 'bob@other.com' }))).toBe(false);
    });

    it('a single condition with multiple fields requires all of them (AND within)', () => {
      const filter = makeFilter({
        conditions: [{ from: 'alice', subjectContains: 'world' }],
      });
      expect(service.evaluate(filter, makeEmail())).toBe(true);
      expect(service.evaluate(filter, makeEmail({ fromAddress: 'zoe@example.com' }))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // computeActions()
  // ---------------------------------------------------------------------------

  describe('computeActions', () => {
    it('only loads enabled filters in priority order', async () => {
      prisma.mailFilter.findMany.mockResolvedValue([]);

      await service.computeActions('user-1', makeEmail());

      expect(prisma.mailFilter.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', enabled: true },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('returns empty resolved actions when nothing matches', async () => {
      prisma.mailFilter.findMany.mockResolvedValue([
        makeFilter({ id: 'f-1', conditions: [{ from: 'nobody' }], actions: [{ star: true }] }),
      ]);

      const result = await service.computeActions('user-1', makeEmail());

      expect(result.matchedFilterIds).toEqual([]);
      expect(result.addLabelIds).toEqual([]);
      expect(result.star).toBeUndefined();
    });

    it('merges actions across multiple matching filters and dedupes labels', async () => {
      prisma.mailFilter.findMany.mockResolvedValue([
        makeFilter({
          id: 'f-1',
          priority: 0,
          conditions: [{ from: 'alice' }],
          actions: [{ markRead: true, addLabelId: 'label-A' }],
        }),
        makeFilter({
          id: 'f-2',
          priority: 1,
          conditions: [{ subjectContains: 'world' }],
          actions: [{ star: true, addLabelId: 'label-A', moveToFolderId: 'folder-X' }],
        }),
      ]);

      const result = await service.computeActions('user-1', makeEmail());

      expect(result.matchedFilterIds).toEqual(['f-1', 'f-2']);
      expect(result.markRead).toBe(true);
      expect(result.star).toBe(true);
      expect(result.addLabelIds).toEqual(['label-A']);
      expect(result.moveToFolderId).toBe('folder-X');
    });

    it('archive and delete win when any matching filter requests them', async () => {
      prisma.mailFilter.findMany.mockResolvedValue([
        makeFilter({
          id: 'f-1',
          priority: 0,
          conditions: [{ from: 'alice' }],
          actions: [{ markRead: true }],
        }),
        makeFilter({
          id: 'f-2',
          priority: 5,
          conditions: [{ domain: 'example.com' }],
          actions: [{ archive: true, delete: true }],
        }),
      ]);

      const result = await service.computeActions('user-1', makeEmail());

      expect(result.matchedFilterIds).toEqual(['f-1', 'f-2']);
      expect(result.markRead).toBe(true);
      expect(result.archive).toBe(true);
      expect(result.delete).toBe(true);
    });

    it('collects forwardTo addresses across matching filters', async () => {
      prisma.mailFilter.findMany.mockResolvedValue([
        makeFilter({
          id: 'f-1',
          conditions: [{ from: 'alice' }],
          actions: [{ forwardTo: 'a@quantmail.io' }],
        }),
        makeFilter({
          id: 'f-2',
          conditions: [{ subjectContains: 'hello' }],
          actions: [{ forwardTo: 'b@quantmail.io' }],
        }),
      ]);

      const result = await service.computeActions('user-1', makeEmail());

      expect(result.forwardTo).toEqual(['a@quantmail.io', 'b@quantmail.io']);
    });
  });

  // ---------------------------------------------------------------------------
  // applyFilterToMessages
  // ---------------------------------------------------------------------------

  describe('applyFilterToMessages', () => {
    it('evaluates filter against existing user emails and updates matching messages', async () => {
      const filter = makeFilter({
        id: 'f-active',
        userId: 'user-1',
        conditions: [{ from: 'newsletter@partner.com' }],
        actions: [
          { addLabelId: 'lbl-promo', markRead: true, star: true, moveToFolderId: 'fld-archive' },
        ],
      });

      prisma.mailFilter.findUnique.mockResolvedValue(filter);

      const email1 = {
        id: 'em-1',
        userId: 'user-1',
        fromAddress: 'newsletter@partner.com',
        toAddresses: ['me@quantmail.io'],
        subject: 'Weekly Deals',
        bodyPlain: 'Discount code inside',
        bodyHtml: null,
        hasAttachments: false,
        labels: ['existing-label'],
        folderId: 'inbox',
        isRead: false,
        isStarred: false,
        isSpam: false,
        deletedAt: null,
      };

      const email2 = {
        id: 'em-2',
        userId: 'user-1',
        fromAddress: 'boss@corp.com',
        toAddresses: ['me@quantmail.io'],
        subject: 'Important update',
        bodyPlain: 'See you tomorrow',
        bodyHtml: null,
        hasAttachments: false,
        labels: [],
        folderId: 'inbox',
        isRead: false,
        isStarred: false,
        isSpam: false,
        deletedAt: null,
      };

      prisma.email.findMany.mockResolvedValue([email1, email2]);
      prisma.email.update.mockResolvedValue({});

      const stats = await service.applyFilterToMessages('f-active', 'user-1');

      expect(stats.filterId).toBe('f-active');
      expect(stats.processedCount).toBe(2);
      expect(stats.affectedCount).toBe(1);

      expect(prisma.email.update).toHaveBeenCalledTimes(1);
      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'em-1' },
        data: {
          labels: ['existing-label', 'lbl-promo'],
          isRead: true,
          isStarred: true,
          folderId: 'fld-archive',
        },
      });
    });

    it('handles delete action by setting deletedAt', async () => {
      const filter = makeFilter({
        id: 'f-spam',
        userId: 'user-1',
        conditions: [{ subjectContains: 'spam lottery' }],
        actions: [{ delete: true }],
      });

      prisma.mailFilter.findUnique.mockResolvedValue(filter);

      const email = {
        id: 'em-spam',
        userId: 'user-1',
        fromAddress: 'unknown@junk.org',
        toAddresses: ['me@quantmail.io'],
        subject: 'You won the spam lottery!',
        bodyPlain: 'Click here',
        bodyHtml: null,
        hasAttachments: false,
        labels: [],
        folderId: 'inbox',
        isRead: false,
        isStarred: false,
        isSpam: false,
        deletedAt: null,
      };

      prisma.email.findMany.mockResolvedValue([email]);
      prisma.email.update.mockResolvedValue({});

      const stats = await service.applyFilterToMessages('f-spam', 'user-1');

      expect(stats.affectedCount).toBe(1);
      expect(prisma.email.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'em-spam' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
