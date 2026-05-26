import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PullRequestService } from '../services/pr.service';

function createMockPrisma() {
  return {
    pullRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('PullRequestService', () => {
  let service: PullRequestService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new PullRequestService(prisma as never);
  });

  describe('createPR', () => {
    it('creates a PR with auto-incrementing number', async () => {
      prisma.pullRequest.count.mockResolvedValue(3);
      const mockPR = {
        id: 'pr-1',
        repoId: 'repo-1',
        number: 4,
        title: 'Add feature',
        body: 'Description',
        authorId: 'user-1',
        status: 'OPEN',
        sourceBranch: 'feature/new',
        targetBranch: 'main',
        createdAt: new Date(),
      };
      prisma.pullRequest.create.mockResolvedValue(mockPR);

      const result = await service.createPR({
        repoId: 'repo-1',
        title: 'Add feature',
        body: 'Description',
        authorId: 'user-1',
        sourceBranch: 'feature/new',
        targetBranch: 'main',
      });

      expect(result.number).toBe(4);
      expect(result.status).toBe('OPEN');
      expect(prisma.pullRequest.count).toHaveBeenCalledWith({
        where: { repoId: 'repo-1' },
      });
      expect(prisma.pullRequest.create).toHaveBeenCalledWith({
        data: {
          repoId: 'repo-1',
          number: 4,
          title: 'Add feature',
          body: 'Description',
          authorId: 'user-1',
          status: 'OPEN',
          sourceBranch: 'feature/new',
          targetBranch: 'main',
        },
      });
    });

    it('sets body to null when not provided', async () => {
      prisma.pullRequest.count.mockResolvedValue(0);
      prisma.pullRequest.create.mockResolvedValue({
        id: 'pr-1',
        number: 1,
        body: null,
        status: 'OPEN',
      });

      await service.createPR({
        repoId: 'repo-1',
        title: 'Quick fix',
        authorId: 'user-1',
        sourceBranch: 'fix/bug',
        targetBranch: 'main',
      });

      expect(prisma.pullRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ body: null, number: 1 }),
      });
    });
  });

  describe('listPRs', () => {
    it('lists PRs for a repo without filters', async () => {
      const mockPRs = [
        { id: 'pr-1', number: 1, status: 'OPEN' },
        { id: 'pr-2', number: 2, status: 'MERGED' },
      ];
      prisma.pullRequest.findMany.mockResolvedValue(mockPRs);

      const result = await service.listPRs('repo-1');

      expect(result).toHaveLength(2);
      expect(prisma.pullRequest.findMany).toHaveBeenCalledWith({
        where: { repoId: 'repo-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('filters PRs by status', async () => {
      prisma.pullRequest.findMany.mockResolvedValue([{ id: 'pr-1', status: 'OPEN' }]);

      const result = await service.listPRs('repo-1', { status: 'OPEN' });

      expect(result).toHaveLength(1);
      expect(prisma.pullRequest.findMany).toHaveBeenCalledWith({
        where: { repoId: 'repo-1', status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getPR', () => {
    it('returns a PR by repo and number', async () => {
      const mockPR = { id: 'pr-1', repoId: 'repo-1', number: 1, title: 'Test PR' };
      prisma.pullRequest.findUnique.mockResolvedValue(mockPR);

      const result = await service.getPR('repo-1', 1);

      expect(result).toEqual(mockPR);
      expect(prisma.pullRequest.findUnique).toHaveBeenCalledWith({
        where: { repoId_number: { repoId: 'repo-1', number: 1 } },
      });
    });

    it('throws 404 when PR not found', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(service.getPR('repo-1', 999)).rejects.toThrow('Pull request not found');
    });
  });

  describe('mergePR', () => {
    it('merges an open PR with squash strategy', async () => {
      const mockPR = { id: 'pr-1', repoId: 'repo-1', number: 1, status: 'OPEN' };
      prisma.pullRequest.findUnique.mockResolvedValue(mockPR);
      prisma.pullRequest.update.mockResolvedValue({
        ...mockPR,
        status: 'MERGED',
        mergeStrategy: 'SQUASH',
        mergedAt: new Date(),
      });

      const result = await service.mergePR('repo-1', 1, { strategy: 'SQUASH' });

      expect(result.status).toBe('MERGED');
      expect(result.mergeStrategy).toBe('SQUASH');
      expect(prisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: {
          status: 'MERGED',
          mergeStrategy: 'SQUASH',
          mergedAt: expect.any(Date),
        },
      });
    });

    it('throws 409 when PR is already merged', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue({
        id: 'pr-1',
        status: 'MERGED',
      });

      await expect(service.mergePR('repo-1', 1, { strategy: 'MERGE' })).rejects.toThrow(
        'Pull request is not open',
      );
    });

    it('throws 404 when PR not found', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(service.mergePR('repo-1', 1, { strategy: 'REBASE' })).rejects.toThrow(
        'Pull request not found',
      );
    });
  });

  describe('closePR', () => {
    it('closes an open PR', async () => {
      const mockPR = { id: 'pr-1', repoId: 'repo-1', number: 1, status: 'OPEN' };
      prisma.pullRequest.findUnique.mockResolvedValue(mockPR);
      prisma.pullRequest.update.mockResolvedValue({
        ...mockPR,
        status: 'CLOSED',
        closedAt: new Date(),
      });

      const result = await service.closePR('repo-1', 1);

      expect(result.status).toBe('CLOSED');
      expect(result.closedAt).toBeInstanceOf(Date);
      expect(prisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: {
          status: 'CLOSED',
          closedAt: expect.any(Date),
        },
      });
    });

    it('throws 404 when PR not found', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(service.closePR('repo-1', 5)).rejects.toThrow('Pull request not found');
    });
  });

  describe('getDiff', () => {
    it('returns a diff string for an existing PR', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue({
        id: 'pr-1',
        repoId: 'repo-1',
        number: 1,
      });

      const result = await service.getDiff('repo-1', 1);

      expect(result).toContain('diff --git');
      expect(result).toContain('-old line');
      expect(result).toContain('+new line');
    });

    it('throws 404 when PR not found', async () => {
      prisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(service.getDiff('repo-1', 99)).rejects.toThrow('Pull request not found');
    });
  });
});
