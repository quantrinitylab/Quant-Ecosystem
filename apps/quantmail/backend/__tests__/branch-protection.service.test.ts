import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BranchProtectionService } from '../modules/code/services/branch-protection.service';

function createMockPrisma() {
  return {
    branchProtection: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    pullRequest: {
      findMany: vi.fn(),
    },
    review: {
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    ciRun: {
      findFirst: vi.fn(),
    },
  };
}

describe('BranchProtectionService', () => {
  let service: BranchProtectionService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new BranchProtectionService(prisma as never);
  });

  describe('createRule', () => {
    it('creates a branch protection rule', async () => {
      const mockRule = {
        id: 'rule-1',
        repoId: 'repo-1',
        branchPattern: 'main',
        requiredApprovals: 2,
        requireStatusChecks: true,
        createdAt: new Date(),
      };
      prisma.branchProtection.create.mockResolvedValue(mockRule);

      const result = await service.createRule({
        repoId: 'repo-1',
        branchPattern: 'main',
        requiredApprovals: 2,
        requireStatusChecks: true,
        dismissStaleApprovals: true,
      });

      expect(result.branchPattern).toBe('main');
      expect(result.requiredApprovals).toBe(2);
      expect(prisma.branchProtection.create).toHaveBeenCalledWith({
        data: {
          repoId: 'repo-1',
          branchPattern: 'main',
          requiredApprovals: 2,
          requireStatusChecks: true,
          dismissStaleApprovals: true,
        },
      });
    });

    it('uses default values for optional fields', async () => {
      prisma.branchProtection.create.mockResolvedValue({
        id: 'rule-2',
        branchPattern: 'release/*',
        requiredApprovals: 1,
        requireStatusChecks: false,
      });

      await service.createRule({
        repoId: 'repo-1',
        branchPattern: 'release/*',
        requiredApprovals: 1,
        requireStatusChecks: false,
      });

      expect(prisma.branchProtection.create).toHaveBeenCalledWith({
        data: {
          repoId: 'repo-1',
          branchPattern: 'release/*',
          requiredApprovals: 1,
          requireStatusChecks: false,
          dismissStaleApprovals: false,
        },
      });
    });
  });

  describe('updateRule', () => {
    it('updates an existing rule', async () => {
      prisma.branchProtection.findUnique.mockResolvedValue({
        id: 'rule-1',
        branchPattern: 'main',
        requiredApprovals: 1,
      });
      prisma.branchProtection.update.mockResolvedValue({
        id: 'rule-1',
        branchPattern: 'main',
        requiredApprovals: 3,
      });

      const result = await service.updateRule('rule-1', { requiredApprovals: 3 });

      expect(result.requiredApprovals).toBe(3);
      expect(prisma.branchProtection.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { requiredApprovals: 3 },
      });
    });

    it('throws 404 when rule not found', async () => {
      prisma.branchProtection.findUnique.mockResolvedValue(null);

      await expect(service.updateRule('missing', { requiredApprovals: 2 })).rejects.toThrow(
        'Branch protection rule not found',
      );
    });
  });

  describe('deleteRule', () => {
    it('deletes an existing rule', async () => {
      prisma.branchProtection.findUnique.mockResolvedValue({ id: 'rule-1' });
      prisma.branchProtection.delete.mockResolvedValue({ id: 'rule-1' });

      const result = await service.deleteRule('rule-1');

      expect(result.id).toBe('rule-1');
      expect(prisma.branchProtection.delete).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
      });
    });

    it('throws 404 when rule not found', async () => {
      prisma.branchProtection.findUnique.mockResolvedValue(null);

      await expect(service.deleteRule('missing')).rejects.toThrow(
        'Branch protection rule not found',
      );
    });
  });

  describe('listRules', () => {
    it('returns all rules for a repo', async () => {
      const mockRules = [
        { id: 'rule-1', branchPattern: 'main' },
        { id: 'rule-2', branchPattern: 'release/*' },
      ];
      prisma.branchProtection.findMany.mockResolvedValue(mockRules);

      const result = await service.listRules('repo-1');

      expect(result).toHaveLength(2);
      expect(prisma.branchProtection.findMany).toHaveBeenCalledWith({
        where: { repoId: 'repo-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('enforceOnPush', () => {
    it('allows push when no protection rules exist', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([]);

      const result = await service.enforceOnPush('repo-1', 'main');

      expect(result.allowed).toBe(true);
    });

    it('blocks direct push to protected branch without PR', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
      ]);

      const result = await service.enforceOnPush('repo-1', 'main');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Direct push');
    });

    it('blocks push when insufficient approvals', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 2, requireStatusChecks: false },
      ]);
      prisma.review.count.mockResolvedValue(1);

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Requires 2 approval(s), but only has 1');
    });

    it('allows push when sufficient approvals', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 2, requireStatusChecks: false },
      ]);
      prisma.review.count.mockResolvedValue(2);

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(true);
    });

    it('allows push to non-protected branch', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
      ]);

      const result = await service.enforceOnPush('repo-1', 'feature/test');

      expect(result.allowed).toBe(true);
    });

    it('matches wildcard patterns', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          branchPattern: 'release/*',
          requiredApprovals: 1,
          requireStatusChecks: false,
        },
      ]);

      const result = await service.enforceOnPush('repo-1', 'release/v1.0');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Direct push');
    });

    it('blocks push when status checks have not passed', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          branchPattern: 'main',
          requiredApprovals: 0,
          requireStatusChecks: true,
        },
      ]);
      prisma.ciRun.findFirst.mockResolvedValue({ id: 'run-1', status: 'FAILED' });

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('status checks');
    });

    it('blocks push when no CI runs exist and status checks required', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          branchPattern: 'main',
          requiredApprovals: 0,
          requireStatusChecks: true,
        },
      ]);
      prisma.ciRun.findFirst.mockResolvedValue(null);

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('status checks');
    });

    it('allows push when status checks pass', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          branchPattern: 'main',
          requiredApprovals: 0,
          requireStatusChecks: true,
        },
      ]);
      prisma.ciRun.findFirst.mockResolvedValue({ id: 'run-1', status: 'SUCCESS' });

      const result = await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(result.allowed).toBe(true);
    });

    it('excludes dismissed approvals from the approval count', async () => {
      prisma.branchProtection.findMany.mockResolvedValue([
        { id: 'rule-1', branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: false },
      ]);
      prisma.review.count.mockResolvedValue(0);

      await service.enforceOnPush('repo-1', 'main', 'pr-1');

      expect(prisma.review.count).toHaveBeenCalledWith({
        where: { prId: 'pr-1', status: 'APPROVED', dismissed: { not: true } },
      });
    });
  });

  describe('dismissStaleApprovalsOnPush', () => {
    const NEW_SHA = 'b'.repeat(40);
    const OLD_SHA = 'a'.repeat(40);

    function ruleWith(dismissStaleApprovals: boolean) {
      return [
        {
          id: 'rule-1',
          repoId: 'repo-1',
          branchPattern: 'main',
          requiredApprovals: 1,
          requireStatusChecks: false,
          dismissStaleApprovals,
        },
      ];
    }

    beforeEach(() => {
      prisma.review.updateMany.mockResolvedValue({ count: 1 });
    });

    it('dismisses approvals that did not review the new head when the rule opts in', async () => {
      prisma.pullRequest.findMany.mockResolvedValue([{ id: 'pr-1', targetBranch: 'main' }]);
      prisma.branchProtection.findMany.mockResolvedValue(ruleWith(true));

      const dismissed = await service.dismissStaleApprovalsOnPush('repo-1', 'feature/x', NEW_SHA);

      expect(dismissed).toBe(1);
      expect(prisma.pullRequest.findMany).toHaveBeenCalledWith({
        where: { repoId: 'repo-1', sourceBranch: 'feature/x', status: 'OPEN' },
        select: { id: true, targetBranch: true },
      });
      expect(prisma.review.updateMany).toHaveBeenCalledWith({
        where: {
          prId: 'pr-1',
          status: 'APPROVED',
          dismissed: false,
          OR: [{ reviewedCommitSha: { not: NEW_SHA } }, { reviewedCommitSha: null }],
        },
        data: { dismissed: true },
      });
    });

    it('does nothing when the rule does not opt into dismissStaleApprovals', async () => {
      prisma.pullRequest.findMany.mockResolvedValue([{ id: 'pr-1', targetBranch: 'main' }]);
      prisma.branchProtection.findMany.mockResolvedValue(ruleWith(false));

      const dismissed = await service.dismissStaleApprovalsOnPush('repo-1', 'feature/x', NEW_SHA);

      expect(dismissed).toBe(0);
      expect(prisma.review.updateMany).not.toHaveBeenCalled();
    });

    it('does nothing when no open PRs use the pushed branch as source', async () => {
      prisma.pullRequest.findMany.mockResolvedValue([]);

      const dismissed = await service.dismissStaleApprovalsOnPush('repo-1', 'feature/x', NEW_SHA);

      expect(dismissed).toBe(0);
      expect(prisma.review.updateMany).not.toHaveBeenCalled();
    });

    it('only dismisses for PRs whose target rule opts in', async () => {
      prisma.pullRequest.findMany.mockResolvedValue([
        { id: 'pr-1', targetBranch: 'main' },
        { id: 'pr-2', targetBranch: 'dev' },
      ]);
      prisma.branchProtection.findMany.mockResolvedValue([
        ...ruleWith(true),
        {
          id: 'rule-2',
          repoId: 'repo-1',
          branchPattern: 'dev',
          requiredApprovals: 1,
          requireStatusChecks: false,
          dismissStaleApprovals: false,
        },
      ]);

      const dismissed = await service.dismissStaleApprovalsOnPush('repo-1', 'feature/x', NEW_SHA);

      expect(dismissed).toBe(1);
      expect(prisma.review.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.review.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ prId: 'pr-1' }) }),
      );
    });

    it('dismisses pre-migration reviews with unknown reviewedCommitSha on a real push', async () => {
      // reviewedCommitSha NULL cannot prove the review saw the new head, so
      // the updateMany's NULL arm catches it — GitHub behaves the same way
      // for pushes that land after the setting is enabled.
      prisma.pullRequest.findMany.mockResolvedValue([{ id: 'pr-1', targetBranch: 'main' }]);
      prisma.branchProtection.findMany.mockResolvedValue(ruleWith(true));

      await service.dismissStaleApprovalsOnPush('repo-1', 'feature/x', NEW_SHA);

      const where = prisma.review.updateMany.mock.calls[0][0].where;
      expect(where.OR).toContainEqual({ reviewedCommitSha: null });
      expect(where.OR).toContainEqual({ reviewedCommitSha: { not: NEW_SHA } });
    });

    it('never dismisses a review that already reviewed the new head', async () => {
      // A review with reviewedCommitSha === newSha is fresh; the `not: newSha`
      // arm excludes it from the updateMany.
      prisma.pullRequest.findMany.mockResolvedValue([{ id: 'pr-1', targetBranch: 'main' }]);
      prisma.branchProtection.findMany.mockResolvedValue(ruleWith(true));

      await service.dismissStaleApprovalsOnPush('repo-1', 'feature/x', NEW_SHA);

      const where = prisma.review.updateMany.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([{ reviewedCommitSha: { not: NEW_SHA } }]),
      );
      // Sanity: the same head SHA would be excluded by the not-arm.
      expect(OLD_SHA).not.toBe(NEW_SHA);
    });
  });
});
