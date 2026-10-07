import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../services/email.service';

function createMockPrisma() {
  return {
    email: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    label: {
      findMany: vi.fn(),
    },
  };
}

describe('E2E Search Flows', () => {
  let service: EmailService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmailService(prisma as never);
  });

  describe('Basic Search', () => {
    it('searches by subject keyword', async () => {
      const emails = [
        {
          id: 'e-1',
          subject: 'Q4 Budget Review',
          bodyPlain: 'Please review',
          fromAddress: 'cfo@company.com',
        },
        {
          id: 'e-2',
          subject: 'Budget Approval Needed',
          bodyPlain: 'Urgent',
          fromAddress: 'manager@company.com',
        },
      ];
      prisma.email.findMany.mockResolvedValue(emails);
      prisma.email.count.mockResolvedValue(2);

      const result = await service.search('user-1', 'Budget');

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('searches by sender email address', async () => {
      const emails = [{ id: 'e-1', subject: 'Hello', fromAddress: 'alice@startup.io' }];
      prisma.email.findMany.mockResolvedValue(emails);
      prisma.email.count.mockResolvedValue(1);

      const result = await service.search('user-1', 'alice@startup');

      expect(result.data).toHaveLength(1);
      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            OR: expect.arrayContaining([
              expect.objectContaining({
                fromAddress: { contains: 'alice@startup', mode: 'insensitive' },
              }),
            ]),
          }),
        }),
      );
    });

    it('searches by body content', async () => {
      const emails = [
        { id: 'e-1', subject: 'Meeting', bodyPlain: 'Let us discuss the quarterly results' },
      ];
      prisma.email.findMany.mockResolvedValue(emails);
      prisma.email.count.mockResolvedValue(1);

      const result = await service.search('user-1', 'quarterly results');

      expect(result.data).toHaveLength(1);
    });

    it('searches by sender name', async () => {
      const emails = [{ id: 'e-1', subject: 'Hi', fromAddress: 'jd@co.com', fromName: 'John Doe' }];
      prisma.email.findMany.mockResolvedValue(emails);
      prisma.email.count.mockResolvedValue(1);

      const result = await service.search('user-1', 'John Doe');

      expect(result.data).toHaveLength(1);
    });

    it('returns empty for non-matching query', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      const result = await service.search('user-1', 'xyznonexistent123');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('Search Pagination', () => {
    it('returns first page of results', async () => {
      const emails = Array.from({ length: 20 }, (_, i) => ({
        id: `e-${i}`,
        subject: `Email ${i}`,
      }));
      prisma.email.findMany.mockResolvedValue(emails);
      prisma.email.count.mockResolvedValue(50);

      const result = await service.search('user-1', 'test', { page: 1, pageSize: 20 });

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(50);
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
    });

    it('returns middle page with both hasNext and hasPrev', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(50);

      const result = await service.search('user-1', 'test', { page: 2, pageSize: 20 });

      expect(result.page).toBe(2);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(true);
    });

    it('returns last page with hasPrev but not hasNext', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(50);

      const result = await service.search('user-1', 'test', { page: 3, pageSize: 20 });

      expect(result.page).toBe(3);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });

    it('uses default pagination when not specified', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      const result = await service.search('user-1', 'test');

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });
  });

  describe('Search Excludes Deleted', () => {
    it('filters out soft-deleted emails from search results', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await service.search('user-1', 'test');

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });
  });

  describe('Search Isolation Between Users', () => {
    it('only returns results for the requesting user', async () => {
      prisma.email.findMany.mockResolvedValue([]);
      prisma.email.count.mockResolvedValue(0);

      await service.search('user-1', 'confidential');

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
          }),
        }),
      );
    });
  });

  describe('Search via searchEmails Alias', () => {
    it('delegates to the search method correctly', async () => {
      const emails = [{ id: 'e-1', subject: 'Important' }];
      prisma.email.findMany.mockResolvedValue(emails);
      prisma.email.count.mockResolvedValue(1);

      const result = await service.searchEmails('user-1', 'Important', { page: 1, pageSize: 10 });

      expect(result.data).toEqual(emails);
      expect(result.total).toBe(1);
    });
  });
});
