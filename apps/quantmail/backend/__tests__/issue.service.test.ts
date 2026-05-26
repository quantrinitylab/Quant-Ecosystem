import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IssueService } from '../services/issue.service';

function createMockPrisma() {
  return {
    issue: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('IssueService', () => {
  let service: IssueService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new IssueService(prisma as never);
  });

  describe('createIssue', () => {
    it('creates an issue with auto-incrementing number', async () => {
      prisma.issue.count.mockResolvedValue(5);
      const mockIssue = {
        id: 'issue-1',
        repoId: 'repo-1',
        number: 6,
        title: 'Bug report',
        body: 'Something is broken',
        authorId: 'user-1',
        status: 'OPEN',
        labels: ['bug'],
        assignees: [],
        createdAt: new Date(),
      };
      prisma.issue.create.mockResolvedValue(mockIssue);

      const result = await service.createIssue({
        repoId: 'repo-1',
        title: 'Bug report',
        body: 'Something is broken',
        authorId: 'user-1',
        labels: ['bug'],
      });

      expect(result.number).toBe(6);
      expect(result.status).toBe('OPEN');
      expect(prisma.issue.count).toHaveBeenCalledWith({
        where: { repoId: 'repo-1' },
      });
      expect(prisma.issue.create).toHaveBeenCalledWith({
        data: {
          repoId: 'repo-1',
          number: 6,
          title: 'Bug report',
          body: 'Something is broken',
          authorId: 'user-1',
          status: 'OPEN',
          labels: ['bug'],
          assignees: [],
        },
      });
    });

    it('creates an issue without optional fields', async () => {
      prisma.issue.count.mockResolvedValue(0);
      prisma.issue.create.mockResolvedValue({
        id: 'issue-2',
        number: 1,
        body: null,
        labels: [],
        assignees: [],
        status: 'OPEN',
      });

      await service.createIssue({
        repoId: 'repo-1',
        title: 'Simple issue',
        authorId: 'user-1',
      });

      expect(prisma.issue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: null,
          labels: [],
          assignees: [],
          number: 1,
        }),
      });
    });
  });

  describe('listIssues', () => {
    it('lists issues for a repo without filters', async () => {
      const mockIssues = [
        { id: 'issue-1', number: 1, status: 'OPEN' },
        { id: 'issue-2', number: 2, status: 'CLOSED' },
      ];
      prisma.issue.findMany.mockResolvedValue(mockIssues);

      const result = await service.listIssues('repo-1');

      expect(result).toHaveLength(2);
      expect(prisma.issue.findMany).toHaveBeenCalledWith({
        where: { repoId: 'repo-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('filters issues by status', async () => {
      prisma.issue.findMany.mockResolvedValue([{ id: 'issue-1', status: 'OPEN' }]);

      const result = await service.listIssues('repo-1', { status: 'OPEN' });

      expect(result).toHaveLength(1);
      expect(prisma.issue.findMany).toHaveBeenCalledWith({
        where: { repoId: 'repo-1', status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getIssue', () => {
    it('returns an issue by repo and number', async () => {
      const mockIssue = { id: 'issue-1', repoId: 'repo-1', number: 1, title: 'Bug' };
      prisma.issue.findUnique.mockResolvedValue(mockIssue);

      const result = await service.getIssue('repo-1', 1);

      expect(result).toEqual(mockIssue);
      expect(prisma.issue.findUnique).toHaveBeenCalledWith({
        where: { repoId_number: { repoId: 'repo-1', number: 1 } },
      });
    });

    it('throws 404 when issue not found', async () => {
      prisma.issue.findUnique.mockResolvedValue(null);

      await expect(service.getIssue('repo-1', 999)).rejects.toThrow('Issue not found');
    });
  });

  describe('labelIssue', () => {
    it('updates labels on an issue', async () => {
      prisma.issue.findUnique.mockResolvedValue({ id: 'issue-1', repoId: 'repo-1', number: 1 });
      prisma.issue.update.mockResolvedValue({
        id: 'issue-1',
        labels: ['bug', 'priority:high'],
      });

      const result = await service.labelIssue('repo-1', 1, ['bug', 'priority:high']);

      expect(result.labels).toEqual(['bug', 'priority:high']);
      expect(prisma.issue.update).toHaveBeenCalledWith({
        where: { id: 'issue-1' },
        data: { labels: ['bug', 'priority:high'] },
      });
    });

    it('throws 404 when issue not found', async () => {
      prisma.issue.findUnique.mockResolvedValue(null);

      await expect(service.labelIssue('repo-1', 99, ['bug'])).rejects.toThrow('Issue not found');
    });
  });

  describe('assignIssue', () => {
    it('updates assignees on an issue', async () => {
      prisma.issue.findUnique.mockResolvedValue({ id: 'issue-1', repoId: 'repo-1', number: 1 });
      prisma.issue.update.mockResolvedValue({
        id: 'issue-1',
        assignees: ['user-2', 'user-3'],
      });

      const result = await service.assignIssue('repo-1', 1, ['user-2', 'user-3']);

      expect(result.assignees).toEqual(['user-2', 'user-3']);
      expect(prisma.issue.update).toHaveBeenCalledWith({
        where: { id: 'issue-1' },
        data: { assignees: ['user-2', 'user-3'] },
      });
    });

    it('throws 404 when issue not found', async () => {
      prisma.issue.findUnique.mockResolvedValue(null);

      await expect(service.assignIssue('repo-1', 99, ['user-1'])).rejects.toThrow(
        'Issue not found',
      );
    });
  });

  describe('closeIssue', () => {
    it('closes an open issue', async () => {
      prisma.issue.findUnique.mockResolvedValue({ id: 'issue-1', repoId: 'repo-1', number: 1 });
      prisma.issue.update.mockResolvedValue({
        id: 'issue-1',
        status: 'CLOSED',
        closedAt: new Date(),
      });

      const result = await service.closeIssue('repo-1', 1);

      expect(result.status).toBe('CLOSED');
      expect(result.closedAt).toBeInstanceOf(Date);
      expect(prisma.issue.update).toHaveBeenCalledWith({
        where: { id: 'issue-1' },
        data: {
          status: 'CLOSED',
          closedAt: expect.any(Date),
        },
      });
    });

    it('throws 404 when issue not found', async () => {
      prisma.issue.findUnique.mockResolvedValue(null);

      await expect(service.closeIssue('repo-1', 99)).rejects.toThrow('Issue not found');
    });
  });

  describe('reopenIssue', () => {
    it('reopens a closed issue', async () => {
      prisma.issue.findUnique.mockResolvedValue({
        id: 'issue-1',
        repoId: 'repo-1',
        number: 1,
        status: 'CLOSED',
      });
      prisma.issue.update.mockResolvedValue({
        id: 'issue-1',
        status: 'OPEN',
        closedAt: null,
      });

      const result = await service.reopenIssue('repo-1', 1);

      expect(result.status).toBe('OPEN');
      expect(result.closedAt).toBeNull();
      expect(prisma.issue.update).toHaveBeenCalledWith({
        where: { id: 'issue-1' },
        data: {
          status: 'OPEN',
          closedAt: null,
        },
      });
    });

    it('throws 404 when issue not found', async () => {
      prisma.issue.findUnique.mockResolvedValue(null);

      await expect(service.reopenIssue('repo-1', 99)).rejects.toThrow('Issue not found');
    });
  });
});
